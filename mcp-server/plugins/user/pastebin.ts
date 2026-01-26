/**
 * Pastebin Plugin - Save content to pastebin
 * 
 * Supports uploading text, URLs (as redirects or downloaded content), 
 * and blob URLs from browser tabs.
 */

import { definePlugin, z } from "../types";

// Pastebin configuration
const PASTEBIN_URL = process.env.PASTEBIN_URL || "https://shz.al/";

// Encryption utilities (matching the reference implementation)
function concat(buffer1: Uint8Array, buffer2: Uint8Array): Uint8Array {
    const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
    tmp.set(buffer1, 0);
    tmp.set(buffer2, buffer1.byteLength);
    return tmp;
}

function base64VariantEncode(src: Uint8Array): string {
    let binaryString = "";
    for (let i = 0; i < src.length; i++) {
        binaryString += String.fromCharCode(src[i]);
    }
    return Buffer.from(binaryString, "binary")
        .toString("base64")
        .replaceAll("/", "_")
        .replaceAll("=", "");
}

async function generateKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

async function encryptContent(key: CryptoKey, content: string | Buffer): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const msgBytes = typeof content === "string"
        ? new TextEncoder().encode(content)
        : new Uint8Array(content);
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        msgBytes
    );
    // IV must come FIRST, then ciphertext (matches server-side decryption order)
    return concat(iv, new Uint8Array(ciphertext));
}

async function encodeKey(key: CryptoKey): Promise<string> {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    return base64VariantEncode(raw);
}

// Check if a string is a single-line URL
function isSingleLineUrl(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.includes("\n")) return false;
    try {
        new URL(trimmed);
        return true;
    } catch {
        return false;
    }
}

interface PastebinResponse {
    url: string;
    manageUrl: string;
    expirationSeconds: number;
    expireAt: string;
}

export default definePlugin({
    metadata: {
        name: "pastebin",
        version: "1.0.0",
        description: "Save content to pastebin (text, URLs, blob resources)",
    },
    tools: [
        {
            name: "save-to-pastebin",
            description: `Upload content to pastebin and return the URL.

Content types:
- text: Direct text content. If single-line URL, creates a redirect
- url: Download from URL and upload. For blob: URLs, requires tabId
- blob: Direct binary data (from fetch-url tool)

Options:
- expiration: Time until paste expires (e.g., "7d", "1h", "30m")
- filename: Custom filename for the upload
- encrypt: Enable AES-GCM client-side encryption`,
            schema: z.object({
                text: z.string().optional()
                    .describe("Text content. Single-line URL = redirect"),
                url: z.string().optional()
                    .describe("URL to download and upload. blob: URLs require tabId"),
                tabId: z.number().optional()
                    .describe("Tab ID for blob URL resolution"),
                expiration: z.string().default("7d")
                    .describe("Expiration time (e.g., '7d', '1h', '30m')"),
                filename: z.string().optional()
                    .describe("Filename for the upload"),
                encrypt: z.boolean().default(false)
                    .describe("Enable AES-GCM encryption"),
                blob: z.object({
                    data: z.string().describe("Base64 encoded binary data"),
                    mimeType: z.string().optional().describe("MIME type of the data"),
                    filename: z.string().optional().describe("Filename for the upload"),
                }).optional()
                    .describe("Direct blob data from fetch-url tool"),
            }),
            handler: async ({ text, url, tabId, expiration, filename, encrypt, blob }, ctx) => {
                // Validate input: exactly one of text, url, or blob must be provided
                const inputs = [text, url, blob].filter(Boolean).length;
                if (inputs === 0) {
                    return {
                        content: [{ type: "text" as const, text: "Error: One of 'text', 'url', or 'blob' must be provided", isError: true }],
                    };
                }
                if (inputs > 1) {
                    return {
                        content: [{ type: "text" as const, text: "Error: Provide only one of 'text', 'url', or 'blob'", isError: true }],
                    };
                }

                // Validate blob URL requires tabId
                if (url?.startsWith("blob:") && !tabId) {
                    return {
                        content: [{ type: "text" as const, text: "Error: blob: URLs require tabId parameter", isError: true }],
                    };
                }

                let content: string | Buffer;
                let contentFilename = filename;
                let isRedirect = false;

                try {
                    if (text) {
                        // Check if it's a single-line URL (redirect)
                        if (isSingleLineUrl(text)) {
                            isRedirect = true;
                            content = text.trim();
                        } else {
                            content = text;
                        }
                    } else if (url) {
                        if (url.startsWith("blob:")) {
                            // Fetch blob content from browser tab
                            ctx.logger.info(`Fetching blob URL from tab ${tabId}: ${url}`);
                            const blobResult = await ctx.browserApi.fetchBlobUrl(tabId!, url);

                            if (blobResult.error) {
                                return {
                                    content: [{ type: "text" as const, text: `Error: Failed to fetch blob URL: ${blobResult.error}`, isError: true }],
                                };
                            }

                            if (!blobResult.data) {
                                return {
                                    content: [{ type: "text" as const, text: "Error: No data received from blob URL", isError: true }],
                                };
                            }

                            // Decode base64 data
                            content = Buffer.from(blobResult.data, "base64");

                            // Try to determine filename from mimeType if not provided
                            if (!contentFilename && blobResult.mimeType) {
                                const ext = blobResult.mimeType.split("/")[1] || "bin";
                                contentFilename = `blob.${ext}`;
                            }

                            ctx.logger.info(`Blob URL fetched: ${blobResult.size} bytes, type: ${blobResult.mimeType}`);
                        } else {
                            // Download from URL
                            ctx.logger.info(`Downloading from URL: ${url}`);
                            const response = await fetch(url);
                            if (!response.ok) {
                                return {
                                    content: [{ type: "text" as const, text: `Error: Failed to download from URL: ${response.status} ${response.statusText}`, isError: true }],
                                };
                            }

                            // Get content as buffer
                            const arrayBuffer = await response.arrayBuffer();
                            content = Buffer.from(arrayBuffer);

                            // Try to extract filename from URL if not provided
                            if (!contentFilename) {
                                const urlPath = new URL(url).pathname;
                                const urlFilename = urlPath.split("/").pop();
                                if (urlFilename && urlFilename.includes(".")) {
                                    contentFilename = urlFilename;
                                }
                            }
                        }
                    } else if (blob) {
                        // Use direct blob data
                        ctx.logger.info(`Using direct blob data: ${blob.data.length} chars base64`);
                        content = Buffer.from(blob.data, "base64");

                        // Use blob's filename if not overridden
                        if (!contentFilename && blob.filename) {
                            contentFilename = blob.filename;
                        }
                        // Try to determine filename from mimeType if still not set
                        if (!contentFilename && blob.mimeType) {
                            const ext = blob.mimeType.split("/")[1] || "bin";
                            contentFilename = `blob.${ext}`;
                        }
                    } else {
                        return {
                            content: [{ type: "text" as const, text: "Error: No content provided", isError: true }],
                        };
                    }

                    // Prepare FormData
                    const formData = new FormData();
                    let keyFragment = "";

                    if (encrypt && !isRedirect) {
                        // Encrypt content
                        const key = await generateKey();
                        const encrypted = await encryptContent(key, content);
                        // Create new Uint8Array to ensure ArrayBuffer type (not ArrayBufferLike)
                        const blob = new Blob([new Uint8Array(encrypted)], { type: "application/octet-stream" });
                        formData.append("c", blob, contentFilename || "encrypted.bin");
                        formData.append("encryption-scheme", "AES-GCM");
                        keyFragment = "#" + await encodeKey(key);
                    } else {
                        // Plain content
                        if (typeof content === "string") {
                            formData.append("c", content);
                        } else {
                            const blob = new Blob([new Uint8Array(content)]);
                            formData.append("c", blob, contentFilename);
                        }
                    }

                    formData.append("e", expiration);

                    // Upload to pastebin
                    ctx.logger.info(`Uploading to pastebin: ${PASTEBIN_URL}`);
                    const response = await fetch(PASTEBIN_URL, {
                        method: "POST",
                        body: formData,
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        return {
                            content: [{ type: "text" as const, text: `Error: Pastebin upload failed: ${response.status} ${errorText}`, isError: true }],
                        };
                    }

                    const result: PastebinResponse = await response.json();

                    // Build the view URL
                    let viewUrl = result.url;
                    if (encrypt) {
                        // For encrypted content, use /d/ prefix for decryption view
                        viewUrl = result.url.replace(PASTEBIN_URL, PASTEBIN_URL + "d/") + keyFragment;
                    } else if (isRedirect) {
                        // For redirects, use /u/ prefix
                        viewUrl = result.url.replace(PASTEBIN_URL, PASTEBIN_URL + "u/");
                    } else if (contentFilename) {
                        // For files, use /a/ prefix for attachment view
                        viewUrl = result.url.replace(PASTEBIN_URL, PASTEBIN_URL + "a/");
                    }

                    // Format expiration
                    const expiresIn = result.expirationSeconds >= 86400
                        ? `${Math.round(result.expirationSeconds / 86400)} days`
                        : result.expirationSeconds >= 3600
                            ? `${Math.round(result.expirationSeconds / 3600)} hours`
                            : `${Math.round(result.expirationSeconds / 60)} minutes`;

                    return {
                        content: [{
                            type: "text" as const,
                            text: `Uploaded to pastebin:\n` +
                                `- URL: ${viewUrl}\n` +
                                `- Manage URL: ${result.manageUrl}\n` +
                                `- Expires: ${expiresIn} (${result.expireAt})` +
                                (isRedirect ? "\n- Type: Redirect" : "") +
                                (encrypt ? "\n- Encrypted: Yes (AES-GCM)" : ""),
                        }],
                    };

                } catch (error) {
                    ctx.logger.error(`Pastebin upload failed`, { error: String(error) });
                    return {
                        content: [{ type: "text" as const, text: `Error: ${String(error)}`, isError: true }],
                    };
                }
            },
        },
    ],
});
