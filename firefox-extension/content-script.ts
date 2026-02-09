
import { extractContent } from './utils/content-extractor';

// Helper: Get unique CSS selector
function getUniqueSelector(el: HTMLElement | null): string {
    if (!el) return '';
    if (el.id) return '#' + CSS.escape(el.id);

    let path: string[] = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector = '#' + CSS.escape(el.id);
            path.unshift(selector);
            break;
        } else {
            let sib = el, nth = 1;
            while (sib = sib.previousElementSibling as HTMLElement) {
                if (sib.nodeName.toLowerCase() === selector) nth++;
            }
            if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
        }
        path.unshift(selector);
        el = el.parentNode as HTMLElement;
    }
    return path.join(' > ');
}

// Helper: Get XPath
function getXPath(el: HTMLElement | null): string {
    if (!el) return '';
    if (el.id) return '//*[@id="' + el.id + '"]';

    let path: string[] = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
        let idx = 0;
        let sibling = el.previousSibling;
        while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === el.nodeName) idx++;
            sibling = sibling.previousSibling;
        }
        let tagName = el.nodeName.toLowerCase();
        let pathIndex = idx ? '[' + (idx + 1) + ']' : '';
        path.unshift(tagName + pathIndex);
        el = el.parentNode as HTMLElement;
    }
    return '/' + path.join('/');
}

function isVisible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

// Handler: Get Clickable Elements
function getClickableElements(selectorFilter?: string) {
    const clickableSelectors = 'a[href], button, input[type="button"], input[type="submit"], [role="button"], [onclick]';
    const selector = selectorFilter ? selectorFilter + ', ' + selectorFilter + ' ' + clickableSelectors : clickableSelectors;
    const elements = document.querySelectorAll(selectorFilter || clickableSelectors);

    return Array.from(elements).map((el, index) => ({
        index,
        tagName: el.tagName.toLowerCase(),
        textContent: (el.textContent || '').trim().substring(0, 100),
        href: (el as HTMLAnchorElement).href || undefined,
        type: (el as HTMLInputElement).type || undefined,
        selector: getUniqueSelector(el as HTMLElement),
        xpath: getXPath(el as HTMLElement)
    })).filter(el => el.textContent || el.href);
}

// Handler: Click Element
function clickElement(payload: { textContent?: string, selector?: string, xpath?: string, index?: number }) {
    const { textContent, selector, xpath, index } = payload;
    let elements: Element[] = [];

    if (xpath) {
        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i++) {
            const item = result.snapshotItem(i);
            if (item) elements.push(item as Element);
        }
    } else if (selector) {
        elements = Array.from(document.querySelectorAll(selector));
    } else if (textContent) {
        const clickableSelectors = 'a[href], button, input[type="button"], input[type="submit"], [role="button"], [onclick]';
        const allClickable = document.querySelectorAll(clickableSelectors);
        elements = Array.from(allClickable).filter(el =>
            (el.textContent || '').toLowerCase().includes(textContent.toLowerCase())
        );
    }

    if (elements.length === 0) {
        return { success: false, error: 'No matching elements found' };
    }

    const targetIndex = index ?? 0;
    const targetEl = elements[targetIndex] as HTMLElement;
    if (!targetEl) {
        return { success: false, error: 'Element at index ' + targetIndex + ' not found. Found ' + elements.length + ' elements.' };
    }

    targetEl.click();

    return {
        success: true,
        clickedElement: {
            index: targetIndex,
            tagName: targetEl.tagName.toLowerCase(),
            textContent: (targetEl.textContent || '').trim().substring(0, 100),
            href: (targetEl as HTMLAnchorElement).href || undefined,
            type: (targetEl as HTMLInputElement).type || undefined,
            selector: getUniqueSelector(targetEl),
            xpath: getXPath(targetEl)
        }
    };
}

// Handler: Find Element
function findElement(payload: { query: string, mode: "css" | "xpath" | "text" | "regexp" }) {
    const { query, mode } = payload;
    let elements: Node[] = [];

    try {
        if (mode === 'css') {
            elements = Array.from(document.querySelectorAll(query));
        } else if (mode === 'xpath') {
            const result = document.evaluate(query, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            for (let i = 0; i < result.snapshotLength; i++) {
                const item = result.snapshotItem(i);
                if (item) elements.push(item);
            }
        } else if (mode === 'text') {
            const lowerQuery = query.toLowerCase();
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent && node.textContent.toLowerCase().includes(lowerQuery)) {
                    elements.push(node);
                }
            }
        } else if (mode === 'regexp') {
            const regex = new RegExp(query, 'i');
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null);
            let node;
            while (node = walker.nextNode()) {
                if (regex.test(node.textContent || '')) {
                    elements.push(node);
                }
            }
        }
    } catch (e) {
        // ignore invalid selectors
    }

    const limitedElements = elements.slice(0, 100);
    return limitedElements.map((el, index) => ({
        index,
        tagName: (el as HTMLElement).tagName?.toLowerCase() || '',
        text: (el.textContent || '').trim().substring(0, 100),
        html: ((el as HTMLElement).outerHTML || '').substring(0, 500),
        selector: getUniqueSelector(el as HTMLElement),
        xpath: getXPath(el as HTMLElement),
        isVisible: isVisible(el as HTMLElement)
    }));
}

// Handler: Type Text
function typeText(payload: { text: string, selector?: string, xpath?: string, index?: number }) {
    const { text, selector, xpath, index } = payload;
    let elements: Element[] = [];

    if (xpath) {
        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i++) {
            const item = result.snapshotItem(i);
            if (item) elements.push(item as Element);
        }
    } else if (selector) {
        elements = Array.from(document.querySelectorAll(selector));
    }

    if (elements.length === 0) {
        return { success: false, error: 'No matching elements found' };
    }

    const targetIndex = index ?? 0;
    const targetEl = elements[targetIndex] as HTMLElement;

    if (!targetEl) {
        return { success: false, error: 'Element at index ' + targetIndex + ' not found' };
    }

    targetEl.focus();

    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
        (targetEl as HTMLInputElement).value = text;
    } else if (targetEl.isContentEditable) {
        targetEl.textContent = text;
    } else {
        return { success: false, error: 'Element is not an input, textarea or contenteditable' };
    }

    targetEl.dispatchEvent(new Event('input', { bubbles: true }));
    targetEl.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
}

// Handler: Press Key
function pressKey(payload: { key: string, selector?: string, xpath?: string, index?: number }) {
    const { key, selector, xpath, index } = payload;
    const keyCodes: Record<string, number> = {
        'Enter': 13, 'Tab': 9, 'Escape': 27, 'Backspace': 8, 'Space': 32,
        'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39
    };

    let elements: Element[] = [];
    if (xpath) {
        const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i++) {
            const item = result.snapshotItem(i);
            if (item) elements.push(item as Element);
        }
    } else if (selector) {
        elements = Array.from(document.querySelectorAll(selector));
    }

    if (elements.length === 0) {
        // Fallback to active element or body
        elements = [document.activeElement || document.body];
    }

    const targetIndex = index ?? 0;
    const targetEl = elements[targetIndex] as HTMLElement;
    if (!targetEl) {
        return { success: false, error: 'Element at index ' + targetIndex + ' not found' };
    }

    targetEl.focus();
    const matchingCode = keyCodes[key] || 0;
    const eventOptions = {
        key: key,
        code: key === 'Enter' ? 'Enter' : (key === 'Tab' ? 'Tab' : (key === 'Escape' ? 'Escape' : '')),
        keyCode: matchingCode,
        which: matchingCode,
        bubbles: true,
        cancelable: true
    };

    targetEl.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    if (matchingCode !== 0 || key.length === 1) {
        targetEl.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    }
    targetEl.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    return { success: true };
}

// Handler: Get Tab Content (TabContent / Markdown)
function getTabContent(offset?: number) {
    const MAX_CONTENT_LENGTH = 50_000;

    function getLinks() {
        const linkElements = document.querySelectorAll('a[href]');
        return Array.from(linkElements).map(el => ({
            url: (el as HTMLAnchorElement).href,
            text: (el as HTMLElement).innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
        })).filter(link => link.text !== '' && link.url.startsWith('https://') && !link.url.includes('#'));
    }

    let isTruncated = false;
    let text = document.body.innerText.substring(offset || 0);
    if (text.length > MAX_CONTENT_LENGTH) {
        text = text.substring(0, MAX_CONTENT_LENGTH);
        isTruncated = true;
    }

    return {
        links: getLinks(),
        fullText: text,
        isTruncated,
        totalLength: document.body.innerText.length
    };
}

// Handler: Scroll Page
function scrollPage(distance?: number, unit?: "pixels" | "screens") {
    const viewportHeight = window.innerHeight;
    const pageHeight = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
    );

    let scrollAmount: number;

    if (distance === undefined) {
        // Scroll to bottom
        scrollAmount = pageHeight - window.scrollY;
    } else {
        // Calculate scroll amount based on unit
        if (unit === "pixels") {
            scrollAmount = distance;
        } else {
            // Default: screens (viewport heights)
            scrollAmount = distance * viewportHeight;
        }
    }

    window.scrollBy({ top: scrollAmount, behavior: "smooth" });

    // Return current position (will be the final position after smooth scroll completes)
    // Note: The scroll happens asynchronously with smooth behavior
    return new Promise<any>((resolve) => {
        setTimeout(() => {
            resolve({
                scrolledTo: { x: window.scrollX, y: window.scrollY },
                pageHeight,
                viewportHeight
            });
        }, 100);
    });
}


// Main Message Listener
browser.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    // Return true to indicate we will send a response asynchronously if needed.
    // However, if we await inside, we must be careful.
    // The standard pattern is `return true;` then call `sendResponse`.

    const handleMessage = async () => {
        try {
            switch (message.action) {
                case "getClickableElements":
                    return getClickableElements(message.selector);

                case "clickElement":
                    return clickElement(message);

                case "findElement":
                    return findElement(message);

                case "typeText":
                    return typeText(message);

                case "pressKey":
                    return pressKey(message);

                case "getTabContent":
                    // This is for get-tab-content (raw text)
                    return getTabContent(message.offset);

                case "getMarkdownContent":
                    // uses imported extractContent
                    const result = extractContent(document, window.location.href, message.options);
                    // Add some stats same as extractor-injected
                    return {
                        cleanedHtml: result.cleanedHtml,
                        metadata: result.metadata,
                        statistics: result.statistics
                    };

                case "scrollPage":
                    return scrollPage(message.distance, message.unit);

                default:
                    // Unknown action, maybe another content script handles it or it's not for us?
                    // We shouldn't return anything if we don't handle it, to let other listeners handle it?
                    // But here we are the main content script.
                    return null;
            }
        } catch (error: any) {
            return { error: error.message || String(error) };
        }
    };

    handleMessage().then(response => {
        if (response !== null) {
            sendResponse(response);
        }
    });

    return true; // Keep channel open for async response
});

console.log('Browser Control MCP: Content script loaded');
