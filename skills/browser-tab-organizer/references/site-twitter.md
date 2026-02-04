# Site: Twitter / X (x.com / twitter.com)

## Selectors
- **Tweet Text**: `div[data-testid="tweetText"]`
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
