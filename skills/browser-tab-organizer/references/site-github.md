# Site: GitHub (github.com)

## Selectors
- **Repo Title**: `strong[itemprop="name"] a`
- **About Description**: `.f4 .color-fg-muted` (Sidebar description)

## Workflow: Organization

### 1. Grouping
- **Action**: Always move GitHub tabs to the **"GitHub"** group.

### 2. Analysis & Summarization
- If requested to "summarize" or "extract info":
  - **Quick Info**: Read the Repo Title and About Description.
  - **Detailed Summary**:
    - **Tool**: Use `get-tab-markdown-content`.
    - **Parameters**: Set `cssSelector: "article.markdown-body"` to extract only the README content.
    - **Outcome**: Process the returned Markdown to provide a concise project overview (purpose, features, installation).
