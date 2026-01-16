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

export interface GetDebugPasswordServerMessage extends ServerMessageBase {
  cmd: "get-debug-password";
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
  | GetDebugPasswordServerMessage;

export type ServerMessageRequest = ServerMessage & { correlationId: string };
