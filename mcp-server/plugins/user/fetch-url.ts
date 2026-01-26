/**
 * Fetch URL Plugin - Download content from URLs using browser context
 * 
 * Supports downloading various file types (images, PDFs, audio, video, etc.)
 * using browser context for authentication and anti-bot bypass.
 */

import { definePlugin, z } from "../types";
import * as fs from "fs/promises";
import * as path from "path";

export default definePlugin({
    metadata: {
        name: "fetch-url",
        version: "1.0.0",
        description: "Download content from URLs using browser context (handles auth, cookies, anti-bot)",
    },
    tools: [
        {
            name: "fetch-url",
            description: `Download content from a URL. Supports images, PDFs, audio, video, and other binary files.

URL Types:
- http:// / https:// URLs: Regular web resources
- blob: URLs: Requires tabId (fetched from the tab that created the blob)

Features:
- Uses browser context by default (handles auth, cookies, anti-bot protection)
- Can optionally use server-side fetch for direct downloads
- Returns base64 data for use with save-to-pastebin
- Optionally saves to local file

Download Method:
- "browser" (default): Uses Firefox extension, handles authentication and bypasses CORS
- "server": Direct Node.js fetch, faster for large public files but no auth
- "auto": Smart selection based on context (browser-first, auto-fallback)`,
            schema: z.object({
                url: z.string()
                    .describe("URL to download (http://, https://, or blob:)"),
                tabId: z.number().optional()
                    .describe("Tab ID. Required for blob: URLs, optional for others (provides cookies/referrer)."),
                savePath: z.string().optional()
                    .describe("Local path to save file. If not specified, only returns base64 data."),
                returnBlob: z.boolean().default(true)
                    .describe("Return base64 data in response. Set false if only saving to file."),
                downloadMethod: z.enum(["browser", "server", "auto"]).default("auto")
                    .describe("Download method: 'browser' (auth support), 'server' (direct), 'auto' (smart selection)")
            }),
            handler: async ({ url, tabId, savePath, returnBlob, downloadMethod }, ctx) => {
                ctx.logger.info(`Fetching URL: ${url}`, { downloadMethod, tabId, savePath });

                let data: string | undefined;
                let mimeType: string | undefined;
                let size: number | undefined;
                let filename: string | undefined;
                let error: string | undefined;
                let usedMethod: "browser" | "server" | "blob" = "browser";

                // Check if this is a blob: URL
                const isBlobUrl = url.startsWith("blob:");

                if (isBlobUrl) {
                    // blob: URLs must be fetched from within the tab that created them
                    if (!tabId) {
                        return {
                            content: [{ type: "text" as const, text: "Error: blob: URLs require tabId parameter", isError: true }],
                        };
                    }

                    try {
                        ctx.logger.info(`Fetching blob URL from tab ${tabId}`);
                        const blobResult = await ctx.browserApi.fetchBlobUrl(tabId, url);

                        if (blobResult.error) {
                            error = `Failed to fetch blob URL: ${blobResult.error}`;
                        } else if (!blobResult.data) {
                            error = "No data received from blob URL";
                        } else {
                            data = blobResult.data;
                            mimeType = blobResult.mimeType;
                            size = blobResult.size;
                            usedMethod = "blob";

                            // Try to determine filename from mimeType
                            if (mimeType) {
                                const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
                                filename = `blob.${ext}`;
                            }
                        }
                    } catch (e) {
                        error = `Blob fetch exception: ${String(e)}`;
                    }
                } else {
                    // Regular HTTP(S) URL
                    // Determine which method to use
                    const shouldUseBrowser = downloadMethod === "browser" ||
                        (downloadMethod === "auto" && true); // Default to browser for auto

                    if (shouldUseBrowser) {
                        // Try browser-based fetch first
                        try {
                            ctx.logger.info("Using browser-based fetch");
                            const result = await ctx.browserApi.fetchUrl(url, tabId);

                            if (result.error) {
                                // If browser fails and method is "auto", fall back to server
                                if (downloadMethod === "auto") {
                                    ctx.logger.warn(`Browser fetch failed: ${result.error}, falling back to server`);
                                    usedMethod = "server";
                                } else {
                                    error = result.error;
                                }
                            } else {
                                data = result.data;
                                mimeType = result.mimeType;
                                size = result.size;
                                filename = result.filename;
                                usedMethod = "browser";
                            }
                        } catch (e) {
                            // Extension not connected or other error
                            if (downloadMethod === "auto") {
                                ctx.logger.warn(`Browser fetch exception: ${e}, falling back to server`);
                                usedMethod = "server";
                            } else {
                                error = String(e);
                            }
                        }
                    }

                    // Use server-side fetch if explicitly requested or as fallback
                    if (downloadMethod === "server" || (usedMethod === "server" && !error)) {
                        try {
                            ctx.logger.info("Using server-side fetch");
                            const response = await fetch(url);

                            if (!response.ok) {
                                error = `HTTP ${response.status}: ${response.statusText}`;
                            } else {
                                // Get content info
                                mimeType = response.headers.get("content-type")?.split(";")[0].trim() || undefined;

                                // Extract filename from Content-Disposition or URL
                                const contentDisposition = response.headers.get("content-disposition");
                                if (contentDisposition) {
                                    const match = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
                                    if (match) {
                                        filename = decodeURIComponent(match[1]);
                                    }
                                }
                                if (!filename) {
                                    try {
                                        const urlPath = new URL(url).pathname;
                                        const pathFilename = urlPath.split("/").pop();
                                        if (pathFilename && pathFilename.includes(".")) {
                                            filename = decodeURIComponent(pathFilename);
                                        }
                                    } catch (e) {
                                        // Ignore
                                    }
                                }

                                // Read as buffer
                                const arrayBuffer = await response.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);
                                size = buffer.length;
                                data = buffer.toString("base64");
                                usedMethod = "server";
                            }
                        } catch (e) {
                            error = `Server fetch failed: ${String(e)}`;
                        }
                    }
                } // End of else block for non-blob URLs

                // Handle errors
                if (error) {
                    return {
                        content: [{ type: "text" as const, text: `Error: ${error}`, isError: true }],
                    };
                }

                // Save to file if requested
                if (savePath && data) {
                    try {
                        const buffer = Buffer.from(data, "base64");

                        // Ensure directory exists
                        const dir = path.dirname(savePath);
                        await fs.mkdir(dir, { recursive: true });

                        await fs.writeFile(savePath, buffer);
                        ctx.logger.info(`Saved file to: ${savePath}`, { size });
                    } catch (e) {
                        return {
                            content: [{ type: "text" as const, text: `Error saving file: ${String(e)}`, isError: true }],
                        };
                    }
                }

                // Build response
                const resultParts: string[] = [
                    `Downloaded: ${url}`,
                    `- Size: ${size?.toLocaleString() || "unknown"} bytes`,
                    `- Type: ${mimeType || "unknown"}`,
                    `- Filename: ${filename || "unknown"}`,
                    `- Method: ${usedMethod}`,
                ];

                if (savePath) {
                    resultParts.push(`- Saved to: ${savePath}`);
                }

                // Include blob data for use with save-to-pastebin
                const responseContent: any[] = [{
                    type: "text" as const,
                    text: resultParts.join("\n"),
                }];

                // Return blob info as structured data if requested
                if (returnBlob && data) {
                    responseContent.push({
                        type: "text" as const,
                        text: `\n\nBlob data available (${size?.toLocaleString() || "?"} bytes, ${mimeType || "unknown"}).` +
                            `\nUse with save-to-pastebin by passing the blob parameter:` +
                            `\n  blob: { data: "<base64>", mimeType: "${mimeType || ""}", filename: "${filename || ""}" }`,
                    });

                    // Include the actual data as an embedded resource
                    responseContent.push({
                        type: "resource" as const,
                        resource: {
                            uri: `data:${mimeType || "application/octet-stream"};base64,${data.substring(0, 100)}...`,
                            mimeType: mimeType || "application/octet-stream",
                            blob: data,
                            text: JSON.stringify({
                                data,
                                mimeType,
                                size,
                                filename,
                            }),
                        },
                    });
                }

                return {
                    content: responseContent,
                };
            },
        },
    ],
});
