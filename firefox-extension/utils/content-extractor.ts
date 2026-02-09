import Defuddle from 'defuddle';

export interface ExtractedContent {
    cleanedHtml: string;
    metadata: {
        title: string;
        author?: string;
        description?: string;
        publishedDate?: string;
        domain: string;
        url: string;
        siteName?: string;
    };
    statistics: {
        wordCount: number;
        parseTimeMs: number;
    };
}

export interface MaskOptions {
    elements: string[];                    // Element tag names to mask, e.g., ['article', 'section']
    behavior?: "replace" | "remove";       // 'replace' converts to div (default), 'remove' deletes entirely
}

export interface ExtractOptions {
    cssSelector?: string;
    matchAll?: boolean;
    mask?: MaskOptions;
    useDefuddle?: boolean;  // Whether to use Defuddle for content extraction. Default: true (no cssSelector) or false (with cssSelector)
}

/**
 * Process elements according to mask options.
 * - 'replace': Convert elements to div (preserves content, removes semantic meaning)
 * - 'remove': Delete elements entirely (removes content)
 */
function applyMask(doc: Document, maskOptions: MaskOptions): void {
    const behavior = maskOptions.behavior || 'replace';

    for (const tagName of maskOptions.elements) {
        const elements = doc.querySelectorAll(tagName);
        elements.forEach(element => {
            if (behavior === 'remove') {
                // Remove the element entirely
                element.parentNode?.removeChild(element);
            } else {
                // Replace with div (default)
                const div = doc.createElement('div');
                // Copy all attributes
                Array.from(element.attributes).forEach(attr => {
                    div.setAttribute(attr.name, attr.value);
                });
                // Copy all children
                while (element.firstChild) {
                    div.appendChild(element.firstChild);
                }
                // Replace the original element
                element.parentNode?.replaceChild(div, element);
            }
        });
    }
}

export function extractContent(doc: Document, url: string, options?: ExtractOptions): ExtractedContent {
    const startTime = performance.now();

    let targetDoc: Document = doc;

    // Step 1: If cssSelector is provided, extract the selected element(s) first
    if (options?.cssSelector) {
        if (options.matchAll) {
            // Match all elements with the selector
            const targetElements = doc.querySelectorAll(options.cssSelector);
            if (targetElements.length === 0) {
                throw new Error(`No elements found matching selector: ${options.cssSelector}`);
            }

            // Create a temporary document and clone all matching elements into it
            targetDoc = doc.implementation.createHTMLDocument('temp');
            targetElements.forEach(el => {
                targetDoc.body.appendChild(el.cloneNode(true));
            });
        } else {
            // Default: match only the first element
            const targetElement = doc.querySelector(options.cssSelector);
            if (!targetElement) {
                throw new Error(`No element found matching selector: ${options.cssSelector}`);
            }

            // Create a temporary document and clone the target element into it
            targetDoc = doc.implementation.createHTMLDocument('temp');
            targetDoc.body.appendChild(targetElement.cloneNode(true));
        }
    }

    // Step 2: Apply element masking to the selected content (or full doc if no cssSelector)
    if (options?.mask && options.mask.elements.length > 0) {
        // If we already have a cloned targetDoc from cssSelector, use it directly
        // Otherwise, clone the original document first
        if (targetDoc === doc) {
            const tempDoc = doc.implementation.createHTMLDocument('temp');
            const clonedBody = doc.body.cloneNode(true) as HTMLElement;
            tempDoc.body.innerHTML = '';
            while (clonedBody.firstChild) {
                tempDoc.body.appendChild(clonedBody.firstChild);
            }
            targetDoc = tempDoc;
        }
        // Apply masking to the target document
        applyMask(targetDoc, options.mask);
    }

    // Determine whether to use Defuddle:
    // - If useDefuddle is explicitly set, use that value
    // - If cssSelector is provided, default to NOT using Defuddle (user already targeted content)
    // - Otherwise, always use Defuddle (need to extract main content from full page)
    const shouldUseDefuddle = options?.useDefuddle !== undefined
        ? options.useDefuddle
        : !options?.cssSelector;

    if (shouldUseDefuddle) {
        // Initialize Defuddle and parse
        const defuddle = new Defuddle(targetDoc);
        const result = defuddle.parse();

        const endTime = performance.now();

        return {
            cleanedHtml: result.content || '',
            metadata: {
                title: result.title || doc.title,
                author: result.author,
                description: result.description,
                publishedDate: result.published,
                domain: new URL(url).hostname,
                url: url,
                siteName: result.site,
            },
            statistics: {
                wordCount: result.wordCount || 0,
                parseTimeMs: Math.round(endTime - startTime),
            }
        };
    } else {
        // Without Defuddle: just return the HTML from targetDoc directly
        const endTime = performance.now();
        const html = targetDoc.body.innerHTML;

        // Simple word count estimation
        const textContent = targetDoc.body.textContent || '';
        const wordCount = textContent.trim().split(/\s+/).filter(w => w.length > 0).length;

        return {
            cleanedHtml: html,
            metadata: {
                title: doc.title,
                author: undefined,
                description: undefined,
                publishedDate: undefined,
                domain: new URL(url).hostname,
                url: url,
                siteName: undefined,
            },
            statistics: {
                wordCount,
                parseTimeMs: Math.round(endTime - startTime),
            }
        };
    }
}
