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

export function extractContent(doc: Document, url: string): ExtractedContent {
    const startTime = performance.now();

    // Initialize Defuddle and parse
    const defuddle = new Defuddle(doc);
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
