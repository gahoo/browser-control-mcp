# Oxford Academic (academic.oup.com)

This guide defines the specific access detection, element selectors, and macro mappings for Oxford Academic (OUP) journals (e.g., Bioinformatics, NAR).

## 1. Access & Content Detection
OUP journals use a hybrid model. Accurate detection is required to optimize extraction.

### 1.1 Detection Logic
Identify the current tab's access level using:
- **FULL_TEXT Indicators**:
  - **PDF Button**: Presence of `.article-pdf-link`, `.download-pdf`, or links containing `/article-pdf/`.
  - **Structural Content**: Standard sections (Introduction, Results, Methods) present in the `innerText`.
- **ABSTRACT_ONLY Indicators**:
  - **Purchase/Login Block**: Presence of `.purchase-reg-box`, `.purchase-article`, or `.at-article-purchase-options`.

## 2. Element Selectors
- **Abstract**: `.abstract`, `#abstract`, or `section[data-sb-object-type="abstract"]`.
- **Main Body**: `main`, `.article-fulltext`, or `.widget-instance-ArticleFulltext`.

## 3. Archival Workflow
Strictly follow the [Academic Paper Archival](../academic-papers.md) "Three Powers" Architecture.

### 3.1 Operator-Extractor Stage (Macro-Driven)
- **Phase 1: Probe & Capture (Abstract/Access)**
  - **Macro**: `scripts/oup-abstract-extractor.macro.yaml`
  - **Objective**: Determine `access_level` and dump the abstract.
- **Phase 2: Extract (Full-text Dump - If FULL_TEXT)**
  - **Macro**: `scripts/oup-fulltext-extractor.macro.yaml`
  - **Objective**: Capture full content using decoupled extraction.

### 3.2 Architect-Archivist Stage
1. **Contract**: Load **`references/templates/Delegation-Archivist.md`**.
2. **Setup**: Activate `browser-tab-organizer`, `obsidian-markdown`, `mermaid-visualizer`, `obsidian-cli`.
3. **Zotero Standards**: 
   - `publicationTitle`: Extract from title (e.g., "Bioinformatics").
   - Attachments: High-fidelity PDF + Local MD dump.

### 3.3 Verifier Stage
1. **Contract**: Load **`references/templates/Delegation-Verifier.md`**.
2. **Mandate**: Use `obsidian search/open/read` and check for empty images.

## 4. Cleanup
- Close tab only after Verifier reports **PASS**.
