/**
 * Tool Registry - Enables programmatic invocation of registered MCP tools.
 *
 * Since McpServer doesn't expose a public API for calling tools internally,
 * this registry maintains a parallel map of tool handlers that can be called
 * by the macro executor or other internal components.
 */

import { logger } from "./logger";

export type ToolHandler = (params: any) => Promise<any>;

export class ToolRegistry {
    private handlers = new Map<string, ToolHandler>();

    /**
     * Register a tool handler by name.
     * Called during server initialization alongside mcpServer.tool().
     */
    register(name: string, handler: ToolHandler): void {
        if (this.handlers.has(name)) {
            logger.warn(`ToolRegistry: overwriting handler for "${name}"`);
        }
        this.handlers.set(name, handler);
        logger.debug(`ToolRegistry: registered "${name}"`);
    }

    /**
     * Call a registered tool by name.
     * @returns The tool's result (same shape as MCP tool response)
     * @throws Error if tool is not found
     */
    async call(name: string, params: Record<string, any>): Promise<any> {
        const handler = this.handlers.get(name);
        if (!handler) {
            throw new Error(`Tool "${name}" not found in registry. Available: ${[...this.handlers.keys()].join(", ")}`);
        }
        logger.info(`ToolRegistry: calling "${name}"`, { params: Object.keys(params) });
        return handler(params);
    }

    /**
     * Check if a tool is registered.
     */
    has(name: string): boolean {
        return this.handlers.has(name);
    }

    /**
     * Get all registered tool names.
     */
    getToolNames(): string[] {
        return [...this.handlers.keys()];
    }
}
