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
} from "@browser-control-mcp/common";
import { isPortInUse } from "./util";
import * as crypto from "crypto";

const WS_DEFAULT_PORT = 8089;
const EXTENSION_RESPONSE_TIMEOUT_MS = 1000;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

export class BrowserAPI {
  private ws: WebSocket | null = null;
  private wsServer: WebSocket.Server | null = null;
  private sharedSecret: string | null = null;

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

    console.error(`Starting WebSocket server on ${host}:${port}`);
    this.wsServer.on("connection", async (connection) => {
      this.ws = connection;

      console.error("WebSocket connection established on port", port);

      this.ws.on("message", (message) => {
        const decoded = JSON.parse(message.toString());
        if (isErrorMessage(decoded)) {
          this.handleExtensionError(decoded);
          return;
        }
        const signature = this.createSignature(JSON.stringify(decoded.payload));
        if (signature !== decoded.signature) {
          console.error("Invalid message signature");
          return;
        }
        this.handleDecodedExtensionMessage(decoded.payload);
      });
    });
    this.wsServer.on("error", (error) => {
      console.error("WebSocket server error:", error);
    });
  }

  close() {
    this.wsServer?.close();
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
    filter?: {
      types?: ("video" | "audio" | "image" | "stream")[];
      urlPattern?: string;
      shouldClear?: boolean;
    }
  ): Promise<InterceptedMediaResourcesExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-media-resources",
      tabId,
      filter,
    });
    return await this.waitForResponse(correlationId, "intercepted-media-resources");
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

    // Send the signed message to the extension
    this.ws.send(JSON.stringify(signedMessage));

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const { resolve, resource } = this.extensionRequestMap.get(correlationId)!;
    if (resource !== decoded.resource) {
      console.error("Resource mismatch:", resource, decoded.resource);
      return;
    }
    this.extensionRequestMap.delete(correlationId);
    resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const { reject } = this.extensionRequestMap.get(correlationId)!;
    this.extensionRequestMap.delete(correlationId);
    reject(errorMessage);
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
          this.extensionRequestMap.delete(correlationId);
          reject("Timed out waiting for response");
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
