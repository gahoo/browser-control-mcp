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

export interface ExtractOptions {
    cssSelector?: string;
    matchAll?: boolean;
}

export function extractContent(doc: Document, url: string, options?: ExtractOptions): ExtractedContent {
    const startTime = performance.now();

    let targetDoc: Document = doc;

    // If cssSelector is provided, create a temporary document with selected element(s)
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
}
