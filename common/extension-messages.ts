export interface ExtensionMessageBase {
  resource: string;
  correlationId: string;
}

export interface RunPromptExtensionMessage extends ExtensionMessageBase {
  resource: "run-prompt-request";
  prompt: string;
  model?: string; // Optional model preference
}

export interface TabContentExtensionMessage extends ExtensionMessageBase {
  resource: "tab-content";
  tabId: number;
  fullText: string;
  isTruncated: boolean;
  totalLength: number;
  links: { url: string; text: string }[];
}

export interface BrowserTab {
  id?: number;
  url?: string;
  title?: string;
  lastAccessed?: number;
}

export interface TabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs";
  tabs: BrowserTab[];
}

export interface OpenedTabIdExtensionMessage extends ExtensionMessageBase {
  resource: "opened-tab-id";
  tabId: number | undefined;
}

export interface BrowserHistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
}

export interface BrowserHistoryExtensionMessage extends ExtensionMessageBase {
  resource: "history";

  historyItems: BrowserHistoryItem[];
}

export interface ReorderedTabsExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-reordered";
  tabOrder: number[];
}

export interface FindHighlightExtensionMessage extends ExtensionMessageBase {
  resource: "find-highlight-result";
  noOfResults: number;
}

export interface TabsClosedExtensionMessage extends ExtensionMessageBase {
  resource: "tabs-closed";
}

export interface TabGroupCreatedExtensionMessage extends ExtensionMessageBase {
  resource: "new-tab-group";
  groupId: string;
}

export interface BrowserTabGroup {
  id: string;
  title?: string;
  color?: string;
  collapsed?: boolean;
}

export interface TabGroupsExtensionMessage extends ExtensionMessageBase {
  resource: "tab-groups";
  groups: BrowserTabGroup[];
}

export interface ClickableElement {
  index: number;
  tagName: string;
  textContent: string;
  href?: string;
  type?: string;
  selector: string;
  xpath: string;
}

export interface ClickableElementsExtensionMessage extends ExtensionMessageBase {
  resource: "clickable-elements";
  tabId: number;
  elements: ClickableElement[];
}

export interface ClickResultExtensionMessage extends ExtensionMessageBase {
  resource: "click-result";
  success: boolean;
  clickedElement?: ClickableElement;
  error?: string;
}

export interface ExecuteScriptResultExtensionMessage extends ExtensionMessageBase {
  resource: "script-result";
  result: any;
  error?: string;
}

export interface DebugPasswordExtensionMessage extends ExtensionMessageBase {
  resource: "debug-password";
  password: string;
}

export interface MarkdownContentExtensionMessage extends ExtensionMessageBase {
  resource: "markdown-content";
  tabId: number;
  content: {
    markdown: string;
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
  };
  isTruncated: boolean;
}

export interface TabReloadedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-reloaded";
  tabId: number;
}

export interface MediaResource {
  url: string;
  type: "video" | "audio" | "stream" | "image" | "unknown";
  source: "dom" | "fetch" | "xhr" | "mse" | "element-src";
  mimeType?: string;
  extension?: string;
  metadata?: {
    elementTag?: string; // video, audio, source
    elementSelector?: string;
    requestHeaders?: Record<string, string>;
    isBlobUrl?: boolean;
    originalBlobUrl?: string; // If we resolved a blob URL
  };
}

export interface InterceptedMediaResourcesExtensionMessage extends ExtensionMessageBase {
  resource: "intercepted-media-resources";
  tabId: number;
  resources: MediaResource[];
  wasReloaded: boolean;
  interceptorInfo: {
    hooksInstalled: boolean;
    cspInfo?: string;
    logs?: string[];
    earlyInjection?: boolean;
  };
}

export interface BlobDataExtensionMessage extends ExtensionMessageBase {
  resource: "blob-data";
  tabId: number;
  blobUrl: string;
  data?: string;  // Base64 encoded
  mimeType?: string;
  size?: number;
  error?: string;
}

export interface FetchedUrlDataExtensionMessage extends ExtensionMessageBase {
  resource: "fetched-url-data";
  url: string;
  data?: string;  // Base64 encoded
  mimeType?: string;
  size?: number;
  filename?: string;  // Extracted from Content-Disposition or URL
  error?: string;
}

export interface SnapshotResultExtensionMessage extends ExtensionMessageBase {
  resource: "snapshot-result";
  data?: string; // Base64 encoded image data (data:image/png;base64,...)
  error?: string;
}

export interface TabLoadedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-loaded";
  isLoaded: boolean;
}

export interface FoundElement {
  index: number;
  tagName: string;
  text: string;
  html: string;
  selector: string;
  xpath: string;
  isVisible?: boolean;
}

export interface ElementFoundExtensionMessage extends ExtensionMessageBase {
  resource: "element-found";
  elements: FoundElement[];
}

export interface TextTypedExtensionMessage extends ExtensionMessageBase {
  resource: "text-typed";
  success: boolean;
  error?: string;
}

export interface KeyPressedExtensionMessage extends ExtensionMessageBase {
  resource: "key-pressed";
  success: boolean;
  error?: string;
}


export interface TabSwitchedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-switched";
  tabId: number;
}

export interface TabGroupRenamedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-group-renamed";
  groupId: string;
  newTitle: string;
}

export interface TabGroupDeletedExtensionMessage extends ExtensionMessageBase {
  resource: "tab-group-deleted";
  groupId: string;
}

export interface RunPromptExtensionMessage extends ExtensionMessageBase {
  resource: "run-prompt-request";
  prompt: string;
}

export interface GetServerStatusExtensionMessage extends ExtensionMessageBase {
  resource: "get-server-status";
}

export type ExtensionMessage =
  | TabContentExtensionMessage
  | TabsExtensionMessage
  | OpenedTabIdExtensionMessage
  | BrowserHistoryExtensionMessage
  | ReorderedTabsExtensionMessage
  | FindHighlightExtensionMessage
  | TabsClosedExtensionMessage
  | TabGroupCreatedExtensionMessage
  | TabGroupsExtensionMessage
  | ClickableElementsExtensionMessage
  | ClickResultExtensionMessage
  | ExecuteScriptResultExtensionMessage
  | MarkdownContentExtensionMessage
  | DebugPasswordExtensionMessage
  | TabReloadedExtensionMessage
  | InterceptedMediaResourcesExtensionMessage
  | BlobDataExtensionMessage
  | FetchedUrlDataExtensionMessage
  | SnapshotResultExtensionMessage
  | TabLoadedExtensionMessage
  | ElementFoundExtensionMessage
  | TextTypedExtensionMessage
  | KeyPressedExtensionMessage
  | TabSwitchedExtensionMessage
  | TabGroupRenamedExtensionMessage
  | TabGroupDeletedExtensionMessage
  | RunPromptExtensionMessage
  | GetServerStatusExtensionMessage;

export interface ExtensionError {
  correlationId: string;
  errorMessage: string;
}