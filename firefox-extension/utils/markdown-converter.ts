import TurndownService from 'turndown';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { processUrls } from './url-processor';

export function convertToMarkdown(html: string, baseUrl: string): string {
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
        preformattedCode: true,
    });

    // Rule: Table
    turndownService.addRule('table', {
        filter: 'table',
        replacement: function (content, node) {
            if (!(node instanceof HTMLTableElement)) return content;

            // Check for complex structure (colspan/rowspan)
            const hasComplexStructure = Array.from(node.querySelectorAll('td, th')).some(cell =>
                cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')
            );

            if (hasComplexStructure) {
                // Return cleaned HTML for complex tables as Markdown doesn't support them well
                return '\n\n' + node.outerHTML + '\n\n';
            }

            // Simple table processing
            const rows = Array.from(node.rows).map(row => {
                const cells = Array.from(row.cells).map(cell => {
                    let cellContent = turndownService.turndown(cell.innerHTML)
                        .replace(/\n/g, ' ')
                        .trim();
                    return cellContent.replace(/\|/g, '\\|');
                });
                return `| ${cells.join(' | ')} |`;
            });

            if (rows.length === 0) return '';

            const separatorRow = `| ${Array(node.rows[0].cells.length).fill('---').join(' | ')} |`;
            const tableContent = [rows[0], separatorRow, ...rows.slice(1)].join('\n');

            return `\n\n${tableContent}\n\n`;
        }
    });

    // Rule: List
    turndownService.addRule('list', {
        filter: ['ul', 'ol'],
        replacement: function (content, node) {
            content = content.trim();
            const isTopLevel = !(node.parentNode && (node.parentNode.nodeName === 'UL' || node.parentNode.nodeName === 'OL'));
            return (isTopLevel ? '\n' : '') + content + '\n';
        }
    });

    // Rule: List Item
    turndownService.addRule('listItem', {
        filter: 'li',
        replacement: function (content, node, options) {
            if (!(node instanceof HTMLElement)) return content;

            content = content
                .replace(/\n+$/, '')
                .split('\n')
                .filter(line => line.length > 0)
                .join('\n\t');

            let prefix = options.bulletListMarker + ' ';
            let level = 0;
            let currentParent = node.parentNode;
            while (currentParent && (currentParent.nodeName === 'UL' || currentParent.nodeName === 'OL')) {
                level++;
                currentParent = currentParent.parentNode;
            }

            const indentLevel = Math.max(0, level - 1);
            prefix = '\t'.repeat(indentLevel) + prefix;

            if (node.parentNode instanceof HTMLOListElement) {
                const start = node.parentNode.getAttribute('start');
                const index = Array.from(node.parentNode.children).indexOf(node) + 1;
                prefix = '\t'.repeat(indentLevel) + (start ? Number(start) + index - 1 : index) + '. ';
            }

            return prefix + content.trim() + (node.nextSibling ? '\n' : '');
        }
    });

    // Rule: MathJax/MathML
    turndownService.addRule('math', {
        filter: (node) => {
            return node.nodeName.toLowerCase() === 'math' ||
                (node instanceof Element && node.classList &&
                    (node.classList.contains('mwe-math-element') ||
                        node.classList.contains('katex') ||
                        node.classList.contains('MathJax')));
        },
        replacement: (content, node) => {
            if (!(node instanceof Element)) return content;

            let latex = '';

            // Try to get latex from attributes
            const dataLatex = node.getAttribute('data-latex');
            const altText = node.getAttribute('alttext');

            if (dataLatex) {
                latex = dataLatex.trim();
            } else if (altText) {
                latex = altText.trim();
            } else if (node.nodeName.toLowerCase() === 'math') {
                try {
                    latex = MathMLToLaTeX.convert(node.outerHTML);
                } catch (e) {
                    latex = node.textContent || '';
                }
            } else {
                latex = node.textContent || '';
            }

            const isBlock = node.getAttribute('display') === 'block' ||
                node.classList.contains('mwe-math-fallback-image-display') ||
                node.classList.contains('MathJax_Display');

            if (isBlock) {
                return `\n$$\n${latex}\n$$\n`;
            } else {
                return `$${latex}$`;
            }
        }
    });

    // Rule: Code Blocks
    turndownService.addRule('preformattedCode', {
        filter: 'pre',
        replacement: (content, node) => {
            if (!(node instanceof HTMLElement)) return content;
            const codeElement = node.querySelector('code');
            const code = codeElement ? codeElement.textContent : node.textContent;
            const language = codeElement ? (codeElement.getAttribute('class')?.match(/language-(\w+)/)?.[1] || '') : '';

            return `\n\`\`\`${language}\n${code?.trim()}\n\`\`\`\n`;
        }
    });

    // Rule: Embeds (YouTube, Twitter)
    turndownService.addRule('embeds', {
        filter: (node) => {
            if (node instanceof HTMLIFrameElement) {
                const src = node.getAttribute('src');
                return !!src && (src.includes('youtube.com') || src.includes('youtu.be') || src.includes('twitter.com') || src.includes('x.com'));
            }
            return false;
        },
        replacement: (content, node) => {
            if (!(node instanceof HTMLIFrameElement)) return content;
            const src = node.getAttribute('src');
            if (!src) return content;

            if (src.includes('youtube.com') || src.includes('youtu.be')) {
                const match = src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]+)/);
                if (match) return `\n![](https://www.youtube.com/watch?v=${match[1]})\n`;
            }

            if (src.includes('twitter.com') || src.includes('x.com')) {
                const match = src.match(/status\/(\d+)/);
                if (match) return `\n![](https://x.com/i/status/${match[1]})\n`;
            }

            return `\n[Embed](${src})\n`;
        }
    });

    // Rule: GitHub style alerts to Obsidian callouts
    turndownService.addRule('callouts', {
        filter: (node) => node instanceof HTMLElement && node.classList.contains('markdown-alert'),
        replacement: (content, node) => {
            if (!(node instanceof HTMLElement)) return content;
            const type = Array.from(node.classList)
                .find(c => c.startsWith('markdown-alert-'))
                ?.replace('markdown-alert-', '')
                .toUpperCase() || 'NOTE';

            return `\n> [!${type}]\n> ${content.trim().replace(/\n/g, '\n> ')}\n`;
        }
    });

    // Rule: Strikethrough
    turndownService.addRule('strikethrough', {
        filter: ['del', 's', 'strike'] as any[],
        replacement: (content) => `~~${content}~~`
    });

    // Rule: Highlight
    turndownService.addRule('highlight', {
        filter: 'mark',
        replacement: (content) => `==${content}==`
    });

    // Process URLs first (with validation)
    let processedHtml = html;
    try {
        if (baseUrl) {
            processedHtml = processUrls(html, new URL(baseUrl));
        }
    } catch {
        console.warn('Invalid baseUrl, skipping URL processing:', baseUrl);
    }

    // Basic cleanup
    turndownService.remove(['style', 'script', 'button', 'noscript']);

    try {
        let markdown = turndownService.turndown(processedHtml);

        // Post-processing
        markdown = markdown
            .replace(/\n*(?<!!)\[\]\([^)]+\)\n*/g, '') // Remove empty links
            .replace(/\n{3,}/g, '\n\n'); // Normalize redundant newlines

        return markdown.trim();
    } catch (error) {
        console.error('Markdown conversion error:', error);
        return 'Error converting content to Markdown.';
    }
}
