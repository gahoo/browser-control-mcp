import { extractContent } from './content-extractor';

/**
 * This script is bundled and injected into the browser tab.
 * It assigns the result to a global variable so the background script can retrieve it.
 */
(function () {
    try {
        console.log('Browser Control MCP: Starting content extraction...');
        const result = extractContent(document, window.location.href);
        (window as any).__extractionResult = result;
        console.log('Browser Control MCP: Extraction complete.', {
            title: result.metadata.title,
            wordCount: result.statistics.wordCount
        });
        return result; // Still return it just in case
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Browser Control MCP: Extraction error:', error);
        (window as any).__extractionResult = { error: errorMsg };
        return { error: errorMsg };
    }
})();
