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
- **Analyze**: Within each group, review titles and brief context.
- **Filter**: Present high-value candidates to the user. **CLOSE** low-value or redundant tabs only after confirmation.

### 3. Domain-Specific Processing
Iterate through the filtered tabs:

- **Twitter/X**: Load [site-twitter.md](references/site-twitter.md).
  - Classify into News, Tech, or Resources.
  - For Resources: Extract drive links and open them.
- **Quark Drive**: Load [site-quark.md](references/site-quark.md).
  - Refresh -> Check if it's a Book -> Auto-save -> Verify -> Close.
  - Skip video/large collections.
- **GitHub**: Load [site-github.md](references/site-github.md).
  - Move to "GitHub" group.
  - Use `get-tab-markdown-content` for summaries.

### 4. Post-Group Reflection & Optimization (Conditional)
- **Review**: After finishing a group, evaluate if the process encountered redundant steps, selector failures, new patterns, or **significant obstacles that hindered efficient organization**.
- **Synthesize**: Formulate a more efficient path or workaround (e.g., new selectors, automated routing).
- **Consult**: **ONLY** if a significant optimization is identified, present the findings to the user and ask for confirmation to update the Skill. If the process was smooth, proceed without interruption.

### 5. Final Cleanup
- Re-verify tab groups.
- Close original post tabs if resources have been successfully extracted and opened.

## Utilities
- **Tab Domain Statistics**: Use [util-tab-stats.md](references/util-tab-stats.md) to analyze tab distribution across domains.

## Usage Commands
- "Organize my tabs" -> Starts the full scan and grouping.
- "Save all books from Quark" -> Triggers the site-quark workflow.
- "Extract links from these tweets" -> Triggers the site-twitter link extraction.