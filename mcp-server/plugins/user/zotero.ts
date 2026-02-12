/**
 * Zotero Plugin for Browser Control MCP
 *
 * Communicates with Zotero desktop client's local HTTP server (port 23119)
 * to save bibliographic items and notes into the user's Zotero library.
 *
 * Uses two APIs:
 * - /connector/* endpoints: for saving items (compatible with Zotero Translation Framework)
 * - /api/* endpoints: for adding notes to existing items (Zotero 7 local REST API)
 */

import { definePlugin, z } from "../types";

// ── Constants ──────────────────────────────────────────────────────────

const ZOTERO_BASE = "http://127.0.0.1:23119";
const CONNECTOR_API_VERSION = "3";

// ── Helpers ────────────────────────────────────────────────────────────

/** Generate a random alphanumeric string (mimics Zotero.Utilities.randomString) */
function randomId(len = 8): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < len; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/** Format current date as Zotero accessDate: "YYYY-MM-DD HH:MM:SS" */
function formatAccessDate(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** Encode string for HTTP headers (RFC 2047) */
function rfc2047Encode(str: string): string {
    // Simple encoding for now, replacing non-ASCII with ? to avoid header issues
    // A full implementation would be more complex but this suffices for titles
    return str.replace(/[^\x00-\x7F]/g, "?");
}

/** Send a request to the Zotero connector API (/connector/*) */
async function connectorFetch(
    method: string,
    body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
    try {
        const res = await fetch(`${ZOTERO_BASE}/connector/${method}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Zotero-Connector-API-Version": CONNECTOR_API_VERSION,
            },
            body: JSON.stringify(body),
        });

        let data: unknown;
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return {
            ok: false,
            status: 0,
            data: null,
            error: `Cannot connect to Zotero: ${String(e)}`,
        };
    }
}

/** Upload a file attachment to Zotero */
async function saveAttachment(
    attachment: { id: string; url: string; title: string; mimeType: string; parentItem: string },
    sessionID: string,
    logger: any
): Promise<boolean> {
    try {
        logger.info(`Downloading attachment: ${attachment.url}`);
        const fileRes = await fetch(attachment.url);
        if (!fileRes.ok) {
            logger.error(`Failed to download attachment ${attachment.url}: ${fileRes.status}`);
            return false;
        }

        const arrayBuffer = await fileRes.arrayBuffer();
        const metadata = JSON.stringify({
            id: attachment.id,
            url: attachment.url,
            contentType: attachment.mimeType,
            parentItemID: attachment.parentItem,
            title: rfc2047Encode(attachment.title),
        });

        logger.info(`Uploading attachment to Zotero: ${attachment.title} (${arrayBuffer.byteLength} bytes)`);
        const res = await fetch(`${ZOTERO_BASE}/connector/saveAttachment?sessionID=${sessionID}`, {
            method: "POST",
            headers: {
                "Content-Type": attachment.mimeType,
                "X-Metadata": metadata,
            },
            body: arrayBuffer,
        });

        if (!res.ok) {
            const txt = await res.text();
            logger.error(`Failed to upload attachment to Zotero: ${res.status} - ${txt}`);
            return false;
        }
        return true;
    } catch (e) {
        logger.error(`Error saving attachment: ${e}`);
        return false;
    }
}

/** Send a request to the Zotero local REST API (/api/*) */
async function apiFetch(
    path: string,
    options: { method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
    try {
        const res = await fetch(`${ZOTERO_BASE}/api${path}`, {
            method: options.method || "GET",
            headers: {
                "Content-Type": "application/json",
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
        });

        let data: unknown;
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return {
            ok: false,
            status: 0,
            data: null,
            error: `Cannot connect to Zotero API: ${String(e)}`,
        };
    }
}

/** Parse author strings into Zotero creator objects */
function parseAuthors(
    authors: string[],
    creatorType = "author"
): Array<Record<string, string>> {
    return authors.map((author): Record<string, string> => {
        const parts = author.trim().split(/\s+/);
        if (parts.length === 1) {
            // Single name — treat as institution/organization
            return { creatorType, name: parts[0] };
        }
        const lastName = parts.pop()!;
        const firstName = parts.join(" ");
        return { creatorType, firstName, lastName };
    });
}

/** Unified logic for saving items and handling attachment uploads */
async function saveItemsWithAttachments(
    items: Record<string, any>[],
    uri: string,
    logger: any
) {
    // 1. Prepare items and separate file attachments
    const uploadQueue: any[] = [];
    const itemsPayload = [];

    // Assign IDs and process items
    for (const item of items) {
        if (!item.id) item.id = randomId(8);
        if (!item.accessDate) item.accessDate = formatAccessDate();
        if (!item.tags) item.tags = [];

        // Handle attachments
        const itemAttachments = item.attachments || [];
        const payloadAttachments = [];

        for (const att of itemAttachments) {
            if (!att.id) att.id = randomId(8);
            att.parentItem = item.id;

            // "file" (imported_url) -> Needs separate upload
            // "link" (linked_url) -> Keep in payload, snapshot: false
            // "linked_file" -> Keep in payload, snapshot: false

            // Default to "file" behavior if no linkMode specified (and it has a URL)
            const isLink = att.linkMode === "linked_url" || att.linkMode === "linked_file" || att.snapshot === false;

            if (isLink) {
                // It's a link, keep in payload
                att.snapshot = false; // Ensure Zotero treats it as link
                payloadAttachments.push(att);
            } else {
                // It's a file to download, queue it and REMOVE from payload
                // (Zotero 6+ logic: file attachments are uploaded separately)
                // We default to "imported_url" implicitly by uploading it
                uploadQueue.push(att);
            }
        }

        item.attachments = payloadAttachments;
        itemsPayload.push(item);
    }

    const sessionID = randomId(8);
    logger.info(`Session ID: ${sessionID}. Items: ${itemsPayload.length}. Uploads queued: ${uploadQueue.length}`);

    // 2. Phase 1: Save Items (Metadata + Links)
    const payload = {
        sessionID,
        uri: uri || (itemsPayload[0]?.url as string) || "",
        items: itemsPayload,
    };

    const result = await connectorFetch("saveItems", payload);
    if (!result.ok) {
        return { success: false, result };
    }

    // 3. Phase 2: Upload File Attachments
    let successCount = 0;
    let failCount = 0;

    // Process uploads in parallel (limit concurrency if needed, but 5-10 is fine)
    await Promise.all(uploadQueue.map(async (att) => {
        const success = await saveAttachment(att, sessionID, logger);
        if (success) successCount++;
        else failCount++;
    }));

    return {
        success: true,
        sessionID,
        items: itemsPayload,
        uploads: { total: uploadQueue.length, success: successCount, failed: failCount }
    };
}


// ── Plugin Definition ──────────────────────────────────────────────────

export default definePlugin({
    metadata: {
        name: "zotero",
        version: "1.1.0",
        description:
            "Save bibliographic items and notes to Zotero desktop client via its local HTTP server",
    },

    tools: [
        // ─── Tool 1: zotero-ping ─────────────────────────────────────────
        {
            name: "zotero-ping",
            description:
                "Check if Zotero desktop is running and get its version. Returns connection status and Zotero version info.",
            schema: z.object({}),
            handler: async (_params, ctx) => {
                ctx.logger.info("Pinging Zotero...");
                const result = await connectorFetch("ping", {});

                if (!result.ok) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Zotero is not reachable. ${result.error || `Status: ${result.status}`}\n\nMake sure Zotero desktop is running.`,
                                isError: true,
                            },
                        ],
                    };
                }

                const info =
                    typeof result.data === "object" && result.data
                        ? JSON.stringify(result.data, null, 2)
                        : String(result.data);

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Zotero is running.\n${info}`,
                        },
                    ],
                };
            },
        },

        // ─── Tool 2: save-to-zotero ──────────────────────────────────────
        {
            name: "save-to-zotero",
            description: `Save items to Zotero. Supports metadata, notes, and attachments (files or links).
Accepts an array of items in Zotero.Item.toArray() format.

Attachments behavior:
- If 'linkMode' is "imported_url" (default for files), the file will be downloaded and stored in Zotero.
- If 'linkMode' is "linked_url" (Web Link) or "linked_file" (Linked File), it is saved as a link.

Notes format: [{ "note": "<p>HTML content</p>" }]
Attachments format: [{ "url": "...", "title": "...", "mimeType": "...", "linkMode": "imported_url"|"linked_url"|"linked_file" }]`,
            schema: z.object({
                items: z
                    .array(z.record(z.unknown()))
                    .describe("Array of items in Zotero item format"),
                uri: z
                    .string()
                    .optional()
                    .describe("Source URI for the items (defaults to first item's url)"),
            }),
            handler: async ({ items, uri }, ctx) => {
                const res = await saveItemsWithAttachments(items, uri || "", ctx.logger);

                if (!res.success) {
                    const result = res.result;
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Failed to save to Zotero. ${result?.error || `Status: ${result?.status}`}\n\nResponse: ${JSON.stringify(result?.data)}`,
                                isError: true,
                            },
                        ],
                    };
                }

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Successfully saved ${res.items?.length} item(s) to Zotero.
Session ID: ${res.sessionID}
Items: ${(res.items || []).map((i: any) => `"${i.title}" (Key: ${i.id})`).join(", ")}
Attachments: ${res.uploads?.success} uploaded, ${res.uploads?.failed} failed`,
                        },
                    ],
                };
            },
        },

        // ─── Tool 3: save-url-to-zotero ──────────────────────────────────
        {
            name: "save-url-to-zotero",
            description: `Save a URL to Zotero with simplified parameters. Handles file downloads automatically.
            
Supported Attachment Types:
- "file": Downloads the file and stores it in Zotero (default).
- "link": Saves as a "Web Link" attachment.
- "linked_file": Links to a local file (path must be accessible to Zotero).`,
            schema: z.object({
                url: z.string().describe("URL of the page to save"),
                title: z.string().describe("Title of the item"),
                itemType: z
                    .string()
                    .default("webpage")
                    .describe("Zotero item type (default: webpage)"),
                authors: z
                    .array(z.string())
                    .optional()
                    .describe('Authors as "FirstName LastName" strings'),
                date: z.string().optional().describe("Publication date"),
                abstractNote: z.string().optional().describe("Abstract or summary"),
                DOI: z.string().optional().describe("Digital Object Identifier"),
                publicationTitle: z
                    .string()
                    .optional()
                    .describe("Journal or publication name"),
                volume: z.string().optional().describe("Volume number"),
                issue: z.string().optional().describe("Issue number"),
                pages: z.string().optional().describe("Page range"),
                language: z.string().optional().describe("Language code"),
                tags: z.array(z.string()).optional().describe("Tags for the item"),
                notes: z
                    .array(z.string())
                    .optional()
                    .describe("Notes to attach (plain text or HTML)"),
                attachmentUrls: z
                    .array(
                        z.object({
                            url: z.string(),
                            title: z.string().optional(),
                            mimeType: z.string().optional(),
                            type: z.enum(["file", "link", "linked_file"]).default("file").describe("Attachment type: file (download), link (web link), or linked_file (local path)"),
                        })
                    )
                    .optional()
                    .describe("Attachment URLs"),
            }),
            handler: async (params, ctx) => {
                ctx.logger.info(`Saving URL to Zotero: ${params.url}`);

                // Build item in Zotero.Item.toArray() format
                const item: Record<string, unknown> = {
                    id: randomId(8),
                    itemType: params.itemType,
                    title: params.title,
                    url: params.url,
                    accessDate: formatAccessDate(),
                    creators: params.authors ? parseAuthors(params.authors) : [],
                    tags: (params.tags || []).map((t: string) => ({ tag: t })),
                    attachments: (params.attachmentUrls || []).map((a: { url: string; title?: string; mimeType?: string; type?: string }) => {
                        const att: any = {
                            url: a.url,
                            title: a.title || "Attachment",
                            mimeType: a.mimeType || "application/pdf",
                        };

                        // Map simplified type to Zotero linkMode
                        if (a.type === "link") {
                            att.linkMode = "linked_url";
                            att.snapshot = false;
                        } else if (a.type === "linked_file") {
                            att.linkMode = "linked_file";
                            att.path = a.url; // For linked_file, url is usually the path
                            att.snapshot = false;
                        } else {
                            // "file" (default) -> imported_url
                            att.linkMode = "imported_url";
                            // snapshot defaults to true (implied)
                        }
                        return att;
                    }),
                    notes: (params.notes || []).map((n: string) => ({ note: n })),
                };

                // Add optional fields
                if (params.date) item.date = params.date;
                if (params.abstractNote) item.abstractNote = params.abstractNote;
                if (params.DOI) item.DOI = params.DOI;
                if (params.publicationTitle)
                    item.publicationTitle = params.publicationTitle;
                if (params.volume) item.volume = params.volume;
                if (params.issue) item.issue = params.issue;
                if (params.pages) item.pages = params.pages;
                if (params.language) item.language = params.language;

                const res = await saveItemsWithAttachments([item], params.url, ctx.logger);

                if (!res.success) {
                    const result = res.result;
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Failed to save to Zotero. ${result?.error || `Status: ${result?.status}`}\n\nResponse: ${JSON.stringify(result?.data)}`,
                                isError: true,
                            },
                        ],
                    };
                }

                const parts = [
                    `Successfully saved to Zotero:`,
                    `- Title: ${params.title}`,
                    `- Key: ${item.id} (Parent Item Key)`,
                    `- Type: ${params.itemType}`,
                    `- URL: ${params.url}`,
                ];
                if (params.authors?.length)
                    parts.push(`- Authors: ${params.authors.join(", ")}`);
                if (params.tags?.length)
                    parts.push(`- Tags: ${params.tags.join(", ")}`);
                if (params.notes?.length)
                    parts.push(`- Notes: ${params.notes.length} note(s) attached`);

                parts.push(`- Attachments: ${res.uploads?.success} uploaded, ${res.uploads?.failed} failed`);
                parts.push(`- Session ID: ${res.sessionID}`);

                return {
                    content: [{ type: "text" as const, text: parts.join("\n") }],
                };
            },
        },

        // ─── Tool 4: add-note-to-zotero ──────────────────────────────────
        {
            name: "add-note-to-zotero",
            description: `Add a note to an existing item in the Zotero library.
Requires the parent item's key (the 8-character alphanumeric ID visible in Zotero).

The note content supports HTML formatting. Plain text will also work.

Uses the Zotero 7 local REST API (/api/users/0/items).`,
            schema: z.object({
                parentItem: z
                    .string()
                    .describe(
                        "The key of the parent item (8-char alphanumeric, e.g. 'ABCD1234')"
                    ),
                note: z
                    .string()
                    .describe("Note content (plain text or HTML)"),
                tags: z
                    .array(z.string())
                    .optional()
                    .describe("Tags for the note"),
            }),
            handler: async ({ parentItem, note, tags }, ctx) => {
                ctx.logger.info(`Adding note to Zotero item: ${parentItem}`);

                const noteItem = {
                    itemType: "note",
                    parentItem,
                    note,
                    tags: (tags || []).map((t: string) => ({ tag: t })),
                };

                // Try Zotero 7 local REST API
                const result = await apiFetch("/users/0/items", {
                    method: "POST",
                    body: [noteItem],
                });

                if (result.ok) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Successfully added note to item ${parentItem}.\nNote length: ${note.length} characters`,
                            },
                        ],
                    };
                }

                // If the local REST API doesn't support writes, report the error
                const errorMsg =
                    result.status === 0
                        ? "Zotero is not running or not reachable."
                        : result.status === 403 || result.status === 405
                            ? `Zotero local API does not support write operations (status ${result.status}). Make sure you are using Zotero 7 and have enabled "Allow other applications on this computer to communicate with Zotero" in Settings > Advanced.`
                            : `Unexpected error (status ${result.status}): ${JSON.stringify(result.data)}`;

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Failed to add note. ${result.error || errorMsg}`,
                            isError: true,
                        },
                    ],
                };
            },
        },
    ],
});
