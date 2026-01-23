/**
 * MCP Plugin System - Type Definitions
 * 
 * This module provides the core types and utilities for creating MCP plugins.
 */

import { z } from "zod";
import type { BrowserAPI } from "../browser-api";
import type { logger as Logger } from "../logger";

// Re-export zod for plugin developers
export { z };

/**
 * Result returned by a tool handler
 * Uses index signature to be compatible with MCP SDK types
 */
export interface ToolResult {
    [key: string]: unknown;
    content: { type: "text"; text: string; isError?: boolean }[];
}

/**
 * Context provided to plugin tools
 */
export interface PluginContext {
    browserApi: BrowserAPI;
    logger: typeof Logger;
}

/**
 * Definition for a single tool
 */
export interface ToolDefinition<T extends z.ZodRawShape = z.ZodRawShape> {
    name: string;
    description: string;
    schema: z.ZodObject<T>;
    handler: (
        params: z.infer<z.ZodObject<T>>,
        ctx: PluginContext
    ) => Promise<ToolResult>;
}

/**
 * Plugin metadata
 */
export interface PluginMetadata {
    name: string;
    version: string;
    description?: string;
}

/**
 * Complete plugin definition
 */
export interface PluginDefinition {
    metadata: PluginMetadata;
    tools: ToolDefinition<any>[];

    // Lifecycle hooks (optional)
    onLoad?: (ctx: PluginContext) => Promise<void>;
    onUnload?: () => Promise<void>;
}

/**
 * Helper function for creating type-safe plugin definitions
 * 
 * @example
 * ```typescript
 * export default definePlugin({
 *   metadata: { name: "my-plugin", version: "1.0.0" },
 *   tools: [{
 *     name: "my-tool",
 *     description: "Does something",
 *     schema: z.object({ input: z.string() }),
 *     handler: async ({ input }, ctx) => ({
 *       content: [{ type: "text", text: `Result: ${input}` }]
 *     })
 *   }]
 * });
 * ```
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
    return definition;
}

/**
 * Helper function for creating a single tool definition with type inference
 */
export function defineTool<T extends z.ZodRawShape>(
    tool: ToolDefinition<T>
): ToolDefinition<T> {
    return tool;
}
