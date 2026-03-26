/**
 * Macro Executor - Runs sequential tool workflows defined in YAML/JSON.
 *
 * Supports:
 * - Sequential tool execution with output piping
 * - Mustache-style variable templates ({{var.field}})
 * - Built-in commands: delay, wait-for-element
 * - Conditional step execution
 * - Recursive macro calls (with depth protection)
 * - Error handling strategies per step
 */

import * as YAML from "yaml";
import * as fs from "fs/promises";
import * as path from "path";
import { ToolRegistry } from "./tool-registry";
import { logger } from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MacroStep {
    /** MCP tool name to call */
    tool?: string;
    /** Built-in command name (delay, wait-for-element) */
    builtin?: string;
    /** Parameters for the tool/builtin (supports {{template}} variables) */
    params?: Record<string, any>;
    /** Variable name to store the step's output under */
    output?: string;
    /** Condition template; step is skipped if it resolves to falsy */
    condition?: string;
    /** Error handling: "stop" (default), "skip", "continue" */
    onError?: "stop" | "skip" | "continue";
}

export interface MacroDefinition {
    name?: string;
    description?: string;
    steps: MacroStep[];
}

export interface MacroExecutionResult {
    success: boolean;
    /** Number of steps executed (including skipped) */
    stepsExecuted: number;
    /** Number of steps skipped due to conditions */
    stepsSkipped: number;
    /** Collected outputs from all steps */
    outputs: Record<string, any>;
    /** Per-step execution log */
    log: StepLog[];
    /** Error message if failed */
    error?: string;
}

interface StepLog {
    index: number;
    type: "tool" | "builtin";
    name: string;
    status: "success" | "skipped" | "error";
    durationMs: number;
    error?: string;
    outputKey?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_RECURSION_DEPTH = 10;
const WAIT_FOR_ELEMENT_DEFAULT_TIMEOUT = 10000;
const WAIT_FOR_ELEMENT_POLL_INTERVAL = 500;

// ─── Template Engine ─────────────────────────────────────────────────────────

/**
 * Resolve a dot-separated path in an object.
 * e.g., getNestedValue({a: {b: 1}}, "a.b") => 1
 */
function getNestedValue(obj: any, path: string): any {
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
        if (current == null) return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Resolve mustache-style templates in a value.
 * - If the entire value is a single template "{{path}}", return the raw resolved value (preserving types).
 * - If mixed with text "prefix {{path}} suffix", return a string.
 * - Recursively processes objects and arrays.
 */
function resolveTemplate(value: any, context: Record<string, any>): any {
    if (typeof value === "string") {
        // Check if the entire string is a single template expression
        const singleMatch = value.match(/^\{\{(.+?)\}\}$/);
        if (singleMatch) {
            const resolved = getNestedValue(context, singleMatch[1].trim());
            logger.debug(`Template resolved (single): "${value}" ->`, { resolved, type: typeof resolved });
            return resolved; // Return raw value (number, object, etc.)
        }

        // Replace embedded templates within a string
        const result = value.replace(/\{\{(.+?)\}\}/g, (_match, path) => {
            const resolved = getNestedValue(context, path.trim());
            if (resolved === undefined) return "";
            if (typeof resolved === "object") return JSON.stringify(resolved);
            return String(resolved);
        });
        return result;
    }

    if (Array.isArray(value)) {
        return value.map((item) => resolveTemplate(item, context));
    }

    if (value !== null && typeof value === "object") {
        const result: Record<string, any> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = resolveTemplate(val, context);
        }
        return result;
    }

    return value; // numbers, booleans, null — return as-is
}

// ─── Built-in Commands ───────────────────────────────────────────────────────

async function builtinDelay(params: Record<string, any>): Promise<any> {
    const ms = params.ms ?? params.duration ?? 1000;
    if (typeof ms !== "number" || ms < 0) {
        throw new Error(`delay: invalid ms value: ${ms}`);
    }
    logger.info(`Macro builtin: delay ${ms}ms`);
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { delayed: ms };
}

async function builtinWaitForElement(
    params: Record<string, any>,
    registry: ToolRegistry
): Promise<any> {
    const tabId = params.tabId;
    const selector = params.selector;
    const xpath = params.xpath;
    const text = params.text;
    const timeout = params.timeout ?? WAIT_FOR_ELEMENT_DEFAULT_TIMEOUT;
    const interval = params.interval ?? WAIT_FOR_ELEMENT_POLL_INTERVAL;

    if (tabId === undefined) {
        throw new Error("wait-for-element: tabId is required");
    }
    if (!selector && !xpath && !text) {
        throw new Error("wait-for-element: one of selector, xpath, or text is required");
    }

    // Determine query and mode for find-element
    let query: string;
    let mode: string;
    if (selector) {
        query = selector;
        mode = "css";
    } else if (xpath) {
        query = xpath;
        mode = "xpath";
    } else {
        query = text!;
        mode = "text";
    }

    logger.info(`Macro builtin: wait-for-element (${mode}: "${query}", timeout: ${timeout}ms)`);

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            const result = await registry.call("find-element", {
                tabId,
                query,
                mode,
            });

            // find-element returns { content: [{type: "text", text: ...}] }
            // Check if elements were found (result text is NOT "No elements found")
            const textContent = result?.content?.[0]?.text;
            if (textContent && !textContent.includes("No elements found")) {
                logger.info(`wait-for-element: found after ${Date.now() - startTime}ms`);
                // Try to parse the JSON result
                try {
                    return JSON.parse(textContent);
                } catch {
                    return { found: true, raw: textContent };
                }
            }
        } catch {
            // find-element threw an error, keep polling
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new Error(
        `wait-for-element: timed out after ${timeout}ms waiting for ${mode}="${query}"`
    );
}

// ─── Macro Executor ──────────────────────────────────────────────────────────

/**
 * Parse a macro definition from YAML or JSON string.
 */
export function parseMacroDefinition(content: string): MacroDefinition {
    // Try JSON first (faster), fall back to YAML
    const trimmed = content.trim();
    let parsed: any;

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            parsed = YAML.parse(trimmed);
        }
    } else {
        parsed = YAML.parse(trimmed);
    }

    if (!parsed || !Array.isArray(parsed.steps)) {
        throw new Error(
            'Invalid macro definition: must have a "steps" array'
        );
    }

    return parsed as MacroDefinition;
}

/**
 * Execute a macro definition.
 *
 * @param definition - Parsed macro definition
 * @param input - External input parameters (accessible via {{input.xxx}})
 * @param registry - Tool registry for calling MCP tools
 * @param depth - Current recursion depth (for protection)
 */
export async function executeMacro(
    definition: MacroDefinition,
    input: Record<string, any>,
    registry: ToolRegistry,
    depth: number = 0
): Promise<MacroExecutionResult> {
    if (depth >= MAX_RECURSION_DEPTH) {
        return {
            success: false,
            stepsExecuted: 0,
            stepsSkipped: 0,
            outputs: {},
            log: [],
            error: `Maximum recursion depth (${MAX_RECURSION_DEPTH}) exceeded`,
        };
    }

    const context: Record<string, any> = { input };
    const log: StepLog[] = [];
    let stepsExecuted = 0;
    let stepsSkipped = 0;

    logger.info(
        `Macro: executing "${definition.name || "unnamed"}" (${definition.steps.length} steps, depth=${depth})`
    );

    for (let i = 0; i < definition.steps.length; i++) {
        const step = definition.steps[i];
        const stepStart = Date.now();
        const stepName = step.tool || step.builtin || "unknown";
        const stepType = step.builtin ? "builtin" : "tool";

        // ── Condition check ──
        if (step.condition !== undefined) {
            const conditionValue = resolveTemplate(step.condition, context);
            // Treat falsy, "false", empty string, null, undefined as false
            const isTruthy =
                conditionValue &&
                conditionValue !== "false" &&
                conditionValue !== "null" &&
                conditionValue !== "undefined" &&
                conditionValue !== "";

            if (!isTruthy) {
                logger.info(`Macro step [${i}] ${stepName}: skipped (condition not met)`);
                log.push({
                    index: i,
                    type: stepType,
                    name: stepName,
                    status: "skipped",
                    durationMs: Date.now() - stepStart,
                    outputKey: step.output,
                });
                stepsSkipped++;
                continue;
            }
        }

        // ── Resolve params ──
        const resolvedParams = step.params
            ? resolveTemplate(step.params, context)
            : {};
        
        try {
            let result: any;

            if (step.builtin) {
                // ── Built-in commands ──
                switch (step.builtin) {
                    case "delay":
                        result = await builtinDelay(resolvedParams);
                        break;
                    case "wait-for-element":
                        result = await builtinWaitForElement(
                            resolvedParams,
                            registry
                        );
                        break;
                    default:
                        throw new Error(
                            `Unknown builtin: "${step.builtin}". Available: delay, wait-for-element`
                        );
                }
            } else if (step.tool) {
                // ── MCP tool call ──
                // Special handling for recursive execute-macro
                if (step.tool === "execute-macro") {
                    result = await handleRecursiveMacroCall(
                        resolvedParams,
                        registry,
                        depth
                    );
                } else {
                    result = await registry.call(step.tool, resolvedParams);
                }
            } else {
                throw new Error(
                    `Step [${i}]: must specify either "tool" or "builtin"`
                );
            }

            // ── Store output ──
            if (step.output) {
                // For MCP tool results, try to extract meaningful data
                context[step.output] = extractToolOutput(result);
            }

            log.push({
                index: i,
                type: stepType,
                name: stepName,
                status: "success",
                durationMs: Date.now() - stepStart,
                outputKey: step.output,
            });
            stepsExecuted++;
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const onError = step.onError ?? "stop";

            logger.error(`Macro step [${i}] ${stepName} failed: ${errorMsg}`);

            log.push({
                index: i,
                type: stepType,
                name: stepName,
                status: "error",
                durationMs: Date.now() - stepStart,
                error: errorMsg,
                outputKey: step.output,
            });

            if (onError === "stop") {
                return {
                    success: false,
                    stepsExecuted,
                    stepsSkipped,
                    outputs: extractOutputs(context),
                    log,
                    error: `Step [${i}] "${stepName}" failed: ${errorMsg}`,
                };
            }

            // "skip" or "continue" — keep going
            if (step.output) {
                context[step.output] = { error: errorMsg };
            }
            stepsExecuted++;
        }
    }

    return {
        success: true,
        stepsExecuted,
        stepsSkipped,
        outputs: extractOutputs(context),
        log,
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Handle recursive execute-macro calls.
 */
async function handleRecursiveMacroCall(
    params: Record<string, any>,
    registry: ToolRegistry,
    currentDepth: number
): Promise<any> {
    if (!params.definition) {
        throw new Error("execute-macro: missing 'definition' parameter");
    }

    let macroContent = params.definition;

    // Check if definition is potentially a file path
    if (typeof macroContent === 'string' && (macroContent.startsWith('/') || macroContent.startsWith('~/')) && /\.(yaml|yml|json)$/i.test(macroContent)) {
        try {
            let filePath = macroContent;
            if (filePath.startsWith('~/')) {
                const homeDir = process.env.HOME || process.env.USERPROFILE || '';
                filePath = path.join(homeDir, filePath.slice(2));
            }
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
                macroContent = await fs.readFile(filePath, "utf-8");
                logger.debug(`Loaded macro definition from file: ${filePath}`);
            }
        } catch (e) {
            const err = e as NodeJS.ErrnoException;
            if (err.code !== 'ENOENT') {
                throw new Error(`execute-macro: error reading macro file ${macroContent}: ${String(e)}`);
            }
        }
    }

    let definition: MacroDefinition;
    // definition might already be parsed if embedded directly in JSON/YAML (though the schema expects a string, it can happen)
    if (typeof macroContent === "string") {
        definition = parseMacroDefinition(macroContent);
    } else {
        definition = macroContent as MacroDefinition;
    }

    const subInput = params.input || {};
    return executeMacro(definition, subInput, registry, currentDepth + 1);
}

/**
 * Extract meaningful output from an MCP tool result.
 * MCP tools return { content: [{ type: "text", text: "..." }] }.
 * This tries to parse JSON from the text, otherwise returns the raw text.
 */
function extractToolOutput(result: any): any {
    if (!result?.content || !Array.isArray(result.content)) {
        return result;
    }

    // Collect all text content
    const texts = result.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);

    if (texts.length === 0) return result;

    // If single text, try to parse as JSON
    if (texts.length === 1) {
        try {
            return JSON.parse(texts[0]);
        } catch {
            return { text: texts[0], _raw: result };
        }
    }

    // Multiple text items — return as array
    return {
        texts,
        _raw: result,
    };
}

/**
 * Extract user-defined outputs from context (exclude 'input' key).
 */
function extractOutputs(
    context: Record<string, any>
): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (const [key, value] of Object.entries(context)) {
        if (key !== "input") {
            outputs[key] = value;
        }
    }
    return outputs;
}
