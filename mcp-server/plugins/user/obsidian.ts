import { definePlugin, z } from "../types";

// Constants for content chunking
const MAX_ENCODED_LENGTH = 6000; // Safe threshold for URL-encoded content length
const CHUNK_DELAY_MS = 1500; // Delay between chunks to allow Obsidian to process

/**
 * Split content into chunks based on encoded length limit.
 * Ensures each chunk's encoded form doesn't exceed the limit.
 */
function splitContentByEncodedLength(content: string, maxLen: number): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    let currentEncodedLen = 0;

    for (const char of content) {
        const encodedChar = encodeURIComponent(char);
        const charEncodedLen = encodedChar.length;

        // If adding this character would exceed the limit, start a new chunk
        if (currentEncodedLen + charEncodedLen > maxLen && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = char;
            currentEncodedLen = charEncodedLen;
        } else {
            currentChunk += char;
            currentEncodedLen += charEncodedLen;
        }
    }

    // Push the remaining content
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

/**
 * Build an Obsidian URI for creating/appending notes
 */
function buildObsidianUri(params: {
    vault?: string;
    filename?: string;
    content?: string;
    overwrite?: boolean;
    append?: boolean;
}): string {
    let uri = "obsidian://new?";
    const parts: string[] = [];

    if (params.vault) parts.push(`vault=${encodeURIComponent(params.vault)}`);
    if (params.filename) {
        // Sanitize filename: replace invalid characters but preserve "/" for folder paths
        const sanitized = params.filename.replace(/[\\:"*?<>|]/g, '-');
        parts.push(`file=${encodeURIComponent(sanitized)}`);
    }
    if (params.content) parts.push(`content=${encodeURIComponent(params.content)}`);
    if (params.overwrite) parts.push("overwrite=true");
    if (params.append) parts.push("append=true");

    return uri + parts.join("&");
}

export default definePlugin({
    metadata: {
        name: "obsidian",
        version: "1.0.0",
        description: "Interact with Obsidian via Obsidian URI scheme",
    },
    tools: [
        {
            name: "create-obsidian-note",
            description: "Create a new note in Obsidian with optional content. Use '/' in filename to specify folder path (e.g., 'folder/subfolder/note'). Long content will be automatically split into chunks.",
            schema: z.object({
                vault: z.string().optional().describe("Name of the Obsidian vault. If omitted, uses the currently open vault."),
                filename: z.string().optional().describe("Name or path of the note to create (e.g., 'note' or 'folder/subfolder/note'). If omitted, Obsidian creates 'Untitled'."),
                content: z.string().optional().describe("Content to add to the note. Long content will be automatically chunked."),
                overwrite: z.boolean().optional().describe("Whether to overwrite if the file exists."),
                append: z.boolean().optional().describe("Whether to append if the file exists (create if not)."),
                autoClose: z.boolean().optional().default(true).describe("Whether to auto-close the browser tab after triggering Obsidian. Set to false if you need to grant permissions on first use."),
            }),
            handler: async ({ vault, filename, content, overwrite, append, autoClose }, ctx) => {
                // Check if content needs chunking
                const encodedContentLength = content ? encodeURIComponent(content).length : 0;
                const needsChunking = encodedContentLength > MAX_ENCODED_LENGTH;

                if (needsChunking && content) {
                    // Split content into chunks
                    const chunks = splitContentByEncodedLength(content, MAX_ENCODED_LENGTH);
                    ctx.logger.info(`Content too long (${encodedContentLength} encoded chars), splitting into ${chunks.length} chunks`);

                    // Process first chunk with original parameters
                    const firstUri = buildObsidianUri({
                        vault,
                        filename,
                        content: chunks[0],
                        overwrite,
                        append,
                    });

                    ctx.logger.info(`Opening Obsidian URI (chunk 1/${chunks.length}): ${firstUri.substring(0, 100)}...`);
                    const tabId = await ctx.browserApi.openTab(firstUri);

                    // Wait for first chunk to be processed
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    if (tabId !== undefined && autoClose !== false) {
                        await ctx.browserApi.closeTabs([tabId]);
                    }

                    // Process remaining chunks with append mode
                    for (let i = 1; i < chunks.length; i++) {
                        // Wait between chunks
                        await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY_MS));

                        const appendUri = buildObsidianUri({
                            vault,
                            filename,
                            content: chunks[i],
                            append: true,
                        });

                        ctx.logger.info(`Opening Obsidian URI (chunk ${i + 1}/${chunks.length}): ${appendUri.substring(0, 100)}...`);
                        const appendTabId = await ctx.browserApi.openTab(appendUri);

                        await new Promise(resolve => setTimeout(resolve, 3000));

                        if (appendTabId !== undefined && autoClose !== false) {
                            await ctx.browserApi.closeTabs([appendTabId]);
                        }
                    }

                    return {
                        content: [
                            {
                                type: "text",
                                text: `Created Obsidian note in ${chunks.length} chunks (content was ${encodedContentLength} encoded chars, exceeded ${MAX_ENCODED_LENGTH} limit)`,
                            },
                        ],
                    };
                }

                // Original single-request logic for short content
                const uri = buildObsidianUri({ vault, filename, content, overwrite, append });

                ctx.logger.info(`Opening Obsidian URI: ${uri}`);

                // Open tab to trigger the URI scheme handler
                const tabId = await ctx.browserApi.openTab(uri);

                // Auto-close the tab after a short delay to allow the URI to be processed
                if (tabId !== undefined && autoClose !== false) {
                    // Wait a bit for the URI to be processed by the OS
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await ctx.browserApi.closeTabs([tabId]);
                    ctx.logger.info(`Closed temporary tab: ${tabId}`);
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `triggered Obsidian 'new' action: ${uri}${autoClose === false ? ' (tab left open for permission grant)' : ''}`,
                        },
                    ],
                };
            },
        },
        {
            name: "query-obsidian-notes",
            description: "Search for notes in Obsidian.",
            schema: z.object({
                vault: z.string().optional().describe("Name of the Obsidian vault. If omitted, uses the currently open vault."),
                query: z.string().describe("Search query."),
            }),
            handler: async ({ vault, query }, ctx) => {
                // Build URI manually with encodeURIComponent
                let uri = "obsidian://search?";
                const parts: string[] = [];

                if (vault) parts.push(`vault=${encodeURIComponent(vault)}`);
                parts.push(`query=${encodeURIComponent(query)}`);

                uri += parts.join("&");

                ctx.logger.info(`Opening Obsidian URI: ${uri}`);

                // Open tab to trigger the URI scheme handler
                const tabId = await ctx.browserApi.openTab(uri);

                // Auto-close the tab after a short delay
                if (tabId !== undefined) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await ctx.browserApi.closeTabs([tabId]);
                    ctx.logger.info(`Closed temporary tab: ${tabId}`);
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `triggered Obsidian 'search' action: ${uri}`,
                        },
                    ],
                };
            },
        },
    ],
});
