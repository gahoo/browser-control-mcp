# Group: Papers

This guide defines the workflow for processing academic literature and research papers within the "Papers" tab group.

## Processing Workflow

### 1. Analysis & Summarization
- **Action**: Launch a subagent (or use browser tools) to read the full text of the paper.
- **Goal**: Generate a structured summary of the key points, methodology, and findings.
- **Value Assessment**: Judge the paper's significance and relevance to current projects.

### 2. User Review
- **Action**: Present the summary and value assessment to the user.
- **Decision**: Wait for explicit user confirmation before proceeding to archive.

### 3. Archiving (Zotero)
- **Condition**: Only if the user deems the paper "Highly Valuable".
- **Tool**: Use the `zotero-connector` tool.
- **Actions**:
    1. Add the paper to the local Zotero library.
    2. Save the key points/summary as a Zotero note attached to the item.

### 4. Cleanup
- **Action**: Close the tab only after successful Zotero archival.
