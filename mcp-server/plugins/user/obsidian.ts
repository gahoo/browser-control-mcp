import { definePlugin, z } from "../types";

export default definePlugin({
    metadata: {
        name: "obsidian",
        version: "1.0.0",
        description: "Interact with Obsidian via Obsidian URI scheme",
    },
    tools: [
        {
            name: "create-obsidian-note",
            description: "Create a new note in Obsidian with optional content. Use '/' in filename to specify folder path (e.g., 'folder/subfolder/note').",
            schema: z.object({
                vault: z.string().optional().describe("Name of the Obsidian vault. If omitted, uses the currently open vault."),
                filename: z.string().optional().describe("Name or path of the note to create (e.g., 'note' or 'folder/subfolder/note'). If omitted, Obsidian creates 'Untitled'."),
                content: z.string().optional().describe("Content to add to the note."),
                overwrite: z.boolean().optional().describe("Whether to overwrite if the file exists."),
                append: z.boolean().optional().describe("Whether to append if the file exists (create if not)."),
                autoClose: z.boolean().optional().default(true).describe("Whether to auto-close the browser tab after triggering Obsidian. Set to false if you need to grant permissions on first use."),
            }),
            handler: async ({ vault, filename, content, overwrite, append, autoClose }, ctx) => {
                // Build URI manually with encodeURIComponent to avoid '+' for spaces
                let uri = "obsidian://new?";
                const parts: string[] = [];

                if (vault) parts.push(`vault=${encodeURIComponent(vault)}`);
                if (filename) {
                    // Sanitize filename: replace invalid characters but preserve "/" for folder paths
                    const sanitized = filename.replace(/[\\:"*?<>|]/g, '-');
                    parts.push(`file=${encodeURIComponent(sanitized)}`);
                }
                if (content) parts.push(`content=${encodeURIComponent(content)}`);
                if (overwrite) parts.push("overwrite=true");
                if (append) parts.push("append=true");

                uri += parts.join("&");

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
