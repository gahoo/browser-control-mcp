import { extractContent, ExtractOptions } from './content-extractor';

/**
 * This script is bundled and injected into the browser tab.
 * It reads options from window.__extractionOptions and assigns the result to 
 * window.__extractionResult so the background script can retrieve it.
 */
(function () {
    try {
        console.log('Browser Control MCP: Starting content extraction...');

        // Read options from window variable (set by message handler before injection)
        const options: ExtractOptions | undefined = (window as any).__extractionOptions;

        const result = extractContent(document, window.location.href, options);
        (window as any).__extractionResult = result;
        console.log('Browser Control MCP: Extraction complete.', {
            title: result.metadata.title,
            wordCount: result.statistics.wordCount,
            cssSelector: options?.cssSelector
        });
        return result; // Still return it just in case
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Browser Control MCP: Extraction error:', error);
        (window as any).__extractionResult = { error: errorMsg };
        return { error: errorMsg };
    }
})();

