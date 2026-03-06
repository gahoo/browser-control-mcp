# YouTube Domain Rules

## Video Description Extraction
To reliably extract the full description of a YouTube video (including timestamps, tool links, and long-form text):

1. **Find and Click "More" Button**: 
   - Selector: `tp-yt-paper-button#expand`
   - Action: `click-element(selector: "tp-yt-paper-button#expand", tabId: <ID>)`
   - *Note: This expands the description section which is truncated by default.*

2. **Extract Expanded Content**:
   - Selector: `#description-inline-expander`
   - Action: `get-tab-markdown-content(cssSelector: "#description-inline-expander", tabId: <ID>)`
   - *Note: This will return a clean markdown format of the full video description, converting HTML structure into readable text, capturing all links and timestamps.*

## GitHub Project Links Handling
When analyzing the extracted video descriptions:
1. **Identify Links**: Scan the extracted markdown text for any links to GitHub (`github.com` or `*.github.io`).
2. **Evaluate Value**: Briefly evaluate the project's relevance and potential value based on the video's context.
3. **Open in New Tab**: If the GitHub project link is deemed valuable or requires further inspection, open the link in a new browser tab using `open-browser-tab` (preferably in the same tab group as the current YouTube video).

## NotebookLM Integration
To add the current YouTube video or playlist to Google NotebookLM using the custom injected extension button:

1. **Open the NotebookLM Menu**:
   - Action: `click-element(selector: ".ytlm-add-button", tabId: <ID>)`

2. **Select Destination**:
   - **Method A: Add to a New Notebook**
     - Action: `click-element(selector: '.ytlm-choice[data-type="create-notebook"]', tabId: <ID>)`
   - **Method B: Add to an Existing Notebook**
     1. Click the choose notebook option:
        - Action: `click-element(selector: '.ytlm-choice[data-type="choose-notebook"]', tabId: <ID>)`
     2. Find the target notebook by using the `filter` parameter to reduce interference:
        - Action: `find-element(mode: "css", query: ".ytlm-choice[data-type='notebook']", filter: {text: "<notebook-name>"}, fields: ["text", "html"], tabId: <ID>)`
        - *Alternative*: You can also directly use `find-element(mode: "text", query: "<notebook-name>")` to precisely locate the element.
     3. Parse the output to find the `data-id` for the desired notebook.
     4. Click the specific notebook using its `data-id`:
        - Action: `click-element(selector: '.ytlm-choice[data-id="<extracted-data-id>"]', tabId: <ID>)`

## Community Post Extraction
To extract the body and comments from a YouTube community post:

1. **Prerequisite: Scroll & Expand**:
   - YouTube comments are lazy-loaded. Scroll down to trigger rendering.
   - Action: `scroll-page(distance: 1, unit: "screens", tabId: <ID>)`
   - If a "More" (展开) button is present in the post body, click it first:
   - Action: `click-element(selector: "#more", tabId: <ID>)` (or `textContent: "展开"`)

2. **Extract Post Body**:
   - The most precise selector for the post body text is: `ytd-backstage-post-thread-renderer #content #content-text`
   - Action: `get-tab-markdown-content(cssSelector: "ytd-backstage-post-thread-renderer #content #content-text", tabId: <ID>)`
   - *Note: Using `get-tab-markdown-content` is preferred to ensure full content extraction without the truncation limits of other tools.*

3. **Extract Clean Comments**:
   - To get a clean list of comment texts without metadata (likes, timestamps, avatars):
   - Selector: `ytd-comment-view-model #content-text`
   - Action: `get-tab-markdown-content(cssSelector: "ytd-comment-view-model #content-text", matchAll: true, useDefuddle: false, tabId: <ID>)`
   - *Note: `useDefuddle: false` is required to prevent filtering of YouTube's custom comment tags.*

4. **Unified Text Extraction**:
   - To get all text content (post body + all comments) in one go:
   - Selector: `#content-text`
   - Action: `get-tab-markdown-content(cssSelector: "#content-text", matchAll: true, tabId: <ID>)`

