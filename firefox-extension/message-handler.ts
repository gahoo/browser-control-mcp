
import type { ServerMessageRequest, RunPromptResultServerMessage, ServerStatusServerMessage } from "@browser-control-mcp/common";
import { WebsocketClient } from "./client";
import { isCommandAllowed, isDomainInDenyList, COMMAND_TO_TOOL_ID, addAuditLogEntry, getDebugPassword, validateAndConsumeDebugPassword } from "./extension-config";
import { convertToMarkdown } from "./utils/markdown-converter";
import {
  TabReloadedExtensionMessage,
  InterceptedMediaResourcesExtensionMessage,
  BlobDataExtensionMessage,
} from "../common/extension-messages";


export class MessageHandler {
  private client: WebsocketClient;

  constructor(client: WebsocketClient) {
    this.client = client;
  }

  public async handleDecodedMessage(req: ServerMessageRequest): Promise<void> {
    const startTime = Date.now();
    console.log(`[MessageHandler] Received command: ${req.cmd} `, { correlationId: req.correlationId });

    const isAllowed = await isCommandAllowed(req.cmd);
    if (!isAllowed) {
      console.warn(`[MessageHandler] Command '${req.cmd}' is disabled`, { correlationId: req.correlationId });
      throw new Error(`Command '${req.cmd}' is disabled in extension settings`);
    }

    this.addAuditLogForReq(req).catch((error) => {
      console.error("[MessageHandler] Failed to add audit log entry:", error);
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
        await this.getTabMediaResources(req.correlationId, req.tabId, req.flush, req.filter);
        break;
      case "fetch-blob-url":
        await this.fetchBlobUrl(req.correlationId, req.tabId, req.blobUrl);
        break;
      case "fetch-url":
        await this.fetchUrl(req.correlationId, req.url, req.tabId, req.options);
        break;
      case "take-snapshot":
        await this.takeSnapshot(req.correlationId, req.tabId, req.selector, req.method, req.scroll);
        break;
      case "is-tab-loaded":
        await this.isTabLoaded(req.correlationId, req.tabId);
        break;
      case "find-element":
        await this.findElement(req.correlationId, req.tabId, req.query, req.mode);
        break;
      case "type-text":
        await this.typeText(req.correlationId, req.tabId, req.text, req.selector, req.xpath, req.index);
        break;
      case "press-key":
        await this.pressKey(req.correlationId, req.tabId, req.key, req.selector, req.xpath, req.index);
        break;
      case "run-prompt-result":
        this.handleRunPromptResult(req as RunPromptResultServerMessage); // Cast needed as req is ServerMessageRequest
        break;
      case "server-status":
        this.handleServerStatus(req as any as ServerStatusServerMessage);
        break;
      default:
        const _exhaustiveCheck: never = req;
        console.error("[MessageHandler] Invalid message received:", req);
    }

    const duration = Date.now() - startTime;
    console.log(`[MessageHandler] Command completed: ${req.cmd} `, { correlationId: req.correlationId, durationMs: duration });
  }

  private pendingRequests = new Map<string, (response: any) => void>();

  public waitForResponse(correlationId: string): Promise<any> {
    return new Promise((resolve) => {
      this.pendingRequests.set(correlationId, resolve);
      // Timeout cleanup?
      setTimeout(() => {
        if (this.pendingRequests.has(correlationId)) {
          this.pendingRequests.delete(correlationId);
          resolve({ error: "Timeout waiting for server response" });
        }
      }, 5000); // Shorter timeout for general requests
    });
  }

  public waitForPromptResult(correlationId: string): Promise<any> {
    return this.waitForResponse(correlationId); // Re-use generic
  }

  private handleRunPromptResult(req: RunPromptResultServerMessage) {
    const resolver = this.pendingRequests.get(req.originalCorrelationId);
    if (resolver) {
      this.pendingRequests.delete(req.originalCorrelationId);
      resolver({ content: req.content, error: req.error });
    }
  }

  private handleServerStatus(req: ServerStatusServerMessage) {
    const resolver = this.pendingRequests.get(req.originalCorrelationId);
    if (resolver) {
      this.pendingRequests.delete(req.originalCorrelationId);
      resolver({ capabilities: req.capabilities });
    }
  }
  private async addAuditLogForReq(req: ServerMessageRequest) {
    // Get the URL in context (either from param or from the tab)
    let contextUrl: string | undefined;
    if ("url" in req && req.url) {
      contextUrl = req.url;
    }
    if ("tabId" in req && req.tabId !== undefined) {
      try {
        const tab = await browser.tabs.get(req.tabId);
        contextUrl = tab.url;
      } catch (error) {
        console.warn("[MessageHandler] Failed to get tab for audit log:", { tabId: req.tabId, error });
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
    // Allow https:// and specific protocol handlers like obsidian://
    const allowedProtocols = ["https://", "obsidian://"];
    const isAllowedProtocol = allowedProtocols.some(protocol => url.startsWith(protocol));

    if (!isAllowedProtocol) {
      console.error("[MessageHandler] Invalid URL - must start with https:// or a supported protocol:", url);
      throw new Error("Invalid URL");
    }

    // Only check deny list for https URLs (protocol handlers don't have domains)
    if (url.startsWith("https://") && await isDomainInDenyList(url)) {
      console.warn("[MessageHandler] URL domain in deny list:", url);
      throw new Error("Domain in user defined deny list");
    }

    console.log("[MessageHandler] Creating new tab:", { url });
    const tab = await browser.tabs.create({
      url,
    });
    console.log("[MessageHandler] Tab created:", { tabId: tab.id, url });

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
    console.log("[MessageHandler] Closing tabs:", { tabIds });
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
        console.warn("[MessageHandler] Permission not granted for origin:", { origin, url });
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
      console.warn("[MessageHandler] Global permission not granted:", { permissions });
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
    /*
    const results = await browser.tabs.executeScript(tabId, {
      code: `...`
    });
    */
    let response: any;
    try {
      response = await browser.tabs.sendMessage(tabId, {
        action: "getTabContent",
        offset: Number(offset) || 0
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }

    if (response.error) {
      throw new Error(response.error);
    }
    const { isTruncated, fullText, links, totalLength } = response;
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

    let results: any;
    try {
      results = await browser.tabs.sendMessage(tabId, {
        action: "getClickableElements",
        selector: selector
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }

    if (results && results.error) {
      throw new Error(results.error);
    }

    await this.client.sendResourceToServer({
      resource: "clickable-elements",
      correlationId,
      tabId,
      elements: results || [],
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

    let result: any;
    try {
      result = await browser.tabs.sendMessage(tabId, {
        action: "clickElement",
        textContent, selector, xpath, index
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }
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
    options?: { maxLength?: number; cssSelector?: string }
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    // Clear any previous result and set extraction options
    const extractionOptions = options?.cssSelector ? { cssSelector: options.cssSelector } : undefined;

    let result: any;
    try {
      result = await browser.tabs.sendMessage(tabId, {
        action: "getMarkdownContent",
        options: extractionOptions
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }

    if (!result) {
      throw new Error(`Content extraction failed: Content script returned no results.`);
    }


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

  private async isTabLoaded(
    correlationId: string,
    tabId: number
  ): Promise<void> {
    let isLoaded = false;
    try {
      const tab = await browser.tabs.get(tabId);
      isLoaded = tab.status === "complete";
    } catch (e) {
      // Tab might not exist
      isLoaded = false;
    }

    await this.client.sendResourceToServer({
      resource: "tab-loaded",
      correlationId,
      isLoaded,
    });
  }

  private async findElement(
    correlationId: string,
    tabId: number,
    query: string,
    mode: "css" | "xpath" | "text" | "regexp"
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    let results: any;
    try {
      results = await browser.tabs.sendMessage(tabId, {
        action: "findElement",
        query,
        mode
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }

    await this.client.sendResourceToServer({
      resource: "element-found",
      correlationId,
      elements: results || []
    });
  }

  private async typeText(
    correlationId: string,
    tabId: number,
    text: string,
    selector?: string,
    xpath?: string,
    index?: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    let result: any;
    try {
      result = await browser.tabs.sendMessage(tabId, {
        action: "typeText",
        text, selector, xpath, index
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }
    if (result.success) {
      await this.client.sendResourceToServer({
        resource: "text-typed",
        correlationId,
        success: true,
      });
    } else {
      await this.client.sendResourceToServer({
        resource: "text-typed",
        correlationId,
        success: false,
        error: result.error,
      });
    }
  }

  private async pressKey(
    correlationId: string,
    tabId: number,
    key: string,
    selector?: string,
    xpath?: string,
    index?: number
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    let result: any;
    try {
      result = await browser.tabs.sendMessage(tabId, {
        action: "pressKey",
        key, selector, xpath, index
      });
    } catch (error: any) {
      if (error.message.includes("Could not establish connection") || error.message.includes("receiving end does not exist")) {
        throw new Error("Tab connection lost or content script not loaded. Please refresh the tab.");
      }
      throw error;
    }
    if (result.success) {
      await this.client.sendResourceToServer({
        resource: "key-pressed",
        correlationId,
        success: true,
      });
    } else {
      await this.client.sendResourceToServer({
        resource: "key-pressed",
        correlationId,
        success: false,
        error: result.error,
      });
    }
  }

  private async captureTab(windowId: number): Promise<string> {
    const tabsApi = (browser as any).tabs;
    const windowsApi = (browser as any).windows;
    const chromeApi = (globalThis as any).chrome?.tabs;

    if (tabsApi?.captureVisibleTab) {
      try {
        return await tabsApi.captureVisibleTab(windowId, { format: "png" });
      } catch (e: any) {
        if (e.message?.includes("activeTab")) {
          console.warn("[MessageHandler] captureVisibleTab(windowId) failed, trying windowless fallback...");
          return await tabsApi.captureVisibleTab({ format: "png" });
        }
        throw e;
      }
    }
    if (windowsApi?.captureVisibleTab) {
      return await windowsApi.captureVisibleTab(windowId, { format: "png" });
    }
    if (chromeApi?.captureVisibleTab) {
      return new Promise((resolve, reject) => {
        chromeApi.captureVisibleTab(windowId, { format: "png" }, (dataUrl: string) => {
          if ((globalThis as any).chrome.runtime.lastError) {
            reject(new Error((globalThis as any).chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        });
      });
    }

    throw new Error(
      `captureVisibleTab is not available. (tabs: ${!!tabsApi}, tabs.cap: ${!!tabsApi?.captureVisibleTab}, windows.cap: ${!!windowsApi?.captureVisibleTab}). ` +
      "This usually means mandatory host permissions (*://*/*) were not correctly declared in manifest. " +
      "Please ensure you have reloaded the extension after the latest manifest update."
    );
  }

  private async takeSnapshot(
    correlationId: string,
    tabId: number,
    selector?: string,
    method: "native" | "readability" = "native",
    scroll?: boolean
  ): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.url && (await isDomainInDenyList(tab.url))) {
        throw new Error(`Domain in tab URL is in the deny list`);
      }
      await this.checkForUrlPermission(tab.url);

      // 1. Prepare Content: Get metrics and isolate element
      const prepareResult = await browser.tabs.executeScript(tabId, {
        code: `
          (function() {
            const selector = ${JSON.stringify(selector || null)};
            const method = ${JSON.stringify(method)};
            // If scroll is explicitly false, we don't scroll. 
            // If scroll is undefined, we scroll if we have a selector.
            const shouldScroll = ${scroll !== undefined ? scroll : selector !== null};
            
            // 1. Readability Cleaning (Heuristic)
            const originalDisplayStates = [];
            if (method === 'readability') {
              const distractionSelectors = [
                'nav', 'footer', 'header:not(article header)', 'aside', 
                '.ads', '.ad-container', '.sidebar', '#sidebar', '.nav', '.footer',
                'section[role="complementary"]', 'div[class*="ad-"]'
              ];
              const distractions = document.querySelectorAll(distractionSelectors.join(','));
              distractions.forEach(el => {
                originalDisplayStates.push({ el, elDisplay: el.style.display });
                el.style.display = 'none';
              });
            }
            
            let target = document.documentElement;
            if (selector) {
              const el = document.querySelector(selector);
              if (!el) {
                // Restore if we cleaned
                originalDisplayStates.forEach(item => item.el.style.display = item.elDisplay);
                return { error: "Element not found: " + selector };
              }
              target = el;
            }

            // Store original styles to restore later
            const originalOverflow = document.documentElement.style.overflow;
            
            // Hide fixed/sticky elements that might interfere during scrolling
            const fixedElements = Array.from(document.querySelectorAll('*')).filter(el => {
              const style = window.getComputedStyle(el);
              return style.position === 'fixed' || style.position === 'sticky';
            });
            const originalFixedDisplays = fixedElements.map(el => ({ el, elDisplay: el.style.display }));

            window.__snapshotRestore = () => {
              document.documentElement.style.overflow = originalOverflow;
              originalFixedDisplays.forEach(item => item.el.style.display = item.elDisplay);
              originalDisplayStates.forEach(item => item.el.style.display = item.elDisplay);
              delete window.__snapshotRestore;
            };

            if (!shouldScroll) {
              return {
                viewportOnly: true,
                devicePixelRatio: window.devicePixelRatio
              };
            }

            // For full element capture, hide scrollbars and fixed elements
            document.documentElement.style.overflow = 'hidden';
            fixedElements.forEach(el => el.style.display = 'none');

            // Recalculate dimensions after hiding distractions
            let rect = target.getBoundingClientRect();
            let width = rect.width;
            let height = rect.height;

            // If it's body or html, use scrollHeight/Width to get EVERYTHING
            if (target === document.body || target === document.documentElement) {
              width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
              height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
            }

            const scrollX = window.scrollX;
            const scrollY = window.scrollY;

            return {
              rect: {
                x: rect.left + scrollX,
                y: rect.top + scrollY,
                width: width,
                height: height
              },
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight
              },
              devicePixelRatio: window.devicePixelRatio
            };
          })();
        `
      });

      const info = prepareResult[0];
      if (info.error) throw new Error(info.error);

      // 2. Capture Logic
      let finalDataUrl: string;

      if (info.viewportOnly) {
        // Simple viewport capture
        if (tab.windowId === undefined) throw new Error("Tab windowId is undefined");
        finalDataUrl = await this.captureTab(tab.windowId);
      } else {
        // Multi-segment capture (Scroll & Stitch)
        const { rect, viewport, devicePixelRatio } = info;

        // Create canvas for stitching
        const canvas = document.createElement('canvas');
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Failed to create canvas context");

        const xSteps = Math.ceil(rect.width / viewport.width);
        const ySteps = Math.ceil(rect.height / viewport.height);

        for (let y = 0; y < ySteps; y++) {
          for (let x = 0; x < xSteps; x++) {
            const targetX = rect.x + (x * viewport.width);
            const targetY = rect.y + (y * viewport.height);

            // Scroll to segment and return actual scroll position
            const scrollResult = await browser.tabs.executeScript(tabId, {
              code: `window.scrollTo(${targetX}, ${targetY}); [window.scrollX, window.scrollY]`
            });
            const [actualX, actualY] = (scrollResult[0] as [number, number]);

            // Wait for paint/rendering
            await new Promise(r => setTimeout(r, 150));

            // Capture
            if (tab.windowId === undefined) throw new Error("Tab windowId is undefined");
            const dataUrl = await this.captureTab(tab.windowId);

            // Load into image and draw onto canvas
            const img = await this.loadImage(dataUrl);

            // Calculate offsets
            // targetX/Y is where we WANTED the top-left of the viewport to be.
            // actualX/Y is where it ACTUALLY is.
            // deltaX/Y is the shift within the captured image.
            // e.g. Wanted 1000, Got 900. Pixel 1000 is at +100 in the image.
            const deltaX = (targetX - actualX) * devicePixelRatio;
            const deltaY = (targetY - actualY) * devicePixelRatio;

            const destX = (x * viewport.width) * devicePixelRatio;
            const destY = (y * viewport.height) * devicePixelRatio;

            // Draw correctly offset
            // We shift the drawing position UP/LEFT by delta to align the target pixel with dest
            ctx.drawImage(img, destX - deltaX, destY - deltaY);
          }
        }

        finalDataUrl = canvas.toDataURL("image/png");

        // 3. Cleanup
        await browser.tabs.executeScript(tabId, {
          code: `if (window.__snapshotRestore) window.__snapshotRestore();`
        });
      }

      await this.client.sendResourceToServer({
        resource: "snapshot-result",
        correlationId,
        data: finalDataUrl
      });

    } catch (error: any) {
      console.error("[MessageHandler] takeSnapshot failed:", error);
      await this.client.sendResourceToServer({
        resource: "snapshot-result",
        correlationId,
        error: error.message || String(error)
      });
    }
  }

  private loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error("Failed to load captured image segment"));
      img.src = dataUrl;
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

    // Apply preset-specific defaults
    let effectiveOptions = { ...options };
    if (options?.preset === 'twitter') {
      // Twitter preset optimizations:
      // - autoReload: true - Required to capture TweetDetail API on initial page load
      // - strategies: ['xhr', 'dom'] - xhr for video API parsing, dom for images
      // - urlPattern: 'TweetDetail' - Only intercept Twitter video API calls
      effectiveOptions = {
        ...effectiveOptions,
        autoReload: options.autoReload ?? true,
        strategies: options.strategies ?? ['xhr', 'dom'],
        urlPattern: options.urlPattern ?? 'TweetDetail'
      };
    }

    // Prepare config object
    const config = {
      strategies: effectiveOptions?.strategies,
      urlPattern: effectiveOptions?.urlPattern,
      preset: effectiveOptions?.preset
    };
    const configScriptInfo = {
      code: `window.__MCP_MEDIA_INTERCEPTOR_CONFIG__ = ${JSON.stringify(config)};`
    };

    let registeredScript: any = null;

    if (effectiveOptions?.autoReload) {
      // Early Injection via contentScripts.register
      try {
        if (tab.url) {
          const matchTarget = tab.url.split('#')[0];
          console.log("[MessageHandler] Registering content script for early injection:", { matchTarget, tabId });
          registeredScript = await (browser as any).contentScripts.register({
            matches: [matchTarget],
            js: [
              configScriptInfo, // Inject config first
              { file: "dist/media-interceptor.js" }
            ],
            runAt: "document_start",
            allFrames: true
          });
          console.log("[MessageHandler] Content script registered successfully:", { matchTarget });
        }
      } catch (e) {
        console.warn("[MessageHandler] Failed to register content script, will use fallback:", { error: e, tabId });
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

      const waitTime = effectiveOptions?.waitAfterReload || 2000;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      if (registeredScript) {
        try {
          await registeredScript.unregister();
          console.log("[MessageHandler] Unregistered content script");
        } catch (e) {
          console.warn("[MessageHandler] Failed to unregister content script:", e);
        }
      }
    } else {
      // Lazy Injection via executeScript
      console.log("[MessageHandler] Installing media interceptor via executeScript:", { tabId, config });
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
      console.log("[MessageHandler] Media interceptor installed via executeScript");
    }

    // Return success
    await this.client.sendResourceToServer({
      resource: "intercepted-media-resources",
      correlationId,
      tabId,
      resources: [],
      wasReloaded: !!effectiveOptions?.autoReload,
      interceptorInfo: {
        hooksInstalled: true,
        earlyInjection: !!effectiveOptions?.autoReload
      }
    });
  }

  private async getTabMediaResources(
    correlationId: string,
    tabId: number,
    flush?: boolean,
    filter?: {
      types?: ("video" | "audio" | "image" | "stream")[];
      urlPattern?: string;
    }
  ): Promise<void> {
    let results: any;
    console.log("[MessageHandler] Getting media resources:", { tabId, flush, filter });

    // Check if tab exists first
    try {
      await browser.tabs.get(tabId);
    } catch (e) {
      console.error("[MessageHandler] Tab not found:", { tabId });
      throw new Error("TAB_NOT_FOUND: Invalid tab ID");
    }

    try {
      // Retrieve via message - interceptor must already be installed
      console.log("[MessageHandler] Sending COLLECT_MEDIA_RESOURCES message to tab:", { tabId });
      results = await browser.tabs.sendMessage(tabId, {
        type: 'COLLECT_MEDIA_RESOURCES',
        flush: flush
      });
    } catch (e: any) {
      // No fallback - interceptor must be installed first
      console.error("[MessageHandler] Failed to get media resources - interceptor not installed:", { tabId, error: e.message });
      throw new Error("INTERCEPTOR_NOT_INSTALLED: Call install-media-interceptor first");
    }

    if (!results) {
      console.error("[MessageHandler] Media interceptor did not respond:", { tabId });
      throw new Error("COLLECTION_TIMEOUT: Media interceptor did not respond");
    }

    let { resources, interceptorInfo } = results;
    console.log("[MessageHandler] Received media resources:", { tabId, count: resources?.length || 0, hasInterceptorInfo: !!interceptorInfo });

    // Apply Filter
    if (filter) {
      const originalCount = resources?.length || 0;
      if (filter.types && filter.types.length > 0) {
        resources = resources.filter((r: any) => filter.types!.includes(r.type));
      }
      if (filter.urlPattern) {
        resources = resources.filter((r: any) => r.url.includes(filter.urlPattern!));
      }
      console.log("[MessageHandler] Applied filter:", { originalCount, filteredCount: resources?.length || 0, filter });
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

  private async fetchBlobUrl(
    correlationId: string,
    tabId: number,
    blobUrl: string
  ): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (tab.url && (await isDomainInDenyList(tab.url))) {
      throw new Error(`Domain in tab URL is in the deny list`);
    }

    await this.checkForUrlPermission(tab.url);

    console.log("[MessageHandler] Fetching blob URL:", { tabId, blobUrl });

    try {
      // Try to fetch from all frames since blob URLs are origin-bound
      // and may have been created in an iframe
      const results = await browser.tabs.executeScript(tabId, {
        code: `
        (async function() {
          const blobUrl = ${JSON.stringify(blobUrl)};
          try {
            // First check if URL looks valid
            if (!blobUrl.startsWith('blob:')) {
              return { error: 'Invalid blob URL format' };
            }
            
            const response = await fetch(blobUrl);
            if (!response.ok) {
              return { error: 'Fetch failed: ' + response.status + ' ' + response.statusText };
            }
            const blob = await response.blob();
            const reader = new FileReader();
            return await new Promise((resolve, reject) => {
              reader.onloadend = () => {
                const base64 = reader.result.split(',')[1]; // Remove data:...;base64, prefix
                resolve({
                  data: base64,
                  mimeType: blob.type,
                  size: blob.size
                });
              };
              reader.onerror = () => resolve({ error: 'FileReader error' });
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            // Return error info for this frame
            return { error: e.message || 'Unknown error', frameError: true };
          }
        })();
        `,
        allFrames: true, // Try in all frames
      });

      // Find a successful result from any frame
      let successResult = null;
      let lastError = 'No frames returned results';

      for (const result of results || []) {
        if (result && !result.error) {
          successResult = result;
          break;
        } else if (result?.error) {
          lastError = result.error;
        }
      }

      const finalResult = successResult || { error: lastError };

      console.log("[MessageHandler] Blob URL fetch result:", {
        tabId,
        success: !finalResult?.error,
        size: finalResult?.size,
        mimeType: finalResult?.mimeType,
        framesChecked: results?.length || 0
      });

      await this.client.sendResourceToServer({
        resource: "blob-data",
        correlationId,
        tabId,
        blobUrl,
        data: finalResult?.data,
        mimeType: finalResult?.mimeType,
        size: finalResult?.size,
        error: finalResult?.error,
      });
    } catch (error: any) {
      console.error("[MessageHandler] Failed to fetch blob URL:", { tabId, blobUrl, error: error.message });
      await this.client.sendResourceToServer({
        resource: "blob-data",
        correlationId,
        tabId,
        blobUrl,
        error: error.message,
      });
    }
  }

  private async fetchUrl(
    correlationId: string,
    url: string,
    tabId?: number,
    options?: {
      referrer?: string;
      headers?: Record<string, string>;
      fetchMode?: "background" | "tab";
    }
  ): Promise<void> {
    console.log("[MessageHandler] Fetching URL:", { url, tabId, options });

    const fetchMode = options?.fetchMode || "background";

    try {
      if (fetchMode === "tab") {
        // Tab mode: Execute fetch inside the page context to bypass CORS
        if (!tabId) {
          await this.client.sendResourceToServer({
            resource: "fetched-url-data",
            correlationId,
            url,
            error: "Tab mode requires tabId parameter",
          });
          return;
        }

        console.log("[MessageHandler] Using tab-based fetch for URL:", url);

        // Execute fetch inside the tab's page context
        const results = await browser.tabs.executeScript(tabId, {
          code: `
          (async () => {
            try {
              const url = ${JSON.stringify(url)};
              const response = await fetch(url, { credentials: 'include' });
              if (!response.ok) {
                return { error: 'Fetch failed: ' + response.status + ' ' + response.statusText };
              }
              
              // Get filename from Content-Disposition or URL
              let filename;
              const contentDisposition = response.headers.get('content-disposition');
              if (contentDisposition) {
                const match = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\\n]+)["']?/i);
                if (match) {
                  filename = decodeURIComponent(match[1]);
                }
              }
              if (!filename) {
                try {
                  const urlPath = new URL(url).pathname;
                  const pathFilename = urlPath.split('/').pop();
                  if (pathFilename && pathFilename.includes('.')) {
                    filename = decodeURIComponent(pathFilename);
                  }
                } catch (e) {}
              }
              
              const mimeType = response.headers.get('content-type')?.split(';')[0].trim();
              const blob = await response.blob();
              const reader = new FileReader();
              
              return await new Promise((resolve, reject) => {
                reader.onloadend = () => {
                  const base64 = reader.result.split(',')[1];
                  resolve({
                    data: base64,
                    mimeType: mimeType || blob.type,
                    size: blob.size,
                    filename: filename
                  });
                };
                reader.onerror = () => resolve({ error: 'FileReader error' });
                reader.readAsDataURL(blob);
              });
            } catch (e) {
              return { error: e.message || 'Unknown error' };
            }
          })();
          `,
        });

        const result = results?.[0];

        if (result?.error) {
          console.error("[MessageHandler] Tab fetch failed:", result.error);
          await this.client.sendResourceToServer({
            resource: "fetched-url-data",
            correlationId,
            url,
            error: result.error,
          });
        } else if (result?.data) {
          console.log("[MessageHandler] Tab fetch successful:", {
            url,
            size: result.size,
            mimeType: result.mimeType,
            filename: result.filename,
          });
          await this.client.sendResourceToServer({
            resource: "fetched-url-data",
            correlationId,
            url,
            data: result.data,
            mimeType: result.mimeType,
            size: result.size,
            filename: result.filename,
          });
        } else {
          await this.client.sendResourceToServer({
            resource: "fetched-url-data",
            correlationId,
            url,
            error: "No data returned from tab fetch",
          });
        }
        return;
      }

      // Background mode: Fetch from extension background script
      // Determine if this is a same-origin request for credentials decision
      let isSameOrigin = false;
      let referrerUrl: string | undefined;

      if (tabId) {
        try {
          const tab = await browser.tabs.get(tabId);
          if (tab.url) {
            referrerUrl = tab.url;
            try {
              const tabOrigin = new URL(tab.url).origin;
              const urlOrigin = new URL(url).origin;
              isSameOrigin = tabOrigin === urlOrigin;
            } catch (e) {
              // Ignore URL parse errors
            }
          }
        } catch (e) {
          console.warn("[MessageHandler] Could not get tab for referrer:", e);
        }
      }

      // Build fetch options
      const fetchOptions: RequestInit = {
        method: "GET",
        credentials: isSameOrigin ? "include" : "omit",
        mode: "cors",
      };

      if (options?.headers) {
        fetchOptions.headers = options.headers;
      }

      if (options?.referrer) {
        fetchOptions.referrer = options.referrer;
      } else if (referrerUrl) {
        fetchOptions.referrer = referrerUrl;
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        await this.client.sendResourceToServer({
          resource: "fetched-url-data",
          correlationId,
          url,
          error: `HTTP ${response.status}: ${response.statusText}`,
        });
        return;
      }

      // Extract filename from Content-Disposition header or URL
      let filename: string | undefined;
      const contentDisposition = response.headers.get("content-disposition");
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
        if (filenameMatch) {
          filename = decodeURIComponent(filenameMatch[1]);
        }
      }
      if (!filename) {
        try {
          const urlPath = new URL(url).pathname;
          const pathFilename = urlPath.split("/").pop();
          if (pathFilename && pathFilename.includes(".")) {
            filename = decodeURIComponent(pathFilename);
          }
        } catch (e) {
          // Ignore URL parsing errors
        }
      }

      const mimeType = response.headers.get("content-type")?.split(";")[0].trim();
      const blob = await response.blob();
      const reader = new FileReader();

      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(blob);
      });

      console.log("[MessageHandler] URL fetched successfully:", {
        url,
        size: blob.size,
        mimeType,
        filename,
      });

      await this.client.sendResourceToServer({
        resource: "fetched-url-data",
        correlationId,
        url,
        data: base64Data,
        mimeType: mimeType || blob.type,
        size: blob.size,
        filename,
      });
    } catch (error: any) {
      console.error("[MessageHandler] Failed to fetch URL:", { url, error: error.message });
      await this.client.sendResourceToServer({
        resource: "fetched-url-data",
        correlationId,
        url,
        error: error.message,
      });
    }
  }
}
