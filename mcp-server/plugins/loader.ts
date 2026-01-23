/**
 * MCP Plugin System - Plugin Loader
 * 
 * Handles loading plugins from the user directory and registering
 * their tools with the MCP server.
 */

import * as fs from "fs";
import * as path from "path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PluginDefinition, PluginContext } from "./types";
import { logger } from "../logger";

/**
 * Load all plugins from a directory
 * 
 * @param pluginsDir - Directory containing plugin files (.js or .ts)
 * @returns Array of loaded plugin definitions
 */
export async function loadPluginsFromDirectory(
    pluginsDir: string
): Promise<PluginDefinition[]> {
    const plugins: PluginDefinition[] = [];

    // Check if directory exists
    if (!fs.existsSync(pluginsDir)) {
        logger.info(`Plugins directory not found: ${pluginsDir}, creating...`);
        fs.mkdirSync(pluginsDir, { recursive: true });
        return plugins;
    }

    // Read all files in the directory
    const files = fs.readdirSync(pluginsDir);
    const pluginFiles = files.filter(
        (file) => (file.endsWith(".js") || file.endsWith(".ts")) && !file.endsWith(".d.ts")
    );

    for (const file of pluginFiles) {
        const pluginPath = path.join(pluginsDir, file);

        try {
            // Dynamic import of the plugin
            const pluginModule = await import(pluginPath);
            const plugin: PluginDefinition = pluginModule.default || pluginModule;

            // Validate plugin structure
            if (!plugin.metadata?.name || !Array.isArray(plugin.tools)) {
                logger.warn(`Invalid plugin structure in ${file}, skipping`);
                continue;
            }

            plugins.push(plugin);
            logger.info(
                `Loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version} (${plugin.tools.length} tools)`
            );
        } catch (error) {
            logger.error(`Failed to load plugin ${file}`, { error: String(error) });
        }
    }

    return plugins;
}

/**
 * Register a plugin's tools with the MCP server
 * 
 * @param server - MCP server instance
 * @param plugin - Plugin definition to register
 * @param context - Plugin context (browserApi, logger, etc.)
 */
export async function registerPlugin(
    server: McpServer,
    plugin: PluginDefinition,
    context: PluginContext
): Promise<void> {
    // Call onLoad hook if defined
    if (plugin.onLoad) {
        try {
            await plugin.onLoad(context);
            logger.info(`Plugin ${plugin.metadata.name}: onLoad completed`);
        } catch (error) {
            logger.error(`Plugin ${plugin.metadata.name}: onLoad failed`, { error: String(error) });
            return; // Skip registering tools if onLoad fails
        }
    }

    // Register each tool
    for (const tool of plugin.tools) {
        try {
            server.tool(
                tool.name,
                tool.description,
                tool.schema.shape,
                async (params: unknown) => {
                    return await tool.handler(params as any, context);
                }
            );
            logger.info(`Registered tool: ${tool.name} (from ${plugin.metadata.name})`);
        } catch (error) {
            logger.error(`Failed to register tool ${tool.name}`, { error: String(error) });
        }
    }
}

/**
 * Load and register all plugins from a directory
 * 
 * @param server - MCP server instance
 * @param pluginsDir - Directory containing plugin files
 * @param context - Plugin context
 * @returns Array of loaded plugins
 */
export async function loadAndRegisterPlugins(
    server: McpServer,
    pluginsDir: string,
    context: PluginContext
): Promise<PluginDefinition[]> {
    const plugins = await loadPluginsFromDirectory(pluginsDir);

    for (const plugin of plugins) {
        await registerPlugin(server, plugin, context);
    }

    return plugins;
}
