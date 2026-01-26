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
}

export function extractContent(doc: Document, url: string, options?: ExtractOptions): ExtractedContent {
    const startTime = performance.now();

    let targetDoc: Document = doc;

    // If cssSelector is provided, create a temporary document with just the selected element
    if (options?.cssSelector) {
        const targetElement = doc.querySelector(options.cssSelector);
        if (!targetElement) {
            throw new Error(`No element found matching selector: ${options.cssSelector}`);
        }

        // Create a temporary document and clone the target element into it
        targetDoc = doc.implementation.createHTMLDocument('temp');
        targetDoc.body.appendChild(targetElement.cloneNode(true));
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
