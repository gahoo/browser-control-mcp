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
            description: "Create a new note in Obsidian with optional content.",
            schema: z.object({
                vault: z.string().optional().describe("Name of the Obsidian vault. If omitted, uses the currently open vault."),
                filename: z.string().optional().describe("Name of the note to create. If omitted, Obsidian creates 'Untitled'."),
                content: z.string().optional().describe("Content to add to the note."),
                overwrite: z.boolean().optional().describe("Whether to overwrite if the file exists."),
                append: z.boolean().optional().describe("Whether to append if the file exists (create if not)."),
            }),
            handler: async ({ vault, filename, content, overwrite, append }, ctx) => {
                // Build URI manually with encodeURIComponent to avoid '+' for spaces
                let uri = "obsidian://new?";
                const parts: string[] = [];

                if (vault) parts.push(`vault=${encodeURIComponent(vault)}`);
                if (filename) {
                    // Sanitize filename: replace invalid characters
                    const sanitized = filename.replace(/[\\/:"*?<>|]/g, '-');
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
                if (tabId !== undefined) {
                    // Wait a bit for the URI to be processed by the OS
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await ctx.browserApi.closeTabs([tabId]);
                    ctx.logger.info(`Closed temporary tab: ${tabId}`);
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: `triggered Obsidian 'new' action: ${uri}`,
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
