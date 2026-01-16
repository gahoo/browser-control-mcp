/**
 * URL Processing Utilities
 * Handles relative URL to absolute URL conversion
 */

/**
 * Process HTML content and convert relative URLs to absolute URLs
 * Uses negative lookahead to skip URLs that are already absolute (have a scheme)
 */
export function processUrls(html: string, baseUrl: URL): string {
    // Process href attributes (skip absolute URLs with scheme like http:, https:, mailto:, etc.)
    html = html.replace(/href="(?![a-z][a-z0-9+.-]*:)([^"]+)"/gi, (match, url) => {
        try {
            const absoluteUrl = new URL(url, baseUrl).href;
            return `href="${absoluteUrl}"`;
        } catch {
            return match;
        }
    });

    // Process src attributes (skip absolute URLs)
    html = html.replace(/src="(?![a-z][a-z0-9+.-]*:)([^"]+)"/gi, (match, url) => {
        try {
            const absoluteUrl = new URL(url, baseUrl).href;
            return `src="${absoluteUrl}"`;
        } catch {
            return match;
        }
    });

    // Process srcset attributes
    html = html.replace(/srcset="([^"]+)"/g, (match, srcset) => {
        try {
            const processedSrcset = srcset
                .split(',')
                .map((entry: string) => {
                    const parts = entry.trim().split(/\s+/);
                    if (parts.length >= 1 && !/^[a-z][a-z0-9+.-]*:/i.test(parts[0])) {
                        try {
                            parts[0] = new URL(parts[0], baseUrl).href;
                        } catch {
                            // Keep original if URL parsing fails
                        }
                    }
                    return parts.join(' ');
                })
                .join(', ');
            return `srcset="${processedSrcset}"`;
        } catch {
            return match;
        }
    });

    return html;
}
