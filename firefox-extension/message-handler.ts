import type { ServerMessageRequest } from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { isCommandAllowed, isDomainInDenyList, COMMAND_TO_TOOL_ID, addAuditLogEntry, getDebugPassword, validateAndConsumeDebugPassword } from "./extension-config";
import { convertToMarkdown } from "./utils/markdown-converter";
import {
  TabReloadedExtensionMessage,
  InterceptedMediaResourcesExtensionMessage,
} from "../common/extension-messages";


export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    const isAllowed = await isCommandAllowed(req.cmd);
    if (!isAllowed) {
      throw new Error(`Command '${req.cmd}' is disabled in extension settings`);
    }

    this.addAuditLogForReq(req).catch((error) => {
      console.error("Failed to add audit log entry:", error);
    });

    switch (req.cmd) {
      case "open-tab":
        await this.openUrl(req.correlationId, req.url);
        break;
      case "close-tabs":
        await this.closeTabs(req.correlationId, req.tabIds);
        break;
      case "get-tab-list":
        await this.sendTabs(req.correlationId);
        break;
      case "get-browser-recent-history":
        await this.sendRecentHistory(req.correlationId, req.searchQuery);
        break;
      case "get-tab-content":
        await this.sendTabsContent(req.correlationId, req.tabId, req.offset);
        break;
      case "reorder-tabs":
        await this.reorderTabs(req.correlationId, req.tabOrder);
        break;
      case "find-highlight":
        await this.findAndHighlightText(
          req.correlationId,
          req.tabId,
          req.queryPhrase
        );
        break;
      case "group-tabs":
        await this.groupTabs(
          req.correlationId,
          req.tabIds,
          req.isCollapsed,
          req.groupColor as browser.tabGroups.Color | undefined,
          req.groupTitle,
          req.groupId
        );
        break;
      case "get-tab-groups":
        await this.sendTabGroups(req.correlationId);
        break;
      case "query-tabs":
        await this.queryTabs(
          req.correlationId,
          req.title,
          req.url,
          req.groupId,
          req.active,
          req.currentWindow,
          req.pinned,
          req.audible,
          req.muted,
          req.status
        );
        break;
      case "get-clickable-elements":
        await this.getClickableElements(req.correlationId, req.tabId, req.selector);
        break;
      case "click-element":
        await this.clickElement(req.correlationId, req.tabId, req.textContent, req.selector, req.xpath, req.index);
        break;
      case "execute-script":
        await this.executeScript(req.correlationId, req.tabId, req.script, req.password);
        break;
      case "get-debug-password":
        await this.sendDebugPassword(req.correlationId);
        break;
      case "get-tab-markdown-content":
        await this.sendMarkdownContent(req.correlationId, req.tabId, req.options);
        break;
      case "reload-tab":
        await this.reloadTab(req.correlationId, req.tabId, req.bypassCache);
        break;
      case "install-media-interceptor":
        await this.installMediaInterceptor(req.correlationId, req.tabId, req.options);
        break;
      case "get-tab-media-resources":
        await this.getTabMediaResources(req.correlationId, req.tabId, req.filter);
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("Invalid message received:", req);
    }
  }

  private async addAuditLogForReq(req: ServerMessageRequest) {
    // Get the URL in context (either from param or from the tab)
    let contextUrl: string | undefined;
    if ("url" in req && req.url) {
      contextUrl = req.url;
    }
    if ("tabId" in req) {
      try {
        const tab = await browser.tabs.get(req.tabId);
        contextUrl = tab.url;
      } catch (error) {
        console.error("Failed to get tab URL for audit log:", error);
      }
    }

    const toolId = COMMAND_TO_TOOL_ID[req.cmd];
    const auditEntry = {
      toolId,
      command: req.cmd,
      timestamp: Date.now(),
      url: contextUrl
    };

    await addAuditLogEntry(auditEntry);
  }

  private async openUrl(correlationId: string, url: string): Promise<void> {
    if (!url.startsWith("https://")) {
      console.error("Invalid URL:", url);
      throw new Error("Invalid URL");
    }

    if (await isDomainInDenyList(url)) {
      throw new Error("Domain in user defined deny list");
    }

    const tab = await browser.tabs.create({
      url,
    });

    await this.client.sendResourceToServer({
      resource: "opened-tab-id",
      correlationId,
      tabId: tab.id,
    });
  }

  private async closeTabs(
    correlationId: string,
    tabIds: number[]
  ): Promise<void> {
    await browser.tabs.remove(tabIds);
    await this.client.sendResourceToServer({
      resource: "tabs-closed",
      correlationId,
    });
  }

  private async sendTabs(correlationId: string): Promise<void> {
    const tabs = await browser.tabs.query({});
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs,
    });
  }

  private async sendRecentHistory(
    correlationId: string,
    searchQuery: string | null = null
  ): Promise<void> {
    const historyItems = await browser.history.search({
      text: searchQuery ?? "", // Search for all URLs (empty string matches everything)
      maxResults: 200, // Limit to 200 results
      startTime: 0, // Search from the beginning of time
    });
    const filteredHistoryItems = historyItems.filter((item) => {
      return !!item.url;
    });
    await this.client.sendResourceToServer({
      resource: "history",
      correlationId,
      historyItems: filteredHistoryItems,
    });
  }

  // Check that the user has granted permission to access the URL's domain.
  // This will open the options page with a URL parameter to request permission
  // and throw an error to indicate that the request cannot proceed until permission is granted.
  private async checkForUrlPermission(url: string | undefined): Promise<void> {
    if (url) {
      const origin = new URL(url).origin;
      const granted = await browser.permissions.contains({
        origins: [`${origin}/*`],
      });

      if (!granted) {
        // Open the options page with a URL parameter to request permission:
        const optionsUrl = browser.runtime.getURL("options.html");
        const urlWithParams = `${optionsUrl}?requestUrl=${encodeURIComponent(
          url
        )}`;

        await browser.tabs.create({ url: urlWithParams });
        throw new Error(
          `The user has not yet granted permission to access the domain "${origin}". A dialog is now being opened to request permission. If the user grants permission, you can try the request again.`
        );
      }
    }
  }

  private async checkForGlobalPermission(permissions: string[]): Promise<void> {
    const granted = await browser.permissions.contains({
      permissions,
    });

    if (!granted) {
      // Open the options page with a URL parameter to request permission:
      const optionsUrl = browser.runtime.getURL("options.html");
      const urlWithParams = `${optionsUrl}?requestPermissions=${encodeURIComponent(
        JSON.stringify(permissions)
      )}`;

      await browser.tabs.create({ url: urlWithParams });
      throw new Error(
        `The user has not yet granted permission for the following operations: ${permissions.join(
          ", "
        )}. A dialog is now being opened to request permission. If the user grants permission, you can try the request again.`
      );
    }
  }

  private async sendTabsContent(
    correlationId: string,
    tabId: number,
    offset?: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    const MAX_CONTENT_LENGTH = 50_000;
    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function () {
        function getLinks() {
          const linkElements = document.querySelectorAll('a[href]');
          return Array.from(linkElements).map(el => ({
            url: el.href,
            text: el.innerText.trim() || el.getAttribute('aria-label') || el.getAttribute('title') || ''
          })).filter(link => link.text !== '' && link.url.startsWith('https://') && !link.url.includes('#'));
        }

        function getTextContent() {
          let isTruncated = false;
          let text = document.body.innerText.substring(${Number(offset) || 0});
          if (text.length > ${MAX_CONTENT_LENGTH}) {
            text = text.substring(0, ${MAX_CONTENT_LENGTH});
            isTruncated = true;
          }
          return {
            text, isTruncated
          }
        }

        const textContent = getTextContent();

        return {
          links: getLinks(),
          fullText: textContent.text,
          isTruncated: textContent.isTruncated,
          totalLength: document.body.innerText.length
        };
      })();
    `,
    });
    const { isTruncated, fullText, links, totalLength } = results[0];
    await this.client.sendResourceToServer({
      resource: "tab-content",
      tabId,
      correlationId,
      isTruncated,
      fullText,
      links,
      totalLength,
    });
  }

  private async reorderTabs(
    correlationId: string,
    tabOrder: number[]
  ): Promise<void> {
    // Reorder the tabs sequentially
    for (let newIndex = 0; newIndex < tabOrder.length; newIndex++) {
      const tabId = tabOrder[newIndex];
      await browser.tabs.move(tabId, { index: newIndex });
    }
    await this.client.sendResourceToServer({
      resource: "tabs-reordered",
      correlationId,
      tabOrder,
    });
  }

  private async findAndHighlightText(
    correlationId: string,
    tabId: number,
    queryPhrase: string
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);

    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForGlobalPermission(["find"]);

    const findResults = await browser.find.find(queryPhrase, {
      tabId,
      caseSensitive: true,
    });

    // If there are results, highlight them
    if (findResults.count > 0) {
      // But first, activate the tab. In firefox, this would also enable
      // auto-scrolling to the highlighted result.
      await browser.tabs.update(tabId, { active: true });
      browser.find.highlightResults({
        tabId,
      });
    }

    await this.client.sendResourceToServer({
      resource: "find-highlight-result",
      correlationId,
      noOfResults: findResults.count,
    });
  }

  private async groupTabs(
    correlationId: string,
    tabIds: number[],
    isCollapsed?: boolean,
    groupColor?: browser.tabGroups.Color,
    groupTitle?: string,
    existingGroupId?: number
  ): Promise<void> {
    let groupId: number;

    if (existingGroupId !== undefined) {
      // Add tabs to an existing group
      groupId = await browser.tabs.group({
        tabIds,
        groupId: existingGroupId,
      });
    } else {
      // Create a new group
      groupId = await browser.tabs.group({
        tabIds,
      });
    }

    // Only update group properties if we created a new group or properties are specified
    if (existingGroupId === undefined || isCollapsed !== undefined || groupColor !== undefined || groupTitle !== undefined) {
      const updateOptions: browser.tabGroups.UpdateUpdateInfo = {};
      if (isCollapsed !== undefined) updateOptions.collapsed = isCollapsed;
      if (groupColor !== undefined) updateOptions.color = groupColor;
      if (groupTitle !== undefined) updateOptions.title = groupTitle;

      if (Object.keys(updateOptions).length > 0) {
        await browser.tabGroups.update(groupId, updateOptions);
      }
    }

    await this.client.sendResourceToServer({
      resource: "new-tab-group",
      correlationId,
      groupId,
    });
  }

  private async sendTabGroups(correlationId: string): Promise<void> {
    const groups = await browser.tabGroups.query({});
    await this.client.sendResourceToServer({
      resource: "tab-groups",
      correlationId,
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        color: g.color,
        collapsed: g.collapsed,
      })),
    });
  }

  private async queryTabs(
    correlationId: string,
    title?: string,
    url?: string,
    groupId?: number,
    active?: boolean,
    currentWindow?: boolean,
    pinned?: boolean,
    audible?: boolean,
    muted?: boolean,
    status?: "loading" | "complete"
  ): Promise<void> {
    // Build query object for browser.tabs.query
    const queryInfo: any = {};
    if (active !== undefined) queryInfo.active = active;
    if (currentWindow !== undefined) queryInfo.currentWindow = currentWindow;
    if (pinned !== undefined) queryInfo.pinned = pinned;
    if (audible !== undefined) queryInfo.audible = audible;
    if (muted !== undefined) queryInfo.muted = muted;
    if (status !== undefined) queryInfo.status = status;

    const allTabs = await browser.tabs.query(queryInfo);

    // Additional filtering for title, url, groupId (substring match)
    const filtered = allTabs.filter((t: any) => {
      const matchTitle =
        !title ||
        (t.title && t.title.toLowerCase().includes(title.toLowerCase()));
      const matchUrl =
        !url || (t.url && t.url.toLowerCase().includes(url.toLowerCase()));
      const matchGroup =
        groupId === undefined || (t.groupId !== undefined && t.groupId === groupId);
      return matchTitle && matchUrl && matchGroup;
    });
    await this.client.sendResourceToServer({
      resource: "tabs",
      correlationId,
      tabs: filtered,
    });
  }

  private async getClickableElements(
    correlationId: string,
    tabId: number,
    selector?: string
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function() {
        const selectorFilter = ${JSON.stringify(selector || null)};
        
        function getUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          
          let path = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
              selector = '#' + CSS.escape(el.id);
              path.unshift(selector);
              break;
            } else {
              let sib = el, nth = 1;
              while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() === selector) nth++;
              }
              if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
            }
            path.unshift(selector);
            el = el.parentNode;
          }
          return path.join(' > ');
        }
        
        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          
          let path = [];
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
            el = el.parentNode;
          }
          return '/' + path.join('/');
        }
        
        const clickableSelectors = 'a[href], button, input[type="button"], input[type="submit"], [role="button"], [onclick]';
        const baseSelector = selectorFilter ? selectorFilter + ', ' + selectorFilter + ' ' + clickableSelectors : clickableSelectors;
        const elements = document.querySelectorAll(selectorFilter || clickableSelectors);
        
        return Array.from(elements).map((el, index) => ({
          index,
          tagName: el.tagName.toLowerCase(),
          textContent: (el.textContent || '').trim().substring(0, 100),
          href: el.href || undefined,
          type: el.type || undefined,
          selector: getUniqueSelector(el),
          xpath: getXPath(el)
        })).filter(el => el.textContent || el.href);
      })();
      `,
    });

    await this.client.sendResourceToServer({
      resource: "clickable-elements",
      correlationId,
      tabId,
      elements: results[0] || [],
    });
  }

  private async clickElement(
    correlationId: string,
    tabId: number,
    textContent?: string,
    selector?: string,
    xpath?: string,
    index?: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    const results = await browser.tabs.executeScript(tabId, {
      code: `
      (function() {
        const textContent = ${JSON.stringify(textContent || null)};
        const selector = ${JSON.stringify(selector || null)};
        const xpath = ${JSON.stringify(xpath || null)};
        const targetIndex = ${JSON.stringify(index ?? null)};
        
        function getUniqueSelector(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          let path = [];
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let selector = el.nodeName.toLowerCase();
            if (el.id) {
              selector = '#' + CSS.escape(el.id);
              path.unshift(selector);
              break;
            } else {
              let sib = el, nth = 1;
              while (sib = sib.previousElementSibling) {
                if (sib.nodeName.toLowerCase() === selector) nth++;
              }
              if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
            }
            path.unshift(selector);
            el = el.parentNode;
          }
          return path.join(' > ');
        }
        
        function getXPath(el) {
          if (el.id) return '//*[@id="' + el.id + '"]';
          let path = [];
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
            el = el.parentNode;
          }
          return '/' + path.join('/');
        }
        
        let elements = [];
        
        if (xpath) {
          const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
          for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
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
        
        const targetEl = targetIndex !== null ? elements[targetIndex] : elements[0];
        if (!targetEl) {
          return { success: false, error: 'Element at index ' + targetIndex + ' not found. Found ' + elements.length + ' elements.' };
        }
        
        targetEl.click();
        
        return {
          success: true,
          clickedElement: {
            index: targetIndex !== null ? targetIndex : 0,
            tagName: targetEl.tagName.toLowerCase(),
            textContent: (targetEl.textContent || '').trim().substring(0, 100),
            href: targetEl.href || undefined,
            type: targetEl.type || undefined,
            selector: getUniqueSelector(targetEl),
            xpath: getXPath(targetEl)
          }
        };
      })();
      `,
    });

    const result = results[0];
    await this.client.sendResourceToServer({
      resource: "click-result",
      correlationId,
      success: result.success,
      clickedElement: result.clickedElement,
      error: result.error,
    });
  }

  private async executeScript(
    correlationId: string,
    tabId: number,
    script: string,
    password: string
  ): Promise<void> {
    // Validate password first
    if (!validateAndConsumeDebugPassword(password)) {
      await this.client.sendResourceToServer({
        resource: "script-result",
        correlationId,
        result: null,
        error: "Invalid or expired debug password",
      });
      return;
    }

    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    try {
      const results = await browser.tabs.executeScript(tabId, {
        code: `
        (function() {
          try {
            const result = eval(${JSON.stringify(script)});
            return { result: result, error: null };
          } catch (e) {
            return { result: null, error: e.message };
          }
        })();
        `,
      });

      const result = results[0];
      await this.client.sendResourceToServer({
        resource: "script-result",
        correlationId,
        result: result.result,
        error: result.error,
      });
    } catch (error: any) {
      await this.client.sendResourceToServer({
        resource: "script-result",
        correlationId,
        result: null,
        error: error.message,
      });
    }
  }

  private async sendDebugPassword(correlationId: string): Promise<void> {
    const password = getDebugPassword();
    await this.client.sendResourceToServer({
      resource: "debug-password",
      correlationId,
      password,
    });
  }

  private async sendMarkdownContent(
    correlationId: string,
    tabId: number,
    options?: { maxLength?: number }
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    // Clear any previous result and execute the extractor script
    await browser.tabs.executeScript(tabId, { code: "window.__extractionResult = undefined;" });
    await browser.tabs.executeScript(tabId, { file: "dist/extractor.js" });

    // Retrieve the result from the global variable
    const results = await browser.tabs.executeScript(tabId, {
      code: "window.__extractionResult",
    });

    if (!results || results.length === 0) {
      throw new Error(`Content extraction failed: executeScript returned no results.`);
    }

    const result = results[0];
    if (!result) {
      throw new Error(`Content extraction failed: The extraction script did not set a result.`);
    }

    if (result.error) {
      throw new Error(`Content extraction failed: ${result.error}`);
    }

    const { cleanedHtml, metadata, statistics } = result;

    // Convert to Markdown
    let markdown = convertToMarkdown(cleanedHtml, tab.url || "");

    // Apply length limit
    let isTruncated = false;
    const maxLength = options?.maxLength || 100000;
    if (markdown.length > maxLength) {
      markdown = markdown.substring(0, maxLength);
      isTruncated = true;
    }

    await this.client.sendResourceToServer({
      resource: "markdown-content",
      correlationId,
      tabId,
      content: {
        markdown,
        metadata,
        statistics,
      },
      isTruncated,
    });
  }

  private async reloadTab(
    correlationId: string,
    tabId: number,
    bypassCache?: boolean
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await browser.tabs.reload(tabId, { bypassCache: bypassCache || false });
    await this.client.sendResourceToServer({
      resource: "tab-reloaded",
      correlationId,
      tabId,
    });
  }

  private async installMediaInterceptor(
    correlationId: string,
    tabId: number,
    options?: {
      autoReload?: boolean;
      waitAfterReload?: number;
      strategies?: ("fetch" | "xhr" | "dom" | "mse")[];
      urlPattern?: string;
      preset?: "twitter" | "default";
    }
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    // Prepare config object
    const config = {
      strategies: options?.strategies,
      urlPattern: options?.urlPattern
    };
    const configScriptInfo = {
      code: `window.__MCP_MEDIA_INTERCEPTOR_CONFIG__ = ${JSON.stringify(config)};`
    };

    let registeredScript: any = null;

    if (options?.autoReload) {
      // Early Injection via contentScripts.register
      try {
        if (tab.url) {
          const matchTarget = tab.url.split('#')[0];
          registeredScript = await (browser as any).contentScripts.register({
            matches: [matchTarget],
            js: [
              configScriptInfo, // Inject config first
              { file: "dist/media-interceptor.js" }
            ],
            runAt: "document_start",
            allFrames: true
          });
          console.log("Registered content script for early injection at:", matchTarget);
        }
      } catch (e) {
        console.warn("Failed to register content script, falling back", e);
      }

      await browser.tabs.reload(tabId, { bypassCache: true });

      // Wait for reload logic
      const MAX_LOAD_WAIT = 15000;
      const startTime = Date.now();
      while (Date.now() - startTime < MAX_LOAD_WAIT) {
        try {
          const t = await browser.tabs.get(tabId);
          if (t.status === 'complete') break;
        } catch (e) { }
        await new Promise(r => setTimeout(r, 500));
      }

      const waitTime = options?.waitAfterReload || 2000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      if (registeredScript) {
        try { await registeredScript.unregister(); } catch (e) { }
      }
    } else {
      // Lazy Injection via executeScript
      // 1. Inject Config
      await browser.tabs.executeScript(tabId, {
        code: configScriptInfo.code,
        matchAboutBlank: true,
        allFrames: true
      });
      // 2. Inject Interceptor
      await browser.tabs.executeScript(tabId, {
        file: "dist/media-interceptor.js",
        allFrames: true
      });
    }

    // Return success
    await this.client.sendResourceToServer({
      resource: "intercepted-media-resources",
      correlationId,
      tabId,
      resources: [],
      wasReloaded: !!options?.autoReload,
      interceptorInfo: {
        hooksInstalled: true,
        earlyInjection: !!options?.autoReload
      }
    });
  }

  private async getTabMediaResources(
    correlationId: string,
    tabId: number,
    filter?: {
      types?: ("video" | "audio" | "image" | "stream")[];
      urlPattern?: string;
      shouldClear?: boolean;
    }
  ): Promise<void> {
    let results: any;
    try {
      // Attempt to retrieve via message first
      try {
        results = await browser.tabs.sendMessage(tabId, {
          type: 'COLLECT_MEDIA_RESOURCES',
          shouldClear: filter?.shouldClear
        });
      } catch (e) {
        console.warn("Message retrieval failed, falling back to executeScript", e);
      }

      if (!results) {
        // Fallback: Lazy Injection via executeScript
        // Inject stats options first if needed
        if (filter?.shouldClear) {
          await browser.tabs.executeScript(tabId, {
            code: `window.__MCP_COLLECT_OPTIONS__ = { shouldClear: true };`,
            allFrames: true
          });
        }

        const executionResults = await browser.tabs.executeScript(tabId, {
          file: "dist/media-interceptor.js",
          allFrames: true
        });
        results = executionResults.find(r => r !== null && r !== undefined);

        // Ideally clean up the global options
        if (filter?.shouldClear) {
          await browser.tabs.executeScript(tabId, {
            code: `delete window.__MCP_COLLECT_OPTIONS__;`,
            allFrames: true
          }).catch(() => { });
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to collect media resources: ${error.message}`);
    }

    if (!results) {
      throw new Error("Media interceptor returned no results");
    }

    let { resources, interceptorInfo } = results;

    // Apply Filter
    if (filter) {
      if (filter.types && filter.types.length > 0) {
        resources = resources.filter((r: any) => filter.types!.includes(r.type));
      }
      if (filter.urlPattern) {
        resources = resources.filter((r: any) => r.url.includes(filter.urlPattern!));
      }
    }

    await this.client.sendResourceToServer({
      resource: "intercepted-media-resources",
      correlationId,
      tabId,
      resources: resources || [],
      wasReloaded: false,
      interceptorInfo: {
        hooksInstalled: interceptorInfo?.hooksInstalled || false,
        cspInfo: interceptorInfo?.cspInfo,
        logs: interceptorInfo?.logs,
        earlyInjection: interceptorInfo?.earlyInjection || false
      }
    });
  }
}
