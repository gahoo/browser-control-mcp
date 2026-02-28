---
name: browser-tab-organizer
description: Organize browser tabs, classify Twitter/X content, and automate saving of cloud drive resources (Quark). Use when the user needs to clean up or categorize many open tabs, or extract and save resources from posts.
---

# Browser Tab Organizer

This skill automates the classification, grouping, and resource saving of browser tabs.

## Core Workflow

### 1. Discovery & Grouping
- **Scan**: 
  - List all open tabs (`get-list-of-open-tabs`) for broad overview.
  - **Scoped Scan**: If restricted by specific sites, titles, or group IDs, ALWAYS use `query-open-tabs` with filtering parameters for better efficiency.
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

- **Content Archival Strategy**:
  - **Extraction Priority**: 
    1. ALWAYS prioritize `get-tab-markdown-content` for structured content.
    2. If it fails (e.g., connection lost), AVOID using `get-tab-web-content`. 
    3. Instead, perform a **Stability Retry**: `reload-browser-tab`, wait for load, re-run pre-actions (like Image Activation), and retry `get-tab-markdown-content`. Use `find-element` to target the main container if needed.
  - **Archiving Modes**:
    1. **Summary Mode (Standard)**: Restore the original logic structure and key findings. Reconstruct the article's flow (headings, core arguments). Avoid brief gists.
    2. **Composite Mode (Full-Text)**: Used for long-form deep-dives. 
       - **Phase 1**: Create note with metadata and logic-restored summary.
       - **Phase 2**: Use `create-obsidian-note` with `directExtractOptions` and `append: true` to attach lossless text under `# 📜 原文存档`. **Rule**: Match the extraction parameters (selectors, `useDefuddle`) from Phase 1 to ensure consistency.
    3. **Actionable Guide Mode (Tutorials/Prompts)**: For technical guides. Extract Prerequisites, Core Workflow, Code/Prompt Templates, and Key Parameters. Skip narrative filler.
  - **Metadata & Links**: ALWAYS identify and record links to original research papers (e.g., arXiv, DOI links) in the note's frontmatter or a dedicated `# 🔗 资源链接` section.
  - **Target Domains**: Highly effective for **WeChat (mp.weixin.qq.com)**, **X Articles**, and technical blogs.

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
  - **Deduplication**: Automatically close duplicate `github.com` URLs (keep smallest ID).
  - **Theme-Based Grouping**: Categorize tabs into groups based on their primary **Topic**.
    - **Sub-grouping (Threshold: 30)**: If a single topic group exceeds **30 tabs**, further subdivide based on **Sub-topics**.
  - **Pre-Archival Evaluation**: For each group, generate a summary table:
    - **Project** | **Stars/Status** | **Core Value** | **Recommendation**
    - Identify "Zombie Projects" (Low stars + inactive) for immediate closure.
  - **Markdown-First Archival**: 
    - Use `get-tab-markdown-content(cssSelector: "main")` to extract Metadata, Positioning (Target Audience), Architecture (Stack/Logic), and Pros/Cons.
    - **Fallback**: Only use specific selectors for Stats/License if not parsed from markdown.
  - **Lean Archival**: Do NOT archive the full text. Focus on the project's utility and suitability.
  - **Template**: ALWAYS use **`references/templates/GitHub.md`** for structured metadata, engineering evaluation (Scores 1-5), and architecture analysis.
  - **Storage**: Use `create-obsidian-note` to save in **`Library/GitHub/{{Owner}} · {{RepoName}}.md`**. Overwrite existing files.

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
