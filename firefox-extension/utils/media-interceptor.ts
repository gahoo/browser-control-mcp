// This script is injected by background.ts to intercept media resources
// It runs in the content script context but injects code into the page context

interface MediaResource {
    url: string;
    type: "video" | "audio" | "stream" | "image" | "unknown";
    source: "dom" | "fetch" | "xhr" | "mse" | "element-src";
    mimeType?: string;
    extension?: string;
    metadata?: {
        elementTag?: string;
        elementSelector?: string;
        requestHeaders?: Record<string, string>;
        isBlobUrl?: boolean;
        originalBlobUrl?: string; // If we resolved a blob URL
    };
}

// This function will be serialized and injected into the page context
function interceptorFunction() {
    const capturedResources: MediaResource[] = [];
    const MAX_RESOURCES = 200;

    // Read configuration from the page context (injected by content script)
    const config = (window as any).__MCP_MEDIA_INTERCEPTOR_CONFIG__ || {};
    const strategies = config.strategies || ["fetch", "xhr", "dom", "mse"];
    const urlPattern = config.urlPattern || "";

    // Helper to add resource safely
    function addResource(res: MediaResource) {
        // Filter by URL pattern if specified
        if (urlPattern && !res.url.includes(urlPattern)) return;

        // Avoid duplicates based on URL
        if (capturedResources.some((r) => r.url === res.url)) return;
        if (capturedResources.length >= MAX_RESOURCES) return;
        capturedResources.push(res);
    }

    // Helper to determine type from URL or MIME
    function determineType(
        url: string,
        mimeType?: string
    ): { type: "video" | "audio" | "stream" | "image" | "unknown"; extension?: string } {
        // ... (existing determineType logic remains same, omitted for brevity as it's helper)
        const lowerUrl = url.toLowerCase();

        // Optimization: Early check against pattern before even parsing type?
        // Actually, user requested "Early check", which we do in addResource.
        // But doing it here might save regex/string ops. 
        // Let's rely on addResource for centralized filtering.

        // Check extensions
        if (lowerUrl.includes(".m3u8") || lowerUrl.includes(".mpd")) {
            return { type: "stream", extension: lowerUrl.includes(".m3u8") ? "m3u8" : "mpd" };
        }

        const videoExts = [".mp4", ".webm", ".ogv", ".mov", ".avi", ".wmv", ".flv", ".mkv"];
        for (const ext of videoExts) {
            if (lowerUrl.includes(ext)) return { type: "video", extension: ext.substring(1) };
        }

        const audioExts = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".weba"];
        for (const ext of audioExts) {
            if (lowerUrl.includes(ext)) return { type: "audio", extension: ext.substring(1) };
        }

        const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"];
        for (const ext of imageExts) {
            if (lowerUrl.includes(ext)) return { type: "image", extension: ext.substring(1) };
        }

        // Check MIME type
        if (mimeType) {
            if (mimeType.includes("application/vnd.apple.mpegurl") || mimeType.includes("application/dash+xml")) {
                return { type: "stream" };
            }
            if (mimeType.startsWith("video/")) return { type: "video" };
            if (mimeType.startsWith("audio/")) return { type: "audio" };
            if (mimeType.startsWith("image/")) return { type: "image" };
        }

        return { type: "unknown" };
    }

    // Hook window.fetch
    if (strategies.includes("fetch")) {
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
            const [input] = args;
            let url = "";
            if (typeof input === "string") {
                url = input;
            } else if (input instanceof Request) {
                url = input.url;
            } else if (input instanceof URL) {
                url = input.toString();
            }

            // Early filtering at hook level (User Request)
            if (urlPattern && !url.includes(urlPattern)) {
                return originalFetch.apply(this, args);
            }

            // Pre-check URL to filter obviously non-media requests
            const typeCheck = determineType(url);
            if (typeCheck.type !== "unknown") {
                addResource({
                    url,
                    type: typeCheck.type,
                    source: "fetch",
                    extension: typeCheck.extension
                });
            }

            try {
                const response = await originalFetch.apply(this, args);
                const clone = response.clone();
                const contentType = clone.headers.get("content-type");

                if (contentType) {
                    const typeCheckFromMime = determineType(url, contentType);
                    if (typeCheckFromMime.type !== "unknown" && typeCheckFromMime.type !== "image") {
                        addResource({
                            url,
                            type: typeCheckFromMime.type,
                            source: "fetch",
                            mimeType: contentType,
                            extension: typeCheckFromMime.extension
                        });
                    }
                }
                return response;
            } catch (e) {
                return originalFetch.apply(this, args);
            }
        };
    }

    // Hook XMLHttpRequest
    if (strategies.includes("xhr")) {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (...args: any[]) {
            const [method, url] = args;
            // @ts-ignore
            this._requestUrl = url;
            // @ts-ignore
            return originalOpen.apply(this, args);
        };

        const originalSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function (...args: any[]) {
            const xhr = this;
            const url = (xhr as any)._requestUrl;

            // Early filtering
            if (url && typeof url === 'string' && urlPattern && !url.includes(urlPattern)) {
                // @ts-ignore
                return originalSend.apply(this, args);
            }

            if (url && typeof url === 'string') {
                const typeCheck = determineType(url);
                if (typeCheck.type !== "unknown") {
                    addResource({
                        url,
                        type: typeCheck.type,
                        source: "xhr",
                        extension: typeCheck.extension
                    });
                }
            }

            xhr.addEventListener("load", function () {
                const contentType = xhr.getResponseHeader("content-type");
                if (url && typeof url === 'string' && contentType) {
                    const typeCheckFromMime = determineType(url, contentType);
                    if (typeCheckFromMime.type !== "unknown" && typeCheckFromMime.type !== "image") {
                        addResource({
                            url,
                            type: typeCheckFromMime.type,
                            source: "xhr",
                            mimeType: contentType,
                            extension: typeCheckFromMime.extension
                        });
                    }
                }
            });

            // @ts-ignore
            return originalSend.apply(this, args);
        };
    }

    // Hook HTMLMediaElement src logic
    if (strategies.includes("dom")) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
        if (descriptor && descriptor.set) {
            const originalSet = descriptor.set;
            descriptor.set = function (value) {
                if (value) {
                    // Early filtering
                    if (urlPattern && !value.includes(urlPattern)) {
                        return originalSet.call(this, value);
                    }

                    const el = this as HTMLMediaElement;
                    const typeCheck = determineType(value);

                    let type = typeCheck.type;
                    if (type === 'unknown') {
                        if (el.tagName.toLowerCase() === 'video') type = 'video';
                        if (el.tagName.toLowerCase() === 'audio') type = 'audio';
                    }

                    if (type !== 'unknown' && type !== 'image') {
                        addResource({
                            url: value,
                            type: type,
                            source: "element-src",
                            metadata: {
                                elementTag: el.tagName.toLowerCase(),
                                isBlobUrl: value.startsWith('blob:')
                            }
                        });
                    }
                }
                return originalSet.call(this, value);
            }
            Object.defineProperty(HTMLMediaElement.prototype, 'src', descriptor);
        }
    }

    // Hook MSE (SourceBuffer)
    if (strategies.includes("mse")) {
        const originalCreateObjectURL = URL.createObjectURL;
        URL.createObjectURL = function (obj) {
            const url = originalCreateObjectURL(obj);
            if (obj instanceof MediaSource) {
                addResource({
                    url: url,
                    type: "stream",
                    source: "mse",
                    metadata: {
                        isBlobUrl: true,
                        originalBlobUrl: "MediaSource"
                    }
                });
            } else if (obj instanceof Blob) {
                if (obj.type.startsWith('video/') || obj.type.startsWith('audio/') ||
                    obj.type.includes('mpegurl') || obj.type.includes('dash')) {
                    addResource({
                        url: url,
                        type: obj.type.startsWith('video/') ? 'video' : (obj.type.startsWith('audio/') ? 'audio' : 'stream'),
                        source: "dom",
                        mimeType: obj.type,
                        metadata: {
                            isBlobUrl: true
                        }
                    });
                }
            }
            return url;
        };
    }


    // Expose the collector function to the content script
    window.addEventListener('__MCP_COLLECT_MEDIA__', (event: any) => {
        let options: any = {};
        try {
            options = typeof event.detail === 'string' ? JSON.parse(event.detail) : (event.detail || {});
        } catch (e) {
            options = {};
        }

        // Also scan DOM one last time
        document.querySelectorAll('video, audio').forEach(el => {
            const mediaEl = el as HTMLMediaElement;
            if (mediaEl.currentSrc) {
                const typeCheck = determineType(mediaEl.currentSrc);
                let type = typeCheck.type;
                if (type === 'unknown') {
                    if (mediaEl.tagName.toLowerCase() === 'video') type = 'video';
                    if (mediaEl.tagName.toLowerCase() === 'audio') type = 'audio';
                }

                if (type !== 'image') {
                    addResource({
                        url: mediaEl.currentSrc,
                        type: type,
                        source: "dom",
                        metadata: {
                            elementTag: mediaEl.tagName.toLowerCase(),
                            isBlobUrl: mediaEl.currentSrc.startsWith('blob:')
                        }
                    });
                }
            }
            // Check children sources
            mediaEl.querySelectorAll('source').forEach(source => {
                const src = (source as HTMLSourceElement).src;
                if (src) {
                    const typeCheck = determineType(src, (source as HTMLSourceElement).type);
                    if (typeCheck.type !== 'unknown' && typeCheck.type !== 'image') {
                        addResource({
                            url: src,
                            type: typeCheck.type,
                            source: "dom",
                            extension: typeCheck.extension,
                            mimeType: (source as HTMLSourceElement).type,
                            metadata: {
                                elementTag: 'source'
                            }
                        })
                    }
                }
            });
        });

        // Send result back
        // Serialize metadata to string to avoid Permission Denied when Content Script reads it
        const resultDetail = JSON.stringify(capturedResources);
        const resultEvent = new CustomEvent('__MCP_MEDIA_RESULT__', { detail: resultDetail });
        window.dispatchEvent(resultEvent);

        // Clear if requested
        if (options && options.shouldClear) {
            capturedResources.length = 0;
            // Removed console log to reduce noise, or keep for debug:
            console.log("MCP Media Interceptor: Resources cleared.");
        }
    });

    console.log("MCP Media Interceptor installed.");
}

// --------------------------------------------------------------------------------
// Injection Logic (Runs in Content Script)
// --------------------------------------------------------------------------------

(function () {
    // Check if already installed in this frame
    if ((window as any).__MCP_MEDIA_INTERCEPTOR_INSTALLED__) {
        // If already installed, we just return the collection promise
        const globalOptions = (window as any).__MCP_COLLECT_OPTIONS__;
        return (window as any).__MCP_COLLECT_MEDIA_RESOURCES__(globalOptions);
    }
    (window as any).__MCP_MEDIA_INTERCEPTOR_INSTALLED__ = true;

    function inject() {
        // Serialize the interceptor function 
        const hookCode = `(${interceptorFunction.toString()})();`;

        const script = document.createElement('script');

        // CSP Nonce handling
        const existingScript = document.querySelector('script[nonce]');
        if (existingScript && (existingScript as any).nonce) {
            script.setAttribute('nonce', (existingScript as any).nonce);
        }

        // Try Blob URL injection primarily to bypass unsafe-inline if possible
        let blobUrl: string | null = null;
        try {
            const blob = new Blob([hookCode], { type: 'application/javascript' });
            blobUrl = URL.createObjectURL(blob);
            script.src = blobUrl;
        } catch (e) {
            // Fallback to textContent
            script.textContent = hookCode;
        }

        (document.head || document.documentElement).appendChild(script);

        if (blobUrl) {
            script.onload = () => {
                URL.revokeObjectURL(blobUrl!);
                script.remove();
            };
            script.onerror = () => {
                // If blob fails (e.g. strict CSP), try fallback
                script.remove();
                const fallbackScript = document.createElement('script');
                if (existingScript && (existingScript as any).nonce) {
                    fallbackScript.setAttribute('nonce', (existingScript as any).nonce);
                }
                fallbackScript.textContent = hookCode;
                (document.head || document.documentElement).appendChild(fallbackScript);
                fallbackScript.remove();
            };
        } else {
            script.remove();
        }
    }

    // Define collection function globally so subsequent calls can use it
    (window as any).__MCP_COLLECT_MEDIA_RESOURCES__ = function (options?: { shouldClear?: boolean }) {
        return new Promise((resolve) => {
            // 1. Wait a tiny bit to allow any pending async ops? 
            // Since we control when this is called, we assume the caller has waited appropriately.
            // But to be safe and ensure the page loop frame is processed:
            setTimeout(() => {
                // Trigger collection in page context
                // Serialize options to avoid "Permission denied" errors in Firefox (Xray vision)
                const detail = JSON.stringify(options || {});
                const event = new CustomEvent('__MCP_COLLECT_MEDIA__', { detail });
                window.dispatchEvent(event);
            }, 100);

            const resultHandler = (e: any) => {
                window.removeEventListener('__MCP_MEDIA_RESULT__', resultHandler);

                let resources = [];
                try {
                    resources = typeof e.detail === 'string' ? JSON.parse(e.detail) : (e.detail || []);
                } catch (err) {
                    console.error("Failed to parse media results:", err);
                    resources = [];
                }

                resolve({
                    resources: resources,
                    interceptorInfo: {
                        hooksInstalled: true,
                        earlyInjection: true // Flag to indicate successful early injection, or just presence
                    }
                });
            };

            window.addEventListener('__MCP_MEDIA_RESULT__', resultHandler);
        });
    };

    // Listen for messages from the background script
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'COLLECT_MEDIA_RESOURCES') {
            // Must return a Promise to keep the message channel open for async response
            return (window as any).__MCP_COLLECT_MEDIA_RESOURCES__({ shouldClear: message.shouldClear }).then((result: any) => {
                return result;
            });
        }
        return false;
    });

    // Install hooks immediately
    inject();

    // Return the collection promise (useful if called via executeScript immediately)
    // For contentScripts.register, this promise is ignored, which is fine.
    // Check for global options injected by message-handler fallback
    const globalOptions = (window as any).__MCP_COLLECT_OPTIONS__;
    return (window as any).__MCP_COLLECT_MEDIA_RESOURCES__(globalOptions);

})();
