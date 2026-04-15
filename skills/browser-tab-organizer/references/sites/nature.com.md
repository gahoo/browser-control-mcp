# Nature (nature.com)

This guide defines the specific access detection, element selectors, and macro mappings for Nature Portfolio journals.

## 1. Access & Content Detection (Crucial)
Nature maintains a hybrid access model (Open Access vs. Subscription). Prioritize high-fidelity detection before extraction.

### 1.1 Detection Logic (The "High-Signal" Rule)
Identify the current tab's access level using these specific markers:
- **FULL_TEXT Indicators**:
  - **PDF Button**: Presence of `.c-pdf-download` or `.js-pdf-download`.
  - **Structural Content**: Presence of standard sections like `Results`, `Discussion`, or `Methods` (detectable via `innerText` or ID like `#Sec2`).
- **ABSTRACT_ONLY Indicators**:
  - **Institutional Denial**: Presence of `[data-test="access-message"]` containing "is not available".
  - **Paywall Teaser**: Presence of `.c-article-access-options`, `#access-options`, or text like "This is a preview of subscription content".

## 2. Element Selectors
Use these specific selectors for surgical data extraction:
- **Abstract Content**: `#abstract-content`, `.abstract-content`, or `.c-article-section__content`.
- **Main Body**: `main` (excludes sidebar, references, and footer).
- **Institution Message**: `[data-test="access-message"]`.

## 3. Archival Workflow
Follow the [Academic Paper Archival](../academic-papers.md) workflow, specifically the **Distributed Execution & Audit (The "Three Powers" Architecture)** for executing tasks.

### 3.1 Operator-Extractor Stage (Macro-Driven)
- **Phase 1: Probe & Capture (Abstract/Access Level)**
  - **Macro**: `scripts/nature-abstract-extractor.macro.yaml`
  - **Objective**: Determine `access_level` (`ABSTRACT_ONLY` or `FULL_TEXT`) and dump the abstract to `.gemini/tmp/nature_{id}_abstract.md`.
- **Phase 2: Extract (Full-text Dump - If FULL_TEXT)**
  - **Macro**: `scripts/nature-fulltext-extractor.macro.yaml`
  - **Objective**: Activate images (sync `data-src` to `src`) and dump the full `main` content to `.gemini/tmp/nature_{id}_fulltext.md`.

### 3.2 Architect-Archivist Stage
1.  **Contract**: Sub-agents MUST load and strictly follow **`references/templates/Delegation-Archivist.md`**.
2.  **Source of Truth**: Read the dumped markdown file (`nature_{id}_abstract.md` or `nature_{id}_fulltext.md`).
3.  **Dual-Sync Standards**:
    - **Zotero**: 
      - `itemType`: "journalArticle"
      - `publicationTitle`: Extract from tab title (e.g., "Nature Methods").
      - **Attachments**: 
        - If `FULL_TEXT`: High-fidelity PDF (via `browser` mode) + Local MD full-text dump.
        - If `ABSTRACT_ONLY`: Link to original URL + Local MD abstract dump.
    - **Obsidian**: Follow **`references/templates/Paper.md`**. Use tags based on the detected **Scientific Field**.

### 3.3 Verifier Stage (The "Audit" Power)
1.  **Contract**: A separate sub-agent MUST load and follow **`references/templates/Delegation-Verifier.md`**.
2.  **Tasks**:
    - **Integrity Check**: Ensure the Obsidian note filename follows the "Title · Subtitle.md" rule (middle dots, no colons).
    - **Asset Audit**: Verify the Zotero entry has both the PDF (if `FULL_TEXT`) and the Markdown full-text attached.
    - **Logic Audit**: Verify the Mermaid diagram (if created) uses Chinese labels and is syntax-valid.
3.  **Output**: Report a structured JSON indicating PASS/FAIL for each tab.

## 4. Cleanup
- Close the tab only AFTER the Verifier reports a **PASS**.
- Delete temporary files in `.gemini/tmp/`.
