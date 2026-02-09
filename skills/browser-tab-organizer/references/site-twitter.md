# Site: Twitter / X (x.com / twitter.com)

## Selectors
- **Standard Tweet Text**: `div[data-testid="tweetText"]`
- **Clean Text (No Metadata)**: `article div[data-testid="tweetText"]`
  - *Usage*: Use when author, date, and other metadata are NOT needed.
  - *Efficient Thread Capture*: Use with `matchAll: true` to efficiently capture the main tweet AND all visible replies (often containing direct links or further details) in a single call.
- **X Article (Long-form) & High Reliability**: `div[data-contents="true"] > *`
  - *Status*: **Best choice for X Articles.**
  - *Usage*: Use with `matchAll: true`. Often captures text that other selectors miss.
- **Full Context**: `article[data-testid="tweet"]`
  - *Usage*: Capture metadata + context.
- **Links**: `a[href*="t.co"]`
  - *Critical*: Twitter truncates display text (e.g., `github.com/abc...`). **Always use the actual `https://t.co/...` URL** found in the `href` or the Markdown URL parentheses.
  - *GitHub Redirection*: If the tweet's primary value is a GitHub repository:
    1. Resolve/Extract the `t.co` -> `github.com` URL.
    2. Open in **GitHub** tab group.
    3. **CLOSE** the original tweet tab.

## Image Handling
- **Domain Migration**: Replace all `pbs.twimg.com` domains with `twimg.42bio.info` for stability.
- **Format**: Use clean Markdown `![图像](url)`.
- **Cleanup**: Remove outer links around images (e.g., `[![](img)](link)`) to keep the archive clean.

## Workflow: Classification & Extraction

### 1. Classification (Taxonomy)
Analyze the tweet text and grouped links to categorize the tab:

- **Category: Resources (Downloads)**
  - **Keywords**: *PDF, Drive, Pan, Download, 资源, 网盘, 夸克, 阿里云, 提取码*
  - **Action**: Extract links -> Open in new tabs -> Move original tweet to "Downloads" group (or close if link extracted successfully).

- **Category: Tech & Tools**
  - **Keywords**: *GitHub, AI, LLM, Code, Tutorial, Python, Rust, Framework, Library, 教程, 源码*
  - **Action**: Group into "Tech & Tools".

- **Category: Social / News**
  - **Keywords**: *Breaking, News, Politics, Economy, Market, 突发, 新闻, 经济*
  - **Action**: Group into "Social/News".

### 2. Link Extraction (Resource Mode)
If classified as **Resources**:
1.  **Find Links**: Search for `pan.quark.cn` or other drive links within the tweet.
2.  **Open**: Use `open-browser-tab` to open the drive link.
3.  **Group**: Move the new drive tab to the corresponding platform group (e.g., "Quark").
4.  **Cleanup**:
    - If a drive link was found and opened: **CLOSE** the tweet tab (unless it contains other unique info).
    - If no link found but looks like a resource: **KEEP** in "Downloads" group.

### 3. Knowledge Clipping & Archiving
For high-value technical articles, opinions, or insights:

> [!important] Processing Rule
> 1. **Process ONE tab at a time.** Do NOT batch process high-value content. Wait for user confirmation before saving notes or closing tabs.
> 2. **Language Alignment**: The language of the Obsidian note (title, summary, and Key Takeaways) MUST match the primary language of the original content (e.g., Chinese tweet -> Chinese note title).

1.  **Value Assessment**:
    - **High Value**: Original technical analysis, tutorials with code, unique insights, or curated lists. -> *Proceed to Step 2.*
    - **Low Value**: Simple retweets without context, ads, or generic comments. -> *Inform user ("No significant value found") and ask to CLOSE immediately.*

2.  **Extract Content**:
    - **Primary Tool**: **MUST** use `get-tab-markdown-content` for all knowledge extraction.
    - **Selector Hierarchy & Retries**:
        1.  **X Articles**: Start with `div[data-contents="true"]` + `matchAll: true`.
        2.  **Standard/Threads**: Use `article div[data-testid="tweetText"]` + `matchAll: true` to capture main content and critical replies.
        3.  **Fallback**: Use `article[data-testid="tweet"]` if metadata or broader context is needed.
    - **Failure Recovery Protocol**:
        - **Connection Errors**: If "Tab connection lost" or "content script not loaded" occurs:
            1.  Execute `reload-browser-tab`.
            2.  Wait and verify with `is-tab-loaded`.
            3.  Retry the extraction with the same selector.
        - **Empty Content**: If the tool returns empty text but the tab is loaded:
            1.  Scroll the page slightly using `scroll-page` (e.g., `{ distance: 0.5 }`).
            2.  Wait 1-2 seconds.
            3.  Retry extraction.
        - **Persistence**: Attempt up to **3 retries** with different selectors before informing the user of a persistent failure.
    - **Expansion (On-demand)**: If the content is truncated, find and **CLICK ALL** instances of: `button[data-testid="tweet-text-show-more-link"]`.
    - **Long Articles**: For X Articles, set `maxLength: 500000` to prevent truncation.
            - **Preservation Format**:
                - **High-Value Long-form**: MUST include **Key Takeaways** (bullet points), **Summary** (1-2 sentences), and **Full Original Text (including ALL original images)**. Use `[[WikiLink]]` to connect related solutions.
                - **Standard Tweet/Thread**: **Key Takeaways** only (plus text/images). No summary needed.    
    3. **Summarize & Tag**:
        - **Format**: Adhere to `obsidian-markdown` guidelines.
        - **AI Standard Tags**: Use specific types: `LLM`, `Model`, `ASR`, `TTS`, `Multimodal`, `Agent`, `Prompt-Engineering`, `RAG`, `Skills`, `MCP`.
        - **Properties**: If applicable, add a `model_parameters` property to the YAML frontmatter (e.g., `7B`, `33B`, `1M context`).
    
    4. **Failure Recovery Protocol**:
        > [!WARNING] No Raw Web Content
        > Do NOT use `get-tab-web-content` as a fallback. It produces messy output.
    
        1. **Pre-check**: ALWAYS `switch-to-tab` to the target tab before extraction to ensure focus and script readiness.
        2. **Selector Rotation**: If the primary selector fails (empty/error), try the **Backup Selectors** listed above.
        3. **DOM Inspection**: If all standard selectors fail:
            - Use `find-element` (mode: 'css') to query generic containers (e.g., `article`, `div[data-testid="tweetText"]`).
            - Analyze the returned HTML structure to find a more specific child selector (e.g., `span[data-text="true"]` or a specific wrapper).
        4. **Final Retry**: Retry `get-tab-markdown-content` with the newly identified specific selector.
    
    5. **User Review**: Present the summary and metadata (and confirmation of full text capture) to the user for approval.
    
    6. **Save to Obsidian**: 
        - Use `create-obsidian-note`.
        - **Storage**: Save to the `Clippings/` directory (e.g., `filename: "Clippings/Note Title.md"`).
    
    7. **Cleanup**: **CLOSE** the tab only AFTER the user confirms the note was created successfully.
