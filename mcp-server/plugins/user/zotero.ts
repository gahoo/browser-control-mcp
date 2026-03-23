/**
 * Zotero Plugin for Browser Control MCP
 *
 * Communicates with Zotero desktop client's local HTTP server (port 23119)
 * to save, search, and manage bibliographic items in the user's Zotero library.
 *
 * Uses two APIs:
 * - /connector/* endpoints: for saving items (compatible with Zotero Translation Framework)
 * - /debug-bridge/execute: for search, read, and advanced operations via Better BibTeX
 *   debug-bridge (requires ZOTERO_DEBUG_BRIDGE_TOKEN env var)
 */

import { definePlugin, z, type PluginContext } from "../types";

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

type DownloadMethod = "browser" | "server" | "tab" | "auto";

/** Download file data using the specified method */
async function downloadFile(
    url: string,
    ctx: PluginContext,
    downloadMethod: DownloadMethod,
    tabId?: number
): Promise<{ data: ArrayBuffer | null; error?: string; usedMethod: string }> {
    const { logger } = ctx;

    if (url.startsWith("file://") || url.startsWith("/")) {
        try {
            logger.info(`Detected local file, bypassing download method and reading via fs: ${url}`);
            const fs = await import("fs/promises");
            const pathStr = url.startsWith("file://") ? new URL(url).pathname : url;
            const buffer = await fs.readFile(pathStr);
            return {
                data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
                usedMethod: "fs"
            };
        } catch (e) {
            return { data: null, error: `Local file read failed: ${String(e)}`, usedMethod: "fs" };
        }
    }

    // Helper: server-side fetch
    const serverFetch = async (): Promise<{ data: ArrayBuffer | null; error?: string }> => {
        try {
            logger.info(`Downloading via server: ${url}`);
            const res = await fetch(url);
            if (!res.ok) return { data: null, error: `HTTP ${res.status}: ${res.statusText}` };
            return { data: await res.arrayBuffer() };
        } catch (e) {
            return { data: null, error: `Server fetch failed: ${String(e)}` };
        }
    };

    // Helper: browser-based fetch
    const browserFetch = async (mode?: "tab"): Promise<{ data: ArrayBuffer | null; error?: string }> => {
        try {
            logger.info(`Downloading via ${mode || "browser"}: ${url}`);
            const result = await ctx.browserApi.fetchUrl(url, tabId, {
                timeout: 60000,
                fetchMode: mode === "tab" ? "tab" : undefined,
            });
            if (result.error || !result.data) {
                return { data: null, error: result.error || "No data received" };
            }
            // browserApi returns base64-encoded data
            const buffer = Buffer.from(result.data, "base64");
            return { data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
        } catch (e) {
            return { data: null, error: `Browser fetch failed: ${String(e)}` };
        }
    };

    if (downloadMethod === "server") {
        const res = await serverFetch();
        return { ...res, usedMethod: "server" };
    }

    if (downloadMethod === "tab") {
        if (!tabId) return { data: null, error: "Tab mode requires tabId", usedMethod: "tab" };
        const res = await browserFetch("tab");
        return { ...res, usedMethod: "tab" };
    }

    if (downloadMethod === "browser") {
        const res = await browserFetch();
        return { ...res, usedMethod: "browser" };
    }

    // "auto": try browser first, fallback to server
    const browserRes = await browserFetch();
    if (browserRes.data) {
        return { ...browserRes, usedMethod: "browser" };
    }
    logger.warn(`Browser download failed (${browserRes.error}), falling back to server`);
    const serverRes = await serverFetch();
    return { ...serverRes, usedMethod: serverRes.data ? "server" : "server (failed)" };
}

/** Upload a file attachment to Zotero */
async function saveAttachment(
    attachment: { id: string; url: string; title: string; mimeType: string; parentItem: string },
    sessionID: string,
    ctx: PluginContext,
    downloadMethod: DownloadMethod = "auto",
    tabId?: number
): Promise<boolean> {
    const { logger } = ctx;
    try {
        const { data: arrayBuffer, error, usedMethod } = await downloadFile(
            attachment.url, ctx, downloadMethod, tabId
        );

        if (!arrayBuffer) {
            logger.error(`Failed to download attachment ${attachment.url}: ${error}`);
            return false;
        }

        let displayUrl = attachment.url;
        let filename: string | undefined = undefined;

        if (attachment.url.startsWith("file://") || attachment.url.startsWith("/")) {
            const pathStr = attachment.url.startsWith("file://") ? new URL(attachment.url).pathname : attachment.url;
            filename = pathStr.split('/').pop() || "attachment";
            displayUrl = `local://${encodeURIComponent(filename)}`;

            if (attachment.title === "Attachment") {
                attachment.title = filename;
            }
            if (filename.toLowerCase().endsWith(".md") && attachment.mimeType === "application/pdf") {
                attachment.mimeType = "text/markdown";
            }
        }

        const metadata = JSON.stringify({
            id: attachment.id,
            url: displayUrl,
            filename: filename,
            contentType: attachment.mimeType,
            parentItemID: attachment.parentItem,
            title: rfc2047Encode(attachment.title),
        });

        logger.info(`Uploading attachment to Zotero: ${attachment.title} (${arrayBuffer.byteLength} bytes, via ${usedMethod})`);
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

/** Get the debug-bridge token from environment */
function getDebugBridgeToken(): string | null {
    return process.env.ZOTERO_DEBUG_BRIDGE_TOKEN || null;
}

/** Execute JavaScript in Zotero via Better BibTeX debug-bridge */
async function debugBridgeFetch(
    script: string,
    params?: Record<string, string>
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
    const token = getDebugBridgeToken();
    if (!token) {
        return {
            ok: false,
            status: 0,
            data: null,
            error: "ZOTERO_DEBUG_BRIDGE_TOKEN environment variable is not set. "
                + "Please configure it to match the token in Zotero Config Editor "
                + "(extensions.zotero.debug-bridge.token).",
        };
    }

    try {
        const url = new URL(`${ZOTERO_BASE}/debug-bridge/execute`);
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, v);
            }
        }

        const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
                "Content-Type": "text/plain",
                "Authorization": `Bearer ${token}`,
            },
            body: script,
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
            error: `Cannot connect to Zotero debug-bridge: ${String(e)}`,
        };
    }
}

/** Format debug-bridge error for tool response */
function bridgeErrorText(result: { error?: string; status: number; data: unknown }): string {
    const detail = typeof result.data === "string" ? result.data : JSON.stringify(result.data);
    return `${result.error || `Status: ${result.status}`}\n${detail}`;
}

/**
 * Pick specified fields from an object or array of objects.
 * Supports dot-path for nested filtering:
 *   - "key"           → top-level field
 *   - "notes.key"     → in the nested 'notes' value, only keep 'key'
 *   - "notes.tags.name" → 3-level deep filtering (recursive)
 * If a parent appears both bare ("notes") and with children ("notes.key"),
 * the children win (more specific filtering).
 */
function pickFields(data: unknown, fields?: string[]): unknown {
    if (!fields || fields.length === 0) return data;

    // Group: top-level only vs. nested (dot-path)
    const topOnly = new Set<string>();       // fields with no children specified
    const nested = new Map<string, string[]>();  // parent → child paths

    for (const f of fields) {
        const dot = f.indexOf(".");
        if (dot === -1) {
            // Only mark as top-only if no nested children already registered
            if (!nested.has(f)) topOnly.add(f);
        } else {
            const parent = f.substring(0, dot);
            const child = f.substring(dot + 1);
            if (!nested.has(parent)) nested.set(parent, []);
            nested.get(parent)!.push(child);
            topOnly.delete(parent); // children override bare inclusion
        }
    }

    const allKeys = new Set([...topOnly, ...nested.keys()]);

    const pick = (obj: Record<string, unknown>): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const key of allKeys) {
            if (!(key in obj)) continue;
            const childPaths = nested.get(key);
            if (childPaths) {
                // Recursively filter nested value
                out[key] = pickFields(obj[key], childPaths);
            } else {
                out[key] = obj[key];
            }
        }
        return out;
    };

    if (Array.isArray(data)) return data.map(item =>
        typeof item === "object" && item !== null ? pick(item as Record<string, unknown>) : item
    );
    if (typeof data === "object" && data !== null) return pick(data as Record<string, unknown>);
    return data;
}

/**
 * Apply a JavaScript filter expression to data.
 * For arrays: each element is passed as `item` and kept if the expression returns truthy.
 * For objects: the object is passed as `item` and returned as-is or null.
 * Example expressions:
 *   "item.itemType === 'journalArticle'"
 *   "item.date > '2023'"
 *   "item.tags.some(t => t === 'important')"
 */
function applyFilter(data: unknown, filterExpr?: string): unknown {
    if (!filterExpr) return data;
    try {
        const fn = new Function("item", `return (${filterExpr})`);
        if (Array.isArray(data)) return data.filter(item => fn(item));
        if (typeof data === "object" && data !== null) return fn(data) ? data : null;
        return data;
    } catch (e) {
        throw new Error(`Invalid filter expression: ${String(e)}`);
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
    ctx: PluginContext,
    downloadMethod: DownloadMethod = "auto",
    tabId?: number
) {
    const { logger } = ctx;
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
        const success = await saveAttachment(att, sessionID, ctx, downloadMethod, tabId);
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
        version: "2.0.0",
        description:
            "Save, search, and manage bibliographic items in Zotero via Connector API and Better BibTeX debug-bridge",
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
                    .array(z.record(z.string(), z.unknown()))
                    .describe("Array of items in Zotero item format"),
                uri: z
                    .string()
                    .optional()
                    .describe("Source URI for the items (defaults to first item's url)"),
                downloadMethod: z.enum(["browser", "server", "tab", "auto"]).default("auto")
                    .describe("Download method for file attachments: browser (with cookies), server (direct), tab (in-page), auto (browser-first)"),
                tabId: z.number().optional()
                    .describe("Tab ID (required for 'tab' download mode)"),
            }),
            handler: async ({ items, uri, downloadMethod, tabId }, ctx) => {
                const res = await saveItemsWithAttachments(items, uri || "", ctx, downloadMethod, tabId);

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
                downloadMethod: z.enum(["browser", "server", "tab", "auto"]).default("auto")
                    .describe("Download method for file attachments: browser (with cookies), server (direct), tab (in-page), auto (browser-first)"),
                tabId: z.number().optional()
                    .describe("Tab ID (required for 'tab' download mode)"),
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

                const res = await saveItemsWithAttachments([item], params.url, ctx, params.downloadMethod, params.tabId);

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

        // ─── Tool 4: add-note-to-zotero (via debug-bridge) ─────────────
        {
            name: "add-note-to-zotero",
            description: `Add a note to an existing item in the Zotero library.
Requires the parent item's key (the 8-character alphanumeric ID visible in Zotero).
The note content supports HTML formatting. Plain text will also work.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
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

                const tagsCode = (tags || []).length > 0
                    ? `var tags = ${JSON.stringify(tags)}; for (var t of tags) { noteItem.addTag(t); }`
                    : "";

                const script = [
                    `var libraryID = Zotero.Libraries.userLibraryID;`,
                    `var itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(parentItem)});`,
                    `if (!itemID) throw new Error('Parent item not found: ' + ${JSON.stringify(parentItem)});`,
                    `var noteItem = new Zotero.Item('note');`,
                    `noteItem.libraryID = libraryID;`,
                    `noteItem.parentKey = ${JSON.stringify(parentItem)};`,
                    `noteItem.setNote(${JSON.stringify(note)});`,
                    tagsCode,
                    `await noteItem.saveTx();`,
                    `return { key: noteItem.key };`,
                ].join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to add note. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const data = result.data as { key?: string };
                return {
                    content: [{
                        type: "text" as const,
                        text: `Successfully added note to item ${parentItem}.\nNote key: ${data?.key || "unknown"}\nNote length: ${note.length} characters`,
                    }],
                };
            },
        },

        // ─── Tool 5: zotero-search ───────────────────────────────────────
        {
            name: "zotero-search",
            description: `Search for items in the Zotero library. Supports searching by title, author, tag, collection, item type, and date range.
Returns a list of matching items with key metadata fields.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                query: z.string().optional()
                    .describe("General search (matches title, creator, year)"),
                title: z.string().optional()
                    .describe("Search by title (contains)"),
                creator: z.string().optional()
                    .describe("Search by author/creator name (contains)"),
                tag: z.string().optional()
                    .describe("Filter by exact tag name"),
                collection: z.string().optional()
                    .describe("Limit to collection (collection key, e.g. 'C72FDAP2')"),
                itemType: z.string().optional()
                    .describe("Filter by item type (e.g. 'journalArticle', 'book', 'conferencePaper')"),
                dateFrom: z.string().optional()
                    .describe("Date range start (e.g. '2020-01-01')"),
                dateTo: z.string().optional()
                    .describe("Date range end"),
                limit: z.number().default(20)
                    .describe("Maximum number of results (default: 20)"),
                fields: z.array(z.string()).optional()
                    .describe("Fields to include in output (e.g. ['key','title','creators']). Returns all if not specified."),
                filter: z.string().optional()
                    .describe("JS expression to filter results. Each item is available as 'item'. E.g. \"item.itemType === 'book'\""),
            }),
            handler: async (params, ctx) => {
                ctx.logger.info(`Searching Zotero: ${JSON.stringify(params)}`);

                const conditions: string[] = [];
                if (params.query) conditions.push(
                    `s.addCondition('quicksearch-titleCreatorYear', 'contains', ${JSON.stringify(params.query)});`);
                if (params.title) conditions.push(
                    `s.addCondition('title', 'contains', ${JSON.stringify(params.title)});`);
                if (params.creator) conditions.push(
                    `s.addCondition('creator', 'contains', ${JSON.stringify(params.creator)});`);
                if (params.tag) conditions.push(
                    `s.addCondition('tag', 'is', ${JSON.stringify(params.tag)});`);
                if (params.collection) conditions.push(
                    `s.addCondition('collection', 'is', ${JSON.stringify(params.collection)});`);
                if (params.itemType) conditions.push(
                    `s.addCondition('itemType', 'is', ${JSON.stringify(params.itemType)});`);
                if (params.dateFrom) conditions.push(
                    `s.addCondition('date', 'isAfter', ${JSON.stringify(params.dateFrom)});`);
                if (params.dateTo) conditions.push(
                    `s.addCondition('date', 'isBefore', ${JSON.stringify(params.dateTo)});`);

                if (conditions.length === 0) {
                    conditions.push(`s.addCondition('title', 'contains', '');`);
                }

                const script = [
                    `var s = new Zotero.Search();`,
                    `s.libraryID = Zotero.Libraries.userLibraryID;`,
                    ...conditions,
                    `var ids = await s.search();`,
                    `ids = ids.slice(0, ${params.limit});`,
                    `var items = await Zotero.Items.getAsync(ids);`,
                    `return items.filter(function(i) { return i.isRegularItem(); }).map(function(item) {`,
                    `  var creators = item.getCreators().map(function(c) {`,
                    `    return c.fieldMode === 1 ? c.lastName : ((c.firstName || '') + ' ' + (c.lastName || '')).trim();`,
                    `  });`,
                    `  var r = {`,
                    `    key: item.key, itemType: item.itemType,`,
                    `    title: item.getField('title'), creators: creators,`,
                    `    date: item.getField('date'),`,
                    `    tags: item.getTags().map(function(t) { return t.tag; }),`,
                    `  };`,
                    `  try { r.abstractNote = item.getField('abstractNote'); } catch(e) {}`,
                    `  try { r.url = item.getField('url'); } catch(e) {}`,
                    `  try { r.DOI = item.getField('DOI'); } catch(e) {}`,
                    `  try { r.publicationTitle = item.getField('publicationTitle'); } catch(e) {}`,
                    `  return r;`,
                    `});`,
                ].join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Search failed. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const items = result.data as any[];
                const afterFilter = applyFilter(items, params.filter) as any[];
                const afterPick = pickFields(afterFilter, params.fields);
                const total = items.length;
                const shown = afterFilter.length;
                return {
                    content: [{
                        type: "text" as const,
                        text: shown > 0
                            ? `Found ${total} item(s)${shown < total ? `, showing ${shown} after filter` : ``}:\n\n${JSON.stringify(afterPick, null, 2)}`
                            : `No items found matching the search criteria.`,
                    }],
                };
            },
        },

        // ─── Tool 6: zotero-get-item ─────────────────────────────────────
        {
            name: "zotero-get-item",
            description: `Get full details of a Zotero item by its key.
Can optionally include child notes (with HTML content) and attachments (with file paths).

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                key: z.string()
                    .describe("The item key (8-char alphanumeric, e.g. 'ABCD1234')"),
                includeNotes: z.boolean().default(false)
                    .describe("Include child notes with their HTML content"),
                includeAttachments: z.boolean().default(false)
                    .describe("Include attachment info (filename, type, path)"),
                fields: z.array(z.string()).optional()
                    .describe("Fields to include in output (e.g. ['key','title','DOI']). Returns all if not specified."),
                filter: z.string().optional()
                    .describe("JS expression to filter the result. The item is available as 'item'. E.g. \"item.date > '2020'\""),
            }),
            handler: async ({ key, includeNotes, includeAttachments, fields, filter }, ctx) => {
                ctx.logger.info(`Getting Zotero item: ${key}`);

                const notesBlock = includeNotes ? [
                    `if (item.isRegularItem()) {`,
                    `  var noteIDs = item.getNotes(); result.notes = [];`,
                    `  for (var nid of noteIDs) {`,
                    `    var n = Zotero.Items.get(nid);`,
                    `    result.notes.push({ key: n.key, content: n.getNote(),`,
                    `      tags: n.getTags().map(function(t){return t.tag;}), dateModified: n.dateModified });`,
                    `  }`,
                    `}`,
                ].join("\n") : "";

                const attBlock = includeAttachments ? [
                    `if (item.isRegularItem()) {`,
                    `  var attIDs = item.getAttachments(); result.attachments = [];`,
                    `  for (var aid of attIDs) {`,
                    `    var a = Zotero.Items.get(aid);`,
                    `    var ai = { key: a.key, title: a.getField('title'),`,
                    `      contentType: a.attachmentContentType, filename: a.attachmentFilename };`,
                    `    try { ai.path = a.getFilePath(); } catch(e) {}`,
                    `    result.attachments.push(ai);`,
                    `  }`,
                    `}`,
                ].join("\n") : "";

                const script = [
                    `var libraryID = Zotero.Libraries.userLibraryID;`,
                    `var itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(key)});`,
                    `if (!itemID) throw new Error('Item not found: ' + ${JSON.stringify(key)});`,
                    `var item = Zotero.Items.get(itemID);`,
                    `var creators = item.getCreators().map(function(c) {`,
                    `  return { firstName: c.firstName||'', lastName: c.lastName||'',`,
                    `    creatorType: Zotero.CreatorTypes.getName(c.creatorTypeID) };`,
                    `});`,
                    `var result = { key: item.key, itemType: item.itemType,`,
                    `  title: item.getField('title'), creators: creators,`,
                    `  tags: item.getTags().map(function(t){return t.tag;}),`,
                    `  dateAdded: item.dateAdded, dateModified: item.dateModified };`,
                    `var fields = ['date','abstractNote','url','DOI','publicationTitle',`,
                    `  'volume','issue','pages','language','ISBN','ISSN','extra'];`,
                    `for (var f of fields) { try { var v = item.getField(f); if(v) result[f]=v; } catch(e){} }`,
                    notesBlock,
                    attBlock,
                    `return result;`,
                ].join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to get item. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const afterFilter = applyFilter(result.data, filter);
                const afterPick = pickFields(afterFilter, fields);
                return {
                    content: [{
                        type: "text" as const,
                        text: afterPick === null
                            ? `Item ${key} did not match filter expression.`
                            : JSON.stringify(afterPick, null, 2),
                    }],
                };
            },
        },

        // ─── Tool 7: zotero-get-attachment-text ──────────────────────────
        {
            name: "zotero-get-attachment-text",
            description: `Get the extracted full text content from PDF or HTML attachments of a Zotero item.
Pass either a parent item key (to get text from all its attachments) or an attachment key directly.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                itemKey: z.string()
                    .describe("Item key (parent item or attachment itself)"),
                maxLength: z.number().default(50000)
                    .describe("Max characters to return per attachment (default: 50000)"),
            }),
            handler: async ({ itemKey, maxLength }, ctx) => {
                ctx.logger.info(`Getting attachment text for: ${itemKey}`);

                const script = [
                    `var libraryID = Zotero.Libraries.userLibraryID;`,
                    `var itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(itemKey)});`,
                    `if (!itemID) throw new Error('Item not found: ' + ${JSON.stringify(itemKey)});`,
                    `var item = Zotero.Items.get(itemID);`,
                    `var maxLen = ${maxLength};`,
                    `var texts = [];`,
                    `if (item.isAttachment()) {`,
                    `  try {`,
                    `    var text = await item.attachmentText;`,
                    `    if (text) texts.push({ key: item.key, title: item.getField('title'),`,
                    `      contentType: item.attachmentContentType,`,
                    `      text: text.substring(0, maxLen), truncated: text.length > maxLen });`,
                    `  } catch(e) { texts.push({ key: item.key, error: String(e) }); }`,
                    `} else if (item.isRegularItem()) {`,
                    `  var attIDs = item.getAttachments();`,
                    `  for (var id of attIDs) {`,
                    `    var att = Zotero.Items.get(id);`,
                    `    var ct = att.attachmentContentType;`,
                    `    if (ct==='application/pdf'||ct==='text/html'||ct==='text/plain'||ct==='text/markdown') {`,
                    `      try {`,
                    `        var text = await att.attachmentText;`,
                    `        if (text) texts.push({ key: att.key, title: att.getField('title'),`,
                    `          contentType: ct, text: text.substring(0, maxLen), truncated: text.length > maxLen });`,
                    `      } catch(e) { texts.push({ key: att.key, title: att.getField('title'), error: String(e) }); }`,
                    `    }`,
                    `  }`,
                    `}`,
                    `return texts;`,
                ].join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to get attachment text. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const texts = result.data as any[];
                if (!texts || texts.length === 0) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `No text content found for item ${itemKey}.`,
                        }],
                    };
                }

                const parts = texts.map((t: any) => {
                    if (t.error) return `## ${t.title || t.key}\nError: ${t.error}`;
                    return `## ${t.title} (${t.key})\nType: ${t.contentType}${t.truncated ? " [TRUNCATED]" : ""}\n\n${t.text}`;
                });

                return {
                    content: [{
                        type: "text" as const,
                        text: parts.join("\n\n---\n\n"),
                    }],
                };
            },
        },

        // ─── Tool 8: zotero-execute ──────────────────────────────────────
        {
            name: "zotero-execute",
            description: `Execute arbitrary JavaScript code in the Zotero process via Better BibTeX debug-bridge.
The script runs as an async function body with full access to the Zotero JavaScript API.
Use 'return' to send results back. The return value will be JSON-serialized.

Available objects: Zotero, ZoteroPane (via Zotero.getActiveZoteroPane()), and all Zotero internals.

Only use this tool when the other zotero-* tools don't cover the needed functionality.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                script: z.string()
                    .describe("JavaScript code to execute in Zotero (async function body)"),
                params: z.record(z.string(), z.string()).optional()
                    .describe("Optional key-value params passed as URL query params (accessible via 'query' object in script)"),
                fields: z.array(z.string()).optional()
                    .describe("Fields to include in output. Filters the returned JSON to only include specified keys."),
                filter: z.string().optional()
                    .describe("JS expression to filter results. Each item is available as 'item'. E.g. \"item.tag === 'test'\""),
            }),
            handler: async ({ script, params, fields, filter }, ctx) => {
                ctx.logger.info(`Executing Zotero script (${script.length} chars)`);

                const result = await debugBridgeFetch(script, params);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Script execution failed. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const afterFilter = applyFilter(result.data, filter);
                const afterPick = pickFields(afterFilter, fields);
                return {
                    content: [{
                        type: "text" as const,
                        text: typeof afterPick === "string"
                            ? afterPick
                            : JSON.stringify(afterPick, null, 2),
                    }],
                };
            },
        },

        // ─── Tool 9: zotero-update-item ──────────────────────────────────
        {
            name: "zotero-update-item",
            description: `Modify fields or tags of an existing Zotero item.
Specify the item key and provide fields to update (as key-value pairs) and/or tag operations.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                key: z.string()
                    .describe("The item key (8-char alphanumeric)"),
                fields: z.record(z.string(), z.unknown()).optional()
                    .describe("Fields to update as key-value pairs, e.g. {title: 'New Title', date: '2024'}"),
                addTags: z.array(z.string()).optional()
                    .describe("Tags to add to the item"),
                removeTags: z.array(z.string()).optional()
                    .describe("Tags to remove from the item"),
            }),
            handler: async ({ key, fields, addTags, removeTags }, ctx) => {
                ctx.logger.info(`Updating Zotero item: ${key}`);

                const fieldUpdates = fields
                    ? Object.entries(fields).map(([k, v]) =>
                        `item.setField(${JSON.stringify(k)}, ${JSON.stringify(v)});`
                    ).join("\n")
                    : "";

                const addTagsCode = (addTags || []).length > 0
                    ? (addTags as string[]).map(t => `item.addTag(${JSON.stringify(t)});`).join("\n")
                    : "";

                const removeTagsCode = (removeTags || []).length > 0
                    ? (removeTags as string[]).map(t => `item.removeTag(${JSON.stringify(t)});`).join("\n")
                    : "";

                const script = [
                    `var libraryID = Zotero.Libraries.userLibraryID;`,
                    `var itemID = Zotero.Items.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(key)});`,
                    `if (!itemID) throw new Error('Item not found: ' + ${JSON.stringify(key)});`,
                    `var item = Zotero.Items.get(itemID);`,
                    fieldUpdates,
                    addTagsCode,
                    removeTagsCode,
                    `await item.saveTx();`,
                    `return { key: item.key, title: item.getField('title'), tags: item.getTags().map(function(t){return t.tag;}) };`,
                ].filter(Boolean).join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Failed to update item. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                return {
                    content: [{
                        type: "text" as const,
                        text: `Successfully updated item ${key}.\n${JSON.stringify(result.data, null, 2)}`,
                    }],
                };
            },
        },

        // ─── Tool 10: zotero-manage-tags ─────────────────────────────────
        {
            name: "zotero-manage-tags",
            description: `Manage tags in the Zotero library: list all tags, rename a tag, or delete a tag.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                action: z.enum(["list", "rename", "delete"])
                    .describe("Action to perform"),
                tag: z.string().optional()
                    .describe("Tag name (required for rename/delete)"),
                newName: z.string().optional()
                    .describe("New tag name (required for rename)"),
            }),
            handler: async ({ action, tag, newName }, ctx) => {
                ctx.logger.info(`Managing tags: ${action} ${tag || ""}`);

                let script: string;

                if (action === "list") {
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var tagMap = {};`,
                        `var s = new Zotero.Search();`,
                        `s.libraryID = libraryID;`,
                        `s.addCondition('title', 'contains', '');`,
                        `var ids = await s.search();`,
                        `var items = await Zotero.Items.getAsync(ids);`,
                        `for (var item of items) {`,
                        `  if (!item.isRegularItem()) continue;`,
                        `  var tags = item.getTags();`,
                        `  for (var t of tags) {`,
                        `    tagMap[t.tag] = (tagMap[t.tag] || 0) + 1;`,
                        `  }`,
                        `}`,
                        `return Object.entries(tagMap).map(function(e) { return { tag: e[0], count: e[1] }; })`,
                        `  .sort(function(a, b) { return b.count - a.count; });`,
                    ].join("\n");
                } else if (action === "rename") {
                    if (!tag || !newName) throw new Error("Both 'tag' and 'newName' are required for rename");
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `await Zotero.Tags.rename(libraryID, ${JSON.stringify(tag)}, ${JSON.stringify(newName)});`,
                        `return { renamed: true, from: ${JSON.stringify(tag)}, to: ${JSON.stringify(newName)} };`,
                    ].join("\n");
                } else {
                    // delete
                    if (!tag) throw new Error("'tag' is required for delete");
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var tagID = Zotero.Tags.getID(${JSON.stringify(tag)});`,
                        `if (!tagID) throw new Error('Tag not found: ' + ${JSON.stringify(tag)});`,
                        `await Zotero.Tags.removeFromLibrary(libraryID, [tagID]);`,
                        `return { deleted: true, tag: ${JSON.stringify(tag)} };`,
                    ].join("\n");
                }

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Tag operation failed. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                if (action === "list") {
                    const tags = result.data as any[];
                    return {
                        content: [{
                            type: "text" as const,
                            text: tags.length > 0
                                ? `${tags.length} tag(s):\n\n${JSON.stringify(tags, null, 2)}`
                                : `No tags found in library.`,
                        }],
                    };
                }

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify(result.data, null, 2),
                    }],
                };
            },
        },

        // ─── Tool 11: zotero-manage-collections ──────────────────────────
        {
            name: "zotero-manage-collections",
            description: `Manage collections in the Zotero library: list all collections, create a new collection, or add/remove items.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                action: z.enum(["list", "create", "addItems", "removeItems"])
                    .describe("Action to perform"),
                collectionKey: z.string().optional()
                    .describe("Collection key (required for addItems/removeItems)"),
                name: z.string().optional()
                    .describe("Collection name (required for create)"),
                parentKey: z.string().optional()
                    .describe("Parent collection key (optional, for creating subcollections)"),
                itemKeys: z.array(z.string()).optional()
                    .describe("Item keys to add/remove (required for addItems/removeItems)"),
            }),
            handler: async ({ action, collectionKey, name, parentKey, itemKeys }, ctx) => {
                ctx.logger.info(`Managing collections: ${action}`);

                let script: string;

                if (action === "list") {
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var cols = Zotero.Collections.getByLibrary(libraryID);`,
                        `return cols.map(function(c) {`,
                        `  var r = { key: c.key, name: c.name, itemCount: c.getChildItems(true).length };`,
                        `  if (c.parentKey) r.parentKey = c.parentKey;`,
                        `  return r;`,
                        `});`,
                    ].join("\n");
                } else if (action === "create") {
                    if (!name) throw new Error("'name' is required for create");
                    const parentCode = parentKey
                        ? [
                            `var parentID = Zotero.Collections.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(parentKey)});`,
                            `if (parentID) col.parentID = parentID;`,
                        ].join("\n")
                        : "";
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var col = new Zotero.Collection();`,
                        `col.libraryID = libraryID;`,
                        `col.name = ${JSON.stringify(name)};`,
                        parentCode,
                        `await col.saveTx();`,
                        `return { key: col.key, name: col.name };`,
                    ].filter(Boolean).join("\n");
                } else if (action === "addItems") {
                    if (!collectionKey || !itemKeys?.length) throw new Error("'collectionKey' and 'itemKeys' required");
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var colID = Zotero.Collections.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(collectionKey)});`,
                        `if (!colID) throw new Error('Collection not found');`,
                        `var col = Zotero.Collections.get(colID);`,
                        `var keys = ${JSON.stringify(itemKeys)};`,
                        `var added = 0;`,
                        `for (var k of keys) {`,
                        `  var id = Zotero.Items.getIDFromLibraryAndKey(libraryID, k);`,
                        `  if (id) { col.addItem(id); added++; }`,
                        `}`,
                        `await col.saveTx();`,
                        `return { collectionKey: col.key, added: added };`,
                    ].join("\n");
                } else {
                    // removeItems
                    if (!collectionKey || !itemKeys?.length) throw new Error("'collectionKey' and 'itemKeys' required");
                    script = [
                        `var libraryID = Zotero.Libraries.userLibraryID;`,
                        `var colID = Zotero.Collections.getIDFromLibraryAndKey(libraryID, ${JSON.stringify(collectionKey)});`,
                        `if (!colID) throw new Error('Collection not found');`,
                        `var col = Zotero.Collections.get(colID);`,
                        `var keys = ${JSON.stringify(itemKeys)};`,
                        `var removed = 0;`,
                        `for (var k of keys) {`,
                        `  var id = Zotero.Items.getIDFromLibraryAndKey(libraryID, k);`,
                        `  if (id) { col.removeItem(id); removed++; }`,
                        `}`,
                        `await col.saveTx();`,
                        `return { collectionKey: col.key, removed: removed };`,
                    ].join("\n");
                }

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Collection operation failed. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify(result.data, null, 2),
                    }],
                };
            },
        },

        // ─── Tool 12: zotero-get-citation ────────────────────────────────
        {
            name: "zotero-get-citation",
            description: `Generate formatted citations or bibliography for Zotero items using the built-in CSL engine.
Returns text or HTML formatted references in the specified citation style.

Requires Better BibTeX debug-bridge and ZOTERO_DEBUG_BRIDGE_TOKEN env var.`,
            schema: z.object({
                keys: z.array(z.string())
                    .describe("Item keys to generate citations for"),
                style: z.string().optional()
                    .describe("CSL style ID (e.g. 'http://www.zotero.org/styles/apa'). Uses Zotero default if omitted."),
                format: z.enum(["text", "html"]).default("text")
                    .describe("Output format"),
                mode: z.enum(["bibliography", "citation"]).default("bibliography")
                    .describe("bibliography = full reference list, citation = in-text citation (e.g. '(Smith, 2023)')"),
            }),
            handler: async ({ keys, style, format, mode }, ctx) => {
                ctx.logger.info(`Generating ${mode} for ${keys.length} item(s)`);

                const asCitation = mode === "citation" ? "true" : "false";
                const styleCode = style
                    ? `var format = 'bibliography=${JSON.stringify(style).slice(1, -1)}';`
                    : `var format = Zotero.Prefs.get('export.quickCopy.setting');`;

                const script = [
                    `var libraryID = Zotero.Libraries.userLibraryID;`,
                    `var items = [];`,
                    `var keys = ${JSON.stringify(keys)};`,
                    `for (var k of keys) {`,
                    `  var id = Zotero.Items.getIDFromLibraryAndKey(libraryID, k);`,
                    `  if (id) items.push(Zotero.Items.get(id));`,
                    `}`,
                    `if (!items.length) throw new Error('No valid items found');`,
                    styleCode,
                    `var qc = Zotero.QuickCopy;`,
                    `var result = qc.getContentFromItems(items, format, null, ${asCitation});`,
                    `return { ${format}: result.${format === "html" ? "html" : "text"}, itemCount: items.length };`,
                ].join("\n");

                const result = await debugBridgeFetch(script);

                if (!result.ok) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Citation generation failed. ${bridgeErrorText(result)}`,
                            isError: true,
                        }],
                    };
                }

                const data = result.data as Record<string, unknown>;
                const output = (data[format] || data.text || data.html || "") as string;
                return {
                    content: [{
                        type: "text" as const,
                        text: output || JSON.stringify(data, null, 2),
                    }],
                };
            },
        },
    ],
});
