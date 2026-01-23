/**
 * MCP Plugin System - Public API
 * 
 * This module exports all the types and utilities needed for plugin development.
 */

// Types
export type {
    ToolResult,
    PluginContext,
    ToolDefinition,
    PluginMetadata,
    PluginDefinition,
} from "./types";

// Helper functions for plugin development
export { definePlugin, defineTool, z } from "./types";

// Loader functions (for server use)
export {
    loadPluginsFromDirectory,
    registerPlugin,
    loadAndRegisterPlugins,
} from "./loader";
