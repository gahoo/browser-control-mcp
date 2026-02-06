# Site: Twitter / X (x.com / twitter.com)

## Selectors
- **Standard Tweet Text**: `div[data-testid="tweetText"]`
- **Clean Text (No Metadata)**: `article div[data-testid="tweetText"]`
  - *Usage*: Use when author, date, and other metadata are NOT needed.
  - *Limitation*: **Cannot** capture X Articles (Long-form content).
- **Full Post/Long Article**: `article[data-testid="tweet"]`
  - *Usage*: Capture full context including metadata. Required for X Articles.
- **Links**: `div[data-testid="tweetText"] a`
  - Purpose: Extract external URLs (e.g., pan.quark.cn, github.com).

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

1.  **Extract Content**:
    - **Standard Post (Simple)**: Use `get-tab-markdown-content` for quick insights.
    - **Clean Threads (Text-only)**: To capture thread replies without author/date noise, use:
        - `cssSelector: "article div[data-testid='tweetText']"`
        - `matchAll: true`
    - **Long-form Content / Full Context**: For X Articles or when metadata is required, use:
        - `cssSelector: "article[data-testid='tweet']"`
        - `matchAll: false` (for single article) or `true` (for full thread context)
2.  **Summarize**: Generate a structured summary.
    - **Format**: Adhere to the **`obsidian-markdown`** skill guidelines (including YAML frontmatter, tags, and callouts).
3.  **User Review**: Present the summary and metadata to the user for approval.
4.  **Save to Obsidian**: 
    - Use `create-obsidian-note`.
    - **Storage**: Save to the `Clippings/` directory (e.g., `filename: "Clippings/Note Title.md"`).
5.  **Cleanup**: **CLOSE** the tab only AFTER the user confirms the note was created successfully.
