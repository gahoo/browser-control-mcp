---
name: browser-tab-organizer
description: Organize browser tabs, classify Twitter/X content, and automate saving of cloud drive resources (Quark). Use when the user needs to clean up or categorize many open tabs, or extract and save resources from posts.
---

# Browser Tab Organizer

This skill automates the classification, grouping, and resource saving of browser tabs.

## Core Workflow

### 1. Discovery & Grouping
- **Scan**: List all open tabs (`get-list-of-open-tabs`).
- **Grouping**: Categorize tabs into groups based on domain (Quark, GitHub, Twitter, WeChat, etc.).
- **Deduplication**: Close duplicate URLs (keep smallest ID).

### 2. Group-Level Value Assessment
- **Analyze**: Within each group or sub-category, review titles and brief context.
- **Recommend**: For sub-groups with many tabs, present a summary table with:
    - **Value Level**: High / Medium / Low.
    - **Value Point**: Key utility or unique information.
    - **Recommended Action**: Full Archival, Summary, or Close.
- **Filter**: Present high-value candidates to the user. **CLOSE** low-value or redundant tabs only after confirmation.

### 3. Domain-Specific Processing
Iterate through the filtered tabs:

- **Library & Media Archival (Books/Movies)**:
  - **Objective**: Create individual high-fidelity notes for resources found in listicles.
  - **Templates**: Reference [Book.md](references/templates/Book.md) and [Movie.md](references/templates/Movie.md).
  - **Workflow**:
    1. **Pre-action**: ALWAYS run Image Activation (sync `data-src` to `src`) via `execute-script`.
    2. **Extract Metadata**: Identify Title, Author/Category, Intro (comprehensive "Work Profile"), Cover URL, and Download Links.
    3. **Image Integrity**: Put the resource's first image URL in the `cover` property AND display it in the body.
    4. **Note Creation**:
       - Books: Save to `Library/Books/` named as `Author-Title.md`.
       - Movies/Anime: Save to `Library/Movies/` named as `Title.md`.
    5. **Deduplication**: Only merge information if a duplicate is detected within the current **conversation context**.
  - **Database**: Views are automatically updated in `Library/书库.base` and `Library/影音库.base`.

- **Full-Text Archival (General Strategy)**:
  - **When to use**: Only when the objective is to save the **entire original text** without LLM summarization or compression.
  - **Tool**: Use `create-obsidian-note` with `directExtractOptions`.
  - **Rule**: ALWAYS mirror the parameters (selectors, `useDefuddle`, `maxLength`) used in successful `get-tab-markdown-content` calls to ensure visual and structural consistency.
  - **Target Domains**: Especially effective for **WeChat (mp.weixin.qq.com)**, **X Articles**, and deep-dive technical blogs.

- **WeChat (mp.weixin.qq.com)**: Load [mp.weixin.qq.com.md](references/sites/mp.weixin.qq.com.md).
  - **Classify**: Categorize into **Tech** (Tutorials, architecture deep-dives) or **Resources** (Tool lists, curated links).
  - **Process**: Follow the reference guide to choose between **Summary**, **Full-Text Archival**, or **Library Standards**.
  - **Error Detection**: Detect deleted or migrated articles then close tab or click "访问文章" button.

- **Twitter/X**: Load [x.com.md](references/sites/x.com.md).
  - Classify into News, Tech, or Resources.
  - For Resources: Extract drive links and open them.

- **Quark Drive**: Load [quark.cn.md](references/sites/quark.cn.md).
  - Refresh -> Check if it's a Book -> Auto-save -> Verify -> Close.
  - Skip video/large collections.

- **GitHub**: Load [github.com.md](references/sites/github.com.md).
  - Move to "GitHub" group.
  - Use `get-tab-markdown-content` for summaries.

### 4. Post-Group Reflection & Optimization (Conditional)
- **Review**: After finishing a group, evaluate if the process encountered redundant steps, selector failures, new patterns, or significant obstacles.
- **Synthesize**: Formulate a more efficient path or workaround (e.g., new selectors, automated routing).
- **Consult**: **ONLY** if a significant optimization is identified, present the findings to the user and ask for confirmation to update the Skill.
- **Principle of Minimum Change**: When updating the Skill, apply only the most critical or significant changes. Avoid modifications where the meaning remains substantially the same or the impact is negligible.

### 5. Final Cleanup
- Re-verify tab groups. Close source tabs once resources are extracted.

## Utilities
- **Tab Domain Statistics**: Use [tab-stats.md](references/utils/tab-stats.md).

## Usage Commands
- "Organize my tabs" -> Starts the full scan and grouping.
- "Save all books from Quark" -> Triggers the site-quark workflow.
- "Extract links from these tweets" -> Triggers the site-twitter link extraction.
