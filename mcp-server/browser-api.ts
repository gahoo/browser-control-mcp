import WebSocket from "ws";
import type {
  ExtensionMessage,
  BrowserTab,
  BrowserHistoryItem,
  BrowserTabGroup,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
  ClickableElement,
  ClickResultExtensionMessage,
  ExecuteScriptResultExtensionMessage,
  MarkdownContentExtensionMessage,
  InterceptedMediaResourcesExtensionMessage,
  BlobDataExtensionMessage,
  FetchedUrlDataExtensionMessage,
} from "@browser-control-mcp/common";
import { isPortInUse } from "./util";
import { logger } from "./logger";
import * as crypto from "crypto";

const WS_DEFAULT_PORT = 8089;
const EXTENSION_RESPONSE_TIMEOUT_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 30000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServer: WebSocket.Server | null = null;
  private sharedSecret: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionStartTime: number = 0;
  private isAlive: boolean = false;

  // Map to persist the request to the extension. It maps the request correlationId
  // to a resolver, fulfulling a promise created when sending a message to the extension.
  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  async init() {
    const { secret, port } = readConfig();
    if (!secret) {
      throw new Error(
        "EXTENSION_SECRET env var missing. See the extension's options page."
      );
    }
    this.sharedSecret = secret;

    if (await isPortInUse(port)) {
      throw new Error(
        `Configured port ${port} is already in use. Please configure a different port.`
      );
    }

    // Unless running in a container, bind to localhost only
    const host = process.env.CONTAINERIZED ? "0.0.0.0" : "localhost";

    this.wsServer = new WebSocket.Server({
      host,
      port,
    });

    const logConfig = logger.getConfig();
    logger.info("WebSocket server starting", { host, port, logLevel: logConfig.level, logFile: logConfig.logFile });

    this.wsServer.on("connection", async (connection) => {
      this.ws = connection;
      this.connectionStartTime = Date.now();
      this.isAlive = true;

      logger.info("WebSocket connection established", { port });

      // Setup pong listener for heartbeat
      this.ws.on("pong", () => {
        this.isAlive = true;
        logger.debug("Received pong from extension");
      });

      // Start heartbeat interval
      this.startHeartbeat();

      this.ws.on("message", (message) => {
        const messageStr = message.toString();
        logger.debug("Received message from extension", { size: messageStr.length });

        try {
          const decoded = JSON.parse(messageStr);
          if (isErrorMessage(decoded)) {
            logger.warn("Received error from extension", { correlationId: decoded.correlationId, error: decoded.errorMessage });
            this.handleExtensionError(decoded);
            return;
          }
          const signature = this.createSignature(JSON.stringify(decoded.payload));
          if (signature !== decoded.signature) {
            logger.error("Invalid message signature - rejecting message");
            return;
          }
          logger.debug("Processing extension message", { resource: decoded.payload?.resource, correlationId: decoded.payload?.correlationId });
          this.handleDecodedExtensionMessage(decoded.payload);
        } catch (err) {
          logger.error("Failed to parse message from extension", { error: String(err) });
        }
      });

      this.ws.on("close", (code, reason) => {
        const uptime = Date.now() - this.connectionStartTime;
        logger.warn("WebSocket connection closed", { code, reason: reason.toString(), uptimeMs: uptime });
        this.stopHeartbeat();
        this.isAlive = false;
      });

      this.ws.on("error", (error) => {
        logger.error("WebSocket connection error", { error: error.message });
      });
    });

    this.wsServer.on("error", (error) => {
      logger.error("WebSocket server error", { error: error.message });
    });
  }

  close() {
    logger.info("Closing BrowserAPI");
    this.stopHeartbeat();
    this.wsServer?.close();
    logger.close();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    logger.debug("Starting heartbeat interval", { intervalMs: HEARTBEAT_INTERVAL_MS });

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws) return;

      if (!this.isAlive) {
        logger.warn("Extension did not respond to ping - connection may be dead");
        // Don't terminate - let the browser extension reconnect
        return;
      }

      this.isAlive = false;
      try {
        this.ws.ping();
        logger.debug("Sent ping to extension");
      } catch (err) {
        logger.error("Failed to send ping", { error: String(err) });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.debug("Stopped heartbeat interval");
    }
  }

  getSelectedPort() {
    return this.wsServer?.options.port;
  }

  async openTab(url: string): Promise<number | undefined> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-tab",
      url,
    });
    const message = await this.waitForResponse(correlationId, "opened-tab-id");
    return message.tabId;
  }

  async closeTabs(tabIds: number[]) {
    const correlationId = this.sendMessageToExtension({
      cmd: "close-tabs",
      tabIds,
    });
    await this.waitForResponse(correlationId, "tabs-closed");
  }

  async getTabList(): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-list",
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getBrowserRecentHistory(
    searchQuery?: string
  ): Promise<BrowserHistoryItem[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-browser-recent-history",
      searchQuery,
    });
    const message = await this.waitForResponse(correlationId, "history");
    return message.historyItems;
  }

  async getTabContent(
    tabId: number,
    offset: number
  ): Promise<TabContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-content",
      tabId,
      offset,
    });
    return await this.waitForResponse(correlationId, "tab-content");
  }

  async getMarkdownContent(
    tabId: number,
    options?: { maxLength?: number }
  ): Promise<MarkdownContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-markdown-content",
      tabId,
      options,
    });
    return await this.waitForResponse(correlationId, "markdown-content");
  }

  async reorderTabs(tabOrder: number[]): Promise<number[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reorder-tabs",
      tabOrder,
    });
    const message = await this.waitForResponse(correlationId, "tabs-reordered");
    return message.tabOrder;
  }

  async findHighlight(tabId: number, queryPhrase: string): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "find-highlight",
      tabId,
      queryPhrase,
    });
    const message = await this.waitForResponse(
      correlationId,
      "find-highlight-result"
    );
    return message.noOfResults;
  }

  async groupTabs(
    tabIds: number[],
    isCollapsed?: boolean,
    groupColor?: string,
    groupTitle?: string,
    groupId?: number
  ): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "group-tabs",
      tabIds,
      isCollapsed,
      groupColor,
      groupTitle,
      groupId,
    });
    const message = await this.waitForResponse(correlationId, "new-tab-group");
    return message.groupId;
  }

  async getTabGroups(): Promise<BrowserTabGroup[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-groups",
    });
    const message = await this.waitForResponse(correlationId, "tab-groups");
    return message.groups;
  }

  async queryTabs(
    title?: string,
    url?: string,
    groupId?: number,
    active?: boolean,
    currentWindow?: boolean,
    pinned?: boolean,
    audible?: boolean,
    muted?: boolean,
    status?: "loading" | "complete"
  ): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "query-tabs",
      title,
      url,
      groupId,
      active,
      currentWindow,
      pinned,
      audible,
      muted,
      status,
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getClickableElements(
    tabId: number,
    selector?: string
  ): Promise<ClickableElement[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-clickable-elements",
      tabId,
      selector,
    });
    const message = await this.waitForResponse(correlationId, "clickable-elements");
    return message.elements;
  }

  async clickElement(
    tabId: number,
    options: { textContent?: string; selector?: string; xpath?: string; index?: number }
  ): Promise<ClickResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "click-element",
      tabId,
      textContent: options.textContent,
      selector: options.selector,
      xpath: options.xpath,
      index: options.index,
    });
    return await this.waitForResponse(correlationId, "click-result");
  }

  async executeScript(
    tabId: number,
    script: string,
    password: string
  ): Promise<ExecuteScriptResultExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "execute-script",
      tabId,
      script,
      password,
    });
    return await this.waitForResponse(correlationId, "script-result");
  }

  async getDebugPassword(): Promise<string> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-debug-password",
    });
    const message = await this.waitForResponse(correlationId, "debug-password");
    return message.password;
  }

  async reloadTab(tabId: number, bypassCache?: boolean): Promise<void> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reload-tab",
      tabId,
      bypassCache,
    });
    await this.waitForResponse(correlationId, "tab-reloaded");
  }

  async installMediaInterceptor(
    tabId: number,
    options?: {
      autoReload?: boolean;
      waitAfterReload?: number;
      strategies?: ("fetch" | "xhr" | "dom" | "mse")[];
      urlPattern?: string;
      preset?: "twitter" | "default";
    }
  ): Promise<InterceptedMediaResourcesExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "install-media-interceptor",
      tabId,
      options,
    });
    // Use a longer timeout because this might involve reloading the page
    const timeout = options?.autoReload ? 30000 : 10000;
    // We expect the "intercepted-media-resources" message as confirmation (with empty resources list)
    return await this.waitForResponse(correlationId, "intercepted-media-resources", timeout);
  }

  async getTabMediaResources(
    tabId: number,
    flush?: boolean,
    filter?: {
      types?: ("video" | "audio" | "image" | "stream")[];
      urlPattern?: string;
    }
  ): Promise<InterceptedMediaResourcesExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-media-resources",
      tabId,
      flush,
      filter,
    });
    return await this.waitForResponse(correlationId, "intercepted-media-resources");
  }

  async fetchBlobUrl(
    tabId: number,
    blobUrl: string
  ): Promise<BlobDataExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "fetch-blob-url",
      tabId,
      blobUrl,
    });
    return await this.waitForResponse(correlationId, "blob-data");
  }

  async fetchUrl(
    url: string,
    tabId?: number,
    options?: {
      referrer?: string;
      headers?: Record<string, string>;
    }
  ): Promise<FetchedUrlDataExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "fetch-url",
      url,
      tabId,
      options,
    });
    // Use a longer timeout for potentially large files
    return await this.waitForResponse(correlationId, "fetched-url-data", 30000);
  }

  private createSignature(payload: string): string {
    if (!this.sharedSecret) {
      throw new Error("Shared secret not initialized");
    }
    const hmac = crypto.createHmac("sha256", this.sharedSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.error("Cannot send message - WebSocket not connected", { cmd: message.cmd, readyState: this.ws?.readyState });
      throw new Error("WebSocket is not open");
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };
    const payload = JSON.stringify(req);
    const signature = this.createSignature(payload);
    const signedMessage = {
      payload: req,
      signature: signature,
    };

    logger.debug("Sending message to extension", { cmd: message.cmd, correlationId });

    // Send the signed message to the extension
    this.ws.send(JSON.stringify(signedMessage));

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const resolver = this.extensionRequestMap.get(correlationId);
    if (!resolver) {
      logger.warn("Received response for unknown correlationId - may have timed out", { correlationId, resource: decoded.resource });
      return;
    }
    const { resolve, resource } = resolver;
    if (resource !== decoded.resource) {
      logger.error("Resource mismatch", { expected: resource, received: decoded.resource, correlationId });
      return;
    }
    logger.debug("Received response from extension", { resource, correlationId });
    this.extensionRequestMap.delete(correlationId);
    resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const resolver = this.extensionRequestMap.get(correlationId);
    if (!resolver) {
      logger.warn("Received error for unknown correlationId", { correlationId, errorMessage });
      return;
    }
    logger.error("Extension returned error", { correlationId, errorMessage });
    this.extensionRequestMap.delete(correlationId);
    resolver.reject(errorMessage);
  }

  private async waitForResponse<T extends ExtensionMessage["resource"]>(
    correlationId: string,
    resource: T,
    timeoutMs: number = EXTENSION_RESPONSE_TIMEOUT_MS
  ): Promise<Extract<ExtensionMessage, { resource: T }>> {
    return new Promise<Extract<ExtensionMessage, { resource: T }>>(
      (resolve, reject) => {
        this.extensionRequestMap.set(correlationId, {
          resolve: resolve as (value: ExtensionMessage) => void,
          resource,
          reject,
        });
        setTimeout(() => {
          if (this.extensionRequestMap.has(correlationId)) {
            logger.warn("Request timed out", { correlationId, resource, timeoutMs });
            this.extensionRequestMap.delete(correlationId);
            reject("Timed out waiting for response");
          }
        }, timeoutMs);
      }
    );
  }
}

function readConfig() {
  return {
    secret: process.env.EXTENSION_SECRET,
    port: process.env.EXTENSION_PORT
      ? parseInt(process.env.EXTENSION_PORT, 10)
      : WS_DEFAULT_PORT,
  };
}

export function isErrorMessage(message: any): message is ExtensionError {
  return (
    message.errorMessage !== undefined && message.correlationId !== undefined
  );
}
