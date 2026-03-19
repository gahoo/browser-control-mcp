# bioRxiv (biorxiv.org)

This guide defines the specific URL construction and extraction logic for bioRxiv preprints.

## 1. Domain Classification
Categorize papers dynamically based on their primary **Scientific Field**.
**Crucial Rule**: Propose the most accurate domain (e.g., **Bioinformatics**, **Genomics**, **Neuroscience**, **Cell Biology**) and obtain user approval before finalizing.
- **Bioinformatics**: Software, computational tools, models.
- **Genomics / Transcriptomics**: Genome-wide studies, single-cell analysis.
- **Neuroscience**: Brain studies.
- **Cell Biology**: Cellular research.
- **AI-Foundations**: (e.g., OmniNA) - **Propose if more accurate.**
- **Tags**: Use clear field names (e.g., `Bioinformatics`).

## 2. URL Construction (Crucial)
bioRxiv URLs follow deterministic patterns for different views:
- **Abstract (Base)**: `https://www.biorxiv.org/content/10.1101/{doi_suffix}`
- **Full Text (HTML)**: Append **`.full-text`** to the base URL (e.g., `.../2024.01.14.575543v1.full-text`).
- **Full PDF**: Append **`.full.pdf`** to the base URL (e.g., `.../2024.01.14.575543v1.full.pdf`).

**Rule for Suffix Handling**: 
When constructing a new URL from the current tab URL:
1.  Strip any existing suffix (like `.full`, `.full-text`, `.abstract`) from the DOI path.
2.  Append the target suffix (`.full-text` for HTML extraction or `.full.pdf` for Zotero attachment).

## 3. Archival Workflow
Follow the [Academic Paper Archival](academic-papers.md) workflow, but with these specific enhancements:

1. **Focus**: `switch-to-tab(tabId)`.
2. **Version Control (Auto-Update)**: 
   - **Action**: Use `find-element(mode: "css", query: "a", filter: { text: "View current version of this article" })` to check for newer versions.
   - **Automation**: If a match is found, click the link (`click-element`) to navigate to the most recent version of the article before proceeding with archival.
3. **Full-Text Navigation**:
   - **Requirement**: For full-text archival in Obsidian, ensure you are on the page ending in **`.full-text`**. 
   - **Action**: If the current URL is the base/abstract URL, append `.full-text` and navigate, or click the "Full Text" tab on the page.
4. **Extraction**: Use `get-tab-markdown-content` for the content.
5. **Zotero Save**:
   - Use `save-url-to-zotero`.
   - **attachmentUrls**: 
     - URL: Ensure it ends in **`.full.pdf`** (stripping `.full-text` if present before appending).
     - Type: `file`.
   - **downloadMethod**: `browser`.
4. **Metadata**: Ensure `itemType: "preprint"` and `publicationTitle: "bioRxiv"`.

## 4. Cleanup
- Close the tab immediately after Zotero confirms `uploaded: 1`.
