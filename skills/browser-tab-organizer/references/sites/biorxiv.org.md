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
Follow the [Academic Paper Archival](academic-papers.md) workflow.

### 3.1 Operator-Extractor Stage
Choose the appropriate method based on the execution mode:

- **Method A: Macro-driven (Recommended for Option D)**
  - **Action**: Use `execute-macro` with `definitionFile: "scripts/biorxiv-standard-extractor.macro.yaml"`.
  - **Inputs**: Pass `tabId` and `savePath` (e.g., `<tmp_dir>/{{url_basename}}_fulltext.md`).
- **Method B: Manual Steps (Primary for Modes A/B/C or Fallback)**
  1. **Focus**: `switch-to-tab(tabId)`.
  2. **Version Control**: `click-element` for "View current version of this article" (if exists) -> MUST poll `is-tab-loaded`.
  3. **Full-Text Navigation**:
     - **Primary**: `click-element` for "Full Text" -> MUST poll `is-tab-loaded`.
     - **Fallback**: URL Construction (append `.full-text`) -> `execute-script`.
  4. **Image Activation**: `execute-script` to sync `data-src` to `src`.
  5. **Extraction**: Use `get-tab-markdown-content` with `dump`.

### 3.2 Architect-Archivist Stage
1. **Analyze**: Use `read_file` on the local source.
2. **Dual-Sync**: 
   - **Zotero**: Use `save-url-to-zotero`. Attach `.full.pdf` and the **local Markdown file** (type: `file`). Set `itemType: "preprint"`, `publicationTitle: "bioRxiv"`.
   - **Obsidian**: Follow `Paper.md` template rules.

## 4. Cleanup
- Close the tab immediately after Zotero confirms `uploaded: 1`.
