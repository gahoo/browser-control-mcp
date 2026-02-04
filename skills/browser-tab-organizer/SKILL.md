---
name: browser-tab-organizer
description: Organize browser tabs, classify Twitter/X content, and automate saving of cloud drive resources (Quark). Use when the user needs to clean up or categorize many open tabs, or extract and save resources from posts.
---

# Browser Tab Organizer

This skill automates the classification, grouping, and resource saving of browser tabs.

## Core Workflow

### 1. Discovery & Grouping
- **Scan**: List all open tabs (`get-list-of-open-tabs`).
- **Initial Categorization**:
  - **Quark**: Tabs matching `pan.quark.cn`.
  - **GitHub**: Tabs matching `github.com`.
  - **Twitter/X**: Tabs matching `x.com` or `twitter.com`.
- **Deduplication**: Identify tabs with identical URLs and **CLOSE** duplicates (keep the one with the smallest ID).

### 2. Domain-Specific Processing
Iterate through open tabs and delegate to reference guides based on the URL:

- **Twitter/X**: Load [site-twitter.md](references/site-twitter.md).
  - Classify into News, Tech, or Resources.
  - For Resources: Extract drive links and open them.
- **Quark Drive**: Load [site-quark.md](references/site-quark.md).
  - Refresh -> Check if it's a Book -> Auto-save -> Verify -> Close.
  - Skip video/large collections.
- **GitHub**: Load [site-github.md](references/site-github.md).
  - Move to "GitHub" group.
  - Use `get-tab-markdown-content` for summaries.

### 3. Final Cleanup
- Re-verify tab groups.
- Close original post tabs if resources have been successfully extracted and opened.

## Usage Commands
- "Organize my tabs" -> Starts the full scan and grouping.
- "Save all books from Quark" -> Triggers the site-quark workflow.
- "Extract links from these tweets" -> Triggers the site-twitter link extraction.