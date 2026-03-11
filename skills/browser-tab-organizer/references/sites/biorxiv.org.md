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

## 2. PDF URL Construction (Crucial)
bioRxiv PDF links follow a deterministic pattern:
- **Base URL**: `https://www.biorxiv.org/content/10.1101/{doi_suffix}`
- **Full PDF URL**: `https://www.biorxiv.org/content/10.1101/{doi_suffix}.full.pdf`
- **Rule**: ALWAYS append **`.full.pdf`** to the base URL (e.g., `10.1101/2024.01.14.575543v1.full.pdf`).

## 3. Archival Workflow
Follow the [Academic Paper Archival](academic-papers.md) workflow, but with these specific enhancements:

1. **Focus**: `switch-to-tab(tabId)`.
2. **Extraction**: Use `get-tab-markdown-content` for the abstract.
3. **Zotero Save**:
   - Use `save-url-to-zotero`.
   - **attachmentUrls**: 
     - URL: Append `.full.pdf` to the current page URL.
     - Type: `file`.
   - **downloadMethod**: `browser`.
4. **Metadata**: Ensure `itemType: "preprint"` and `publicationTitle: "bioRxiv"`.

## 4. Cleanup
- Close the tab immediately after Zotero confirms `uploaded: 1`.
