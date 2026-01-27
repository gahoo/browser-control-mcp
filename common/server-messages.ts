export interface ServerMessageBase {
  cmd: string;
}

export interface OpenTabServerMessage extends ServerMessageBase {
  cmd: "open-tab";
  url: string;
}

export interface CloseTabsServerMessage extends ServerMessageBase {
  cmd: "close-tabs";
  tabIds: number[];
}

export interface GetTabListServerMessage extends ServerMessageBase {
  cmd: "get-tab-list";
}

export interface GetBrowserRecentHistoryServerMessage extends ServerMessageBase {
  cmd: "get-browser-recent-history";
  searchQuery?: string;
}

export interface GetTabContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-content";
  tabId: number;
  offset?: number;
}

export interface ReorderTabsServerMessage extends ServerMessageBase {
  cmd: "reorder-tabs";
  tabOrder: number[];
}

export interface FindHighlightServerMessage extends ServerMessageBase {
  cmd: "find-highlight";
  tabId: number;
  queryPhrase: string;
}

export interface GroupTabsServerMessage extends ServerMessageBase {
  cmd: "group-tabs";
  tabIds: number[];
  isCollapsed?: boolean;
  groupColor?: string;
  groupTitle?: string;
  groupId?: number;
}

export interface GetTabGroupsServerMessage extends ServerMessageBase {
  cmd: "get-tab-groups";
}

export interface QueryTabsServerMessage extends ServerMessageBase {
  cmd: "query-tabs";
  title?: string;
  url?: string;
  groupId?: number;
  active?: boolean;
  currentWindow?: boolean;
  pinned?: boolean;
  audible?: boolean;
  muted?: boolean;
  status?: "loading" | "complete";
}

export interface GetClickableElementsServerMessage extends ServerMessageBase {
  cmd: "get-clickable-elements";
  tabId: number;
  selector?: string;
}

export interface ClickElementServerMessage extends ServerMessageBase {
  cmd: "click-element";
  tabId: number;
  textContent?: string;
  selector?: string;
  xpath?: string;
  index?: number;
}

export interface ExecuteScriptServerMessage extends ServerMessageBase {
  cmd: "execute-script";
  tabId: number;
  script: string;
  password: string;
}

export interface GetTabMarkdownContentServerMessage extends ServerMessageBase {
  cmd: "get-tab-markdown-content";
  tabId: number;
  options?: {
    maxLength?: number;
    cssSelector?: string;
  };
}

export interface GetDebugPasswordServerMessage extends ServerMessageBase {
  cmd: "get-debug-password";
}

export interface ReloadTabServerMessage extends ServerMessageBase {
  cmd: "reload-tab";
  tabId: number;
  bypassCache?: boolean;
}

export interface InstallMediaInterceptorServerMessage extends ServerMessageBase {
  cmd: "install-media-interceptor";
  tabId: number;
  options?: {
    autoReload?: boolean;
    waitAfterReload?: number;
    strategies?: ("fetch" | "xhr" | "dom" | "mse")[];
    urlPattern?: string;
    preset?: "twitter" | "default";
  };
}

export interface GetInterceptedMediaResourcesServerMessage extends ServerMessageBase {
  cmd: "get-tab-media-resources";
  tabId: number;
  flush?: boolean;
  filter?: {
    types?: ("video" | "audio" | "image" | "stream")[];
    urlPattern?: string;
  };
}

export interface FetchBlobUrlServerMessage extends ServerMessageBase {
  cmd: "fetch-blob-url";
  tabId: number;
  blobUrl: string;
}

export interface FetchUrlServerMessage extends ServerMessageBase {
  cmd: "fetch-url";
  tabId?: number;  // Optional: context tab for cookies/referrer
  url: string;
  options?: {
    referrer?: string;
    headers?: Record<string, string>;
    fetchMode?: "background" | "tab";  // background = extension fetch, tab = in-page fetch (bypasses CORS)
  };
}

export interface TakeSnapshotServerMessage extends ServerMessageBase {
  cmd: "take-snapshot";
  tabId: number;
  selector?: string;
  method?: "native" | "readability";
  scroll?: boolean;
}

export interface IsTabLoadedServerMessage extends ServerMessageBase {
  cmd: "is-tab-loaded";
  tabId: number;
}

export interface FindElementServerMessage extends ServerMessageBase {
  cmd: "find-element";
  tabId: number;
  query: string;
  mode: "css" | "xpath" | "text" | "regexp";
}

export type ServerMessage =
  | OpenTabServerMessage
  | CloseTabsServerMessage
  | GetTabListServerMessage
  | GetBrowserRecentHistoryServerMessage
  | GetTabContentServerMessage
  | ReorderTabsServerMessage
  | FindHighlightServerMessage
  | GroupTabsServerMessage
  | GetTabGroupsServerMessage
  | QueryTabsServerMessage
  | GetClickableElementsServerMessage
  | ClickElementServerMessage
  | ExecuteScriptServerMessage
  | GetTabMarkdownContentServerMessage
  | GetDebugPasswordServerMessage
  | ReloadTabServerMessage
  | InstallMediaInterceptorServerMessage
  | GetInterceptedMediaResourcesServerMessage
  | FetchBlobUrlServerMessage
  | FetchUrlServerMessage
  | TakeSnapshotServerMessage
  | IsTabLoadedServerMessage
  | FindElementServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
