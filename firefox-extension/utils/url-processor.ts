/**
 * URL Processing Utilities
 * Handles relative URL to absolute URL conversion
 */

/**
 * Process HTML content and convert relative URLs to absolute URLs
 */
export function processUrls(html: string, baseUrl: URL): string {
    // Process href attributes
    html = html.replace(/href="([^"]+)"/g, (match, url) => {
        try {
            const absoluteUrl = new URL(url, baseUrl).href;
            return `href="${absoluteUrl}"`;
        } catch {
            return match;
        }
    });

    // Process src attributes
    html = html.replace(/src="([^"]+)"/g, (match, url) => {
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
                    if (parts.length >= 1) {
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

/**
 * Extract domain from URL
 */
export function getDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

/**
 * Check if URL is valid
 */
export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}
