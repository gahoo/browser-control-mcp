# Site: Twitter / X (x.com / twitter.com)

## Pre-processing & Redirection
- **MediaViewer Handling**: Before processing any Twitter tab, check if the URL contains `/mediaViewer`. If found, redirect the tab to the original status page (e.g., `https://x.com/user/status/12345`) to ensure full context and thread visibility.

## Selectors
- **Standard Tweet Text**: `div[data-testid="tweetText"]`
- **Clean Text (No Metadata)**: `article div[data-testid="tweetText"]`
  - *Usage*: Use when author, date, and other metadata are NOT needed.
  - *Efficient Thread Capture*: Use with `matchAll: true` to efficiently capture the main tweet AND all visible replies (often containing direct links or further details) in a single call.
- **High Readability Composite**: `[data-testid="tweetPhoto"], [data-testid="tweetText"], [data-testid^="card.wrapper"]`
  - *Status*: **Best for clean knowledge notes.** An enhanced version of "Clean Text" that includes images and link cards while filtering out UI noise.
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

## Resource Discovery & Enrichment
- **Top-Down Priority**: Core value is usually at the top. Perform initial extraction first.
- **Advanced Thread Scraper (Anchor-Jump)**:
    - **Extraction Selector**: Use `[data-testid="tweet"]` to capture text, links, and cards.
    - **Anchor Selector**: Use `div[data-testid="cellInnerDiv"]:last-of-type` to jump to the current end of the rendered list.
    - **Workflow**:
        1. Perform initial extraction.
        2. If logically incomplete, `scroll-page` to the **Anchor Selector**.
        3. **MANDATORY**: After jumping, check for and click all `显示更多` (Show More) buttons (`button[data-testid="tweet-text-show-more-link"]`).
        4. Re-extract and merge.
    - **Smart Termination**: STOP scrolling once the promised items (e.g., "10 papers", "the list follows") are captured. Do not waste tokens on unrelated comments.
- **Deep Search (Enrichment)**: If a tool/topic is high-value but the post has very little text (e.g., image-only):
    1. Inform the user that information is sparse.
    2. **ASK FOR PERMISSION** before using `google_web_search` to enrich the note.
- **Resource Routing**:
    - **Drive Links (Quark/Baidu)**: Open in their respective browser tab groups.
    - **Direct Resources (PDF/Epub/etc.)**: 
        1. **SKIP** opening a browser tab.
        2. Identify the resource title from the tweet (Must be **highly descriptive** and meaningful).
        3. Use `fetch-url` with a descriptive `savePath` (e.g., `savePath: "/Volumes/RamDisk/Full_Book_Title_Author.pdf"`) to download immediately.

## Video & Media Handling
### 1. Video Extraction Workflow
- **Interceptor**: Use `install-media-interceptor` with `autoReload: true` to reliably capture the source URL.
- **Domain Migration**: ALWAYS replace `video.twimg.com` and `pbs.twimg.com` with `twimg.42bio.info`.
- **HTML Formatting**:
  ```html
  <video controls>
      <source src="https://twimg.42bio.info/..." type="video/mp4" />
  </video>
  ```
- **Spacing**: In Markdown, ensure there is exactly **one empty line** between the text content and the `<video>` element.

### 2. Video Deep Dive Workflow (For High-Value Videos)
If a video requires deep analysis (e.g., lectures, talks):
1. **Acquire Link**: Use the **Video Extraction Workflow** above to get the `twimg.42bio.info` URL.
2. **Download**: Use `run_shell_command` with `wget` to download the video to a temp path (e.g., `/Volumes/RamDisk/video.mp4`).
3. **Transcribe (WhisperX)**:
   - **Crucial**: Unset proxies first (`http_proxy="" https_proxy=""`).
   - **Command**: 
     - Chinese: `lang=zh model=XA9/Belle-faster-whisper-large-v3-zh-punct whisperx <file>`
     - English: `lang=en model=large-v3 whisperx <file>`
4. **Summarize**: Read the generated `.srt` file (use `cat` if outside workspace) and summarize key insights.
5. **Preservation**: Save as an Obsidian note. Video notes are exempt from strict 'Key Takeaways/Summary' structures; direct synthesized summaries are preferred.

## Image Handling
- **Domain Migration**: Replace all `pbs.twimg.com` domains with `twimg.42bio.info` for stability.
- **Format**: Use clean Markdown `![图像](url)`.
- **Cleanup**: Remove outer links around images (e.g., `[![](img)](link)`) to keep the archive clean.

## Workflow: Classification & Extraction

### 1. Classification (Taxonomy)
Analyze the tweet text and grouped links to categorize the tab. 
> [!TIP] Dynamic Re-evaluation
> Even if a tab is already grouped (e.g., in "Social/News"), if its content is identified as a tutorial, tool list, or technical guide, move it to **"Tech & Tools"** immediately.

- **Category: Resources (Downloads)**
  - **Keywords**: *PDF, Drive, Pan, Download, 资源, 网盘, 夸克, 阿里云, 提取码*
  - **Action**: Extract links -> Open in new tabs -> Move original tweet to "Downloads" group (or close if link extracted successfully).

- **Category: Tech & Tools**
  - **Keywords**: *AI, LLM, Code, Tutorial, Python, Rust, Framework, Library, 教程, 源码*
  - **Action**: Group into "Tech & Tools".

- **Category: Academic**
  - **Keywords**: *Paper, Journal, Research, Bioinformatics, Dataset, Visualization Toolkit, 论文, 学术, 生信*
  - **Action**: 
    1. Extract original literature/paper links.
    2. **Link Discovery Priority**:
       - Priority 1: Use `get-tab-markdown-content` with the **High Readability Composite** selector on the full thread.
       - Priority 2: Use `get-clickable-elements` as fallback.
    3. **Open & Group**: Open found paper links in the **"Papers"** tab group.
    4. **Archival**: ASK the user if they would like to save the tweet's context/summary as an Obsidian note.
    5. Group original tweet into "Academic".

- **Category: Social / News**
  - **Keywords**: *Breaking, News, Politics, Economy, Market, 突发, 新闻, 经济, 视频*
  - **Action**: 
    1. Group into "Social/News".
    2. **Sharing (Pastebin)**: If sharing is required:
       - Extract text via `get-tab-markdown-content`.
       - Extract video via the **Video Workflow** below.
       - Use `save-to-pastebin` for each tweet (include original URL + text + empty line + `<video>`).
       - **Master Indexing**: After batch processing, you MUST create a final Pastebin note indexing and categorizing all shared links.

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
        2.  **Standard/Threads**: Use **High Readability Composite** (`[data-testid="tweetPhoto"], [data-testid="tweetText"], [data-testid^="card.wrapper"]`) + `matchAll: true` to capture core content without UI noise.
        3.  **Fallback**: Use `article div[data-testid="tweetText"]` or `article[data-testid="tweet"]` if the composite selector fails or more metadata is needed.
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
