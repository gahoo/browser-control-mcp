import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BrowserAPI } from "./browser-api";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const mcpServer = new McpServer({
  name: "BrowserControl",
  version: "1.5.1",
});

mcpServer.tool(
  "open-browser-tab",
  "Open a new tab in the user's browser (useful when the user asks to open a website)",
  { url: z.string() },
  async ({ url }) => {
    const openedTabId = await browserApi.openTab(url);
    if (openedTabId !== undefined) {
      return {
        content: [
          {
            type: "text",
            text: `${url} opened in tab id ${openedTabId}`,
          },
        ],
      };
    } else {
      return {
        content: [{ type: "text", text: "Failed to open tab", isError: true }],
      };
    }
  }
);

mcpServer.tool(
  "close-browser-tabs",
  "Close tabs in the user's browser by tab IDs",
  { tabIds: z.array(z.number()) },
  async ({ tabIds }) => {
    await browserApi.closeTabs(tabIds);
    return {
      content: [{ type: "text", text: "Closed tabs" }],
    };
  }
);

mcpServer.tool(
  "get-list-of-open-tabs",
  "Get the list of open tabs in the user's browser. Use offset and limit parameters for pagination when there are many tabs.",
  {
    offset: z.number().int().min(0).default(0).describe("Starting index for pagination (0-based, must be >= 0)"),
    limit: z.number().default(100).describe("Maximum number of tabs to return (default: 100, max: 500)"),
  },
  async ({ offset, limit }) => {
    // Validate and cap the limit
    const effectiveLimit = Math.min(Math.max(1, limit), 500);

    const openTabs = await browserApi.getTabList();
    const totalTabs = openTabs.length;

    // Apply pagination
    const paginatedTabs = openTabs.slice(offset, offset + effectiveLimit);
    const hasMore = offset + effectiveLimit < totalTabs;

    // Add pagination info as the first content item
    const paginationInfo = {
      type: "text" as const,
      text: `Showing tabs ${offset + 1}-${offset + paginatedTabs.length} of ${totalTabs} total tabs${hasMore ? ` (use offset=${offset + effectiveLimit} to see more)` : ''}`,
    };

    const tabContent = paginatedTabs.map((tab) => {
      let lastAccessed = "unknown";
      if (tab.lastAccessed) {
        lastAccessed = dayjs(tab.lastAccessed).fromNow(); // LLM-friendly time ago
      }
      return {
        type: "text" as const,
        text: `tab id=${tab.id}, tab url=${tab.url}, tab title=${tab.title}, last accessed=${lastAccessed}`,
      };
    });

    return {
      content: [paginationInfo, ...tabContent],
    };
  }
);

mcpServer.tool(
  "get-recent-browser-history",
  "Get the list of recent browser history (to get all, don't use searchQuery)",
  { searchQuery: z.string().optional() },
  async ({ searchQuery }) => {
    const browserHistory = await browserApi.getBrowserRecentHistory(
      searchQuery
    );
    if (browserHistory.length > 0) {
      return {
        content: browserHistory.map((item) => {
          let lastVisited = "unknown";
          if (item.lastVisitTime) {
            lastVisited = dayjs(item.lastVisitTime).fromNow(); // LLM-friendly time ago
          }
          return {
            type: "text",
            text: `url=${item.url}, title="${item.title}", lastVisitTime=${lastVisited}`,
          };
        }),
      };
    } else {
      // If nothing was found for the search query, hint the AI to list
      // all the recent history items instead.
      const hint = searchQuery ? "Try without a searchQuery" : "";
      return { content: [{ type: "text", text: `No history found. ${hint}` }] };
    }
  }
);

mcpServer.tool(
  "get-tab-web-content",
  `
    Get the full text content of the webpage and the list of links in the webpage, by tab ID. 
    Use "offset" only for larger documents when the first call was truncated and if you require more content in order to assist the user.
  `,
  { tabId: z.number(), offset: z.number().default(0) },
  async ({ tabId, offset }) => {
    const content = await browserApi.getTabContent(tabId, offset);
    let links: { type: "text"; text: string }[] = [];
    if (offset === 0) {
      // Only include the links if offset is 0 (default value). Otherwise, we can
      // assume this is not the first call. Adding the links again would be redundant.
      links = content.links.map((link: { text: string; url: string }) => {
        return {
          type: "text",

          text: `Link text: ${link.text}, Link URL: ${link.url}`,
        };
      });
    }

    let text = content.fullText;
    let hint: { type: "text"; text: string }[] = [];
    if (content.isTruncated || offset > 0) {
      // If the content is truncated, add a "tip" suggesting
      // that another tool, search in page, can be used to
      // discover additional data.
      const rangeString = `${offset}-${offset + text.length}`;
      hint = [
        {
          type: "text",
          text:
            `The following text content is truncated due to size (includes character range ${rangeString} out of ${content.totalLength}). ` +
            "If you want to read characters beyond this range, please use the 'get-tab-web-content' tool with an offset. ",
        },
      ];
    }

    return {
      content: [...hint, { type: "text", text }, ...links],
    };
  }
);

mcpServer.tool(
  "reorder-browser-tabs",
  "Change the order of open browser tabs",
  { tabOrder: z.array(z.number()) },
  async ({ tabOrder }) => {
    const newOrder = await browserApi.reorderTabs(tabOrder);
    return {
      content: [
        { type: "text", text: `Tabs reordered: ${newOrder.join(", ")}` },
      ],
    };
  }
);

mcpServer.tool(
  "find-highlight-in-browser-tab",
  "Find and highlight text in a browser tab (use a query phrase that exists in the web content)",
  { tabId: z.number(), queryPhrase: z.string() },
  async ({ tabId, queryPhrase }) => {
    const noOfResults = await browserApi.findHighlight(tabId, queryPhrase);
    return {
      content: [
        {
          type: "text",
          text: `Number of results found and highlighted in the tab: ${noOfResults}`,
        },
      ],
    };
  }
);

mcpServer.tool(
  "group-browser-tabs",
  "Organize opened browser tabs in a tab group. If groupId is provided, tabs will be added to that existing group; otherwise a new group will be created.",
  {
    tabIds: z.array(z.number()).describe("Array of tab IDs to group"),
    groupId: z.number().optional().describe("Optional existing group ID to add tabs to"),
    isCollapsed: z.boolean().optional().default(false).describe("Whether the group should be collapsed"),
    groupColor: z
      .enum([
        "grey",
        "blue",
        "red",
        "yellow",
        "green",
        "pink",
        "purple",
        "cyan",
        "orange",
      ])
      .optional()
      .default("grey")
      .describe("Color of the tab group"),
    groupTitle: z.string().optional().default("New Group").describe("Title of the tab group"),
  },
  async ({ tabIds, groupId, isCollapsed, groupColor, groupTitle }) => {
    const resultGroupId = await browserApi.groupTabs(
      tabIds,
      isCollapsed,
      groupColor,
      groupTitle,
      groupId
    );
    const action = groupId !== undefined ? "Added to" : "Created";
    return {
      content: [
        {
          type: "text",
          text: `${action} tab group "${groupTitle}" with ${tabIds.length} tabs (group ID: ${resultGroupId})`,
        },
      ],
    };
  }
);

mcpServer.tool(
  "get-browser-tab-groups",
  "Get the list of existing tab groups in the user's browser",
  {},
  async () => {
    const groups = await browserApi.getTabGroups();
    if (groups.length === 0) {
      return {
        content: [{ type: "text", text: "No tab groups found" }],
      };
    }
    return {
      content: groups.map((group) => ({
        type: "text" as const,
        text: `group id=${group.id}, title="${group.title || "(untitled)"}", color=${group.color || "grey"}, collapsed=${group.collapsed || false}`,
      })),
    };
  }
);

mcpServer.tool(
  "query-open-tabs",
  "Search/filter open tabs with flexible query options. Use 'active: true, currentWindow: true' to get the current tab.",
  {
    title: z.string().optional().describe("Filter tabs whose title contains this string (case-insensitive)"),
    url: z.string().optional().describe("Filter tabs whose URL contains this string (case-insensitive)"),
    groupId: z.number().optional().describe("Filter tabs belonging to this group ID"),
    active: z.boolean().optional().describe("True = only active tab in each window"),
    currentWindow: z.boolean().optional().describe("True = only tabs in the current window"),
    pinned: z.boolean().optional().describe("True = pinned tabs only, false = unpinned only"),
    audible: z.boolean().optional().describe("True = tabs currently playing audio"),
    muted: z.boolean().optional().describe("True = muted tabs only"),
    status: z.enum(["loading", "complete"]).optional().describe("Filter by page load status"),
  },
  async ({ title, url, groupId, active, currentWindow, pinned, audible, muted, status }) => {
    const matchingTabs = await browserApi.queryTabs(
      title, url, groupId, active, currentWindow, pinned, audible, muted, status
    );
    if (matchingTabs.length === 0) {
      return {
        content: [{ type: "text", text: "No matching tabs found" }],
      };
    }
    return {
      content: matchingTabs.map((tab) => {
        let lastAccessed = "unknown";
        if (tab.lastAccessed) {
          lastAccessed = dayjs(tab.lastAccessed).fromNow();
        }
        return {
          type: "text" as const,
          text: `tab id=${tab.id}, tab url=${tab.url}, tab title=${tab.title}, last accessed=${lastAccessed}`,
        };
      }),
    };
  }
);

mcpServer.tool(
  "get-clickable-elements",
  "Get a list of clickable elements (links and buttons) on a web page. Returns textContent, CSS selector, and XPath for each element.",
  {
    tabId: z.number().describe("Tab ID to get clickable elements from"),
    selector: z.string().optional().describe("Optional CSS selector to filter elements"),
  },
  async ({ tabId, selector }) => {
    const elements = await browserApi.getClickableElements(tabId, selector);
    if (elements.length === 0) {
      return {
        content: [{ type: "text", text: "No clickable elements found" }],
      };
    }
    return {
      content: elements.map((el) => ({
        type: "text" as const,
        text: `[${el.index}] <${el.tagName}> "${el.textContent}"${el.href ? ` href="${el.href}"` : ""} selector="${el.selector}" xpath="${el.xpath}"`,
      })),
    };
  }
);

mcpServer.tool(
  "click-element",
  "Click an element on a web page. Supports matching by textContent (partial match), CSS selector, or XPath. Use index when multiple elements match.",
  {
    tabId: z.number().describe("Tab ID containing the element to click"),
    textContent: z.string().optional().describe("Click element containing this text (partial match)"),
    selector: z.string().optional().describe("CSS selector to match the element"),
    xpath: z.string().optional().describe("XPath expression to match the element"),
    index: z.number().optional().describe("Index when multiple elements match (0-based, defaults to 0)"),
  },
  async ({ tabId, textContent, selector, xpath, index }) => {
    const result = await browserApi.clickElement(tabId, { textContent, selector, xpath, index });
    if (result.success && result.clickedElement) {
      return {
        content: [{
          type: "text",
          text: `Clicked: <${result.clickedElement.tagName}> "${result.clickedElement.textContent}"${result.clickedElement.href ? ` (navigating to ${result.clickedElement.href})` : ""}`,
        }],
      };
    } else {
      return {
        content: [{ type: "text", text: result.error || "Failed to click element", isError: true }],
      };
    }
  }
);

mcpServer.tool(
  "execute-script",
  "Execute arbitrary JavaScript code on a web page. Requires a debug password obtained from the get-debug-password tool. Password is consumed after successful use.",
  {
    tabId: z.number().describe("Tab ID to execute script in"),
    script: z.string().describe("JavaScript code to execute"),
    password: z.string().describe("Debug password from get-debug-password tool"),
  },
  async ({ tabId, script, password }) => {
    const result = await browserApi.executeScript(tabId, script, password);
    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error}`, isError: true }],
      };
    }
    return {
      content: [{
        type: "text",
        text: `Script executed. Result: ${JSON.stringify(result.result)}`,
      }],
    };
  }
);

mcpServer.tool(
  "get-debug-password",
  "Get the debug password required for execute-script tool. The password is consumed after each successful script execution.",
  {},
  async () => {
    const password = await browserApi.getDebugPassword();
    return {
      content: [{
        type: "text",
        text: `Debug password: ${password}`,
      }],
    };
  }
);

mcpServer.tool(
  "get-tab-markdown-content",
  `Get clean, LLM-friendly Markdown content from a webpage. Uses Defuddle to extract 
   the main content (removing clutter like ads, navigation, etc.) and returns structured 
   Markdown with metadata (author, date, etc). 
   
   Best for: news articles, blog posts, documentation pages.
   Alternative: use 'get-tab-web-content' for raw text without formatting.`,
  {
    tabId: z.number().describe("Tab ID to extract content from"),
    maxLength: z
      .number()
      .optional()
      .describe("Max content length (default: 100000)"),
  },
  async ({ tabId, maxLength }) => {
    const result = await browserApi.getMarkdownContent(tabId, { maxLength });

    const { markdown, metadata, statistics } = result.content;

    return {
      content: [
        {
          type: "text",
          text:
            `# ${metadata.title}\n\n` +
            `**Author:** ${metadata.author || "Unknown"} | ` +
            `**Published:** ${metadata.publishedDate || "Unknown"} | ` +
            `**Domain:** ${metadata.domain}\n\n` +
            `---\n\n` +
            markdown +
            `\n\n---\n\n` +
            `**Statistics:** ${statistics.wordCount} words, ` +
            `parsed in ${statistics.parseTimeMs}ms` +
            (result.isTruncated ? " (content truncated)" : ""),
        },
      ],
    };
  }
);

mcpServer.tool(
  "reload-browser-tab",
  "Reload/refresh a browser tab by tab ID. Useful for refreshing page content after changes or when content needs to be updated.",
  {
    tabId: z.number().describe("Tab ID to reload"),
    bypassCache: z.boolean().optional().default(false).describe("If true, bypass the browser cache and force reload from server"),
  },
  async ({ tabId, bypassCache }) => {
    await browserApi.reloadTab(tabId, bypassCache);
    return {
      content: [
        {
          type: "text",
          text: `Tab ${tabId} reloaded successfully${bypassCache ? " (cache bypassed)" : ""}`,
        },
      ],
    };
  }
);

mcpServer.tool(
  "install-media-interceptor",
  "Install the media interception script into a browser tab. This prepares the tab for capturing media (video/audio/streams). You can configure strategies and filtering.",
  {
    tabId: z.number().describe("Tab ID to install interceptor in"),
    autoReload: z.boolean().optional().default(false).describe("Reload page to capture early resources (document_start)"),
    waitAfterReload: z.number().optional().default(2000).describe("Ms to wait after reload"),
    strategies: z.array(z.enum(["fetch", "xhr", "dom", "mse"])).optional().describe("Interception strategies to enable"),
    urlPattern: z.string().optional().describe("Only capture resources matching this URL pattern"),
    preset: z.enum(["twitter", "default"]).optional().describe("Use a preset configuration"),
  },
  async ({ tabId, autoReload, waitAfterReload, strategies, urlPattern, preset }) => {
    await browserApi.installMediaInterceptor(tabId, {
      autoReload,
      waitAfterReload,
      strategies,
      urlPattern,
      preset,
    });
    return {
      content: [
        {
          type: "text",
          text: `Media interceptor installed successfully.${autoReload ? " (Page reloaded)" : ""}`,
        },
      ],
    };
  }
);

mcpServer.tool(
  "get-tab-media-resources",
  "Retrieve media resources captured by the installed interceptor. You can filter the results.",
  {
    tabId: z.number().describe("Tab ID to get resources from"),
    filter: z.object({
      types: z.array(z.enum(["video", "audio", "image", "stream"])).optional(),
      urlPattern: z.string().optional(),
      shouldClear: z.boolean().optional().describe("Clear the intercepted list after retrieval (default: false)"),
    }).optional(),
  },
  async ({ tabId, filter }) => {
    const result = await browserApi.getTabMediaResources(tabId, filter);

    if (!result.resources || result.resources.length === 0) {
      return {
        content: [{ type: "text", text: "No media resources found" }],
      };
    }

    const formatted = result.resources.map((r, i) => {
      let text = `[${i + 1}] ${r.type.toUpperCase()} (${r.source}): ${r.url}`;
      if (r.mimeType) text += ` [${r.mimeType}]`;
      if (r.metadata?.isBlobUrl) text += ` (Blob URL)`;
      return {
        type: "text" as const,
        text
      };
    });

    return {
      content: [
        { type: "text", text: `Found ${result.resources.length} media resources:` },
        ...formatted
      ]
    };
  }
);

const browserApi = new BrowserAPI();
browserApi.init().catch((err) => {
  console.error("Browser API init error", err);
  process.exit(1);
});

const transport = new StdioServerTransport();
mcpServer.connect(transport).catch((err) => {
  console.error("MCP Server connection error", err);
  process.exit(1);
});

process.stdin.on("close", () => {
  browserApi.close();
  mcpServer.close();
  process.exit(0);
});
