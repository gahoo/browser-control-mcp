# BioMed Central (biomedcentral.com) & Springer Link

This guide defines the access detection, element selectors, and macro mappings for BMC series journals and Springer Link hosted articles.

## 1. Access & Content Detection
BMC journals are typically Full Open Access. However, proxy/institutional redirects to Springer Link may occur.

### 1.1 Detection Logic
Identify the current tab's access level using:
- **FULL_TEXT Indicators**:
  - **PDF Button**: Presence of `.c-pdf-download`, `.js-pdf-download`, or `a[data-test="pdf-link"]`.
  - **Structural Content**: Standard sections (Introduction, Results, Methods) in `innerText`.
- **ABSTRACT_ONLY Indicators**:
  - **Paywall**: Presence of purchase buttons or "Access Options" typical of non-OA Springer journals.

## 2. Element Selectors
- **Abstract**: `#Abs1-content`, `.c-article-section__content`, or `.abstract-content`.
- **Main Body**: `main`, `article`, or `#main-content`.
- **References (to Mask)**: `.c-article-references`, `#Bib1-section`.

## 3. Archival Workflow
Strictly follow the [Academic Paper Archival](../academic-papers.md) "Three Powers" Architecture.

### 3.1 Operator-Extractor Stage (Macro-Driven)
- **Phase 1: Probe & Capture (Abstract/Access)**
  - **Macro**: `scripts/bmc-abstract-extractor.macro.yaml`
  - **Objective**: Determine `access_level` and return abstract in-session.
- **Phase 2: Extract (Full-text Dump - If FULL_TEXT)**
  - **Macro**: `scripts/bmc-fulltext-extractor.macro.yaml`
  - **Objective**: Activate images and dump full content.

### 3.2 Architect-Archivist Stage
- **Contract**: Load **`references/templates/Delegation-Archivist.md`**.
- **Task**: Deep analyze, generate Mermaid, dual-sync.
- **Zotero**: Extract `publicationTitle` (e.g., "Genome Biology").

### 3.3 Verifier Stage
- **Contract**: Load **`references/templates/Delegation-Verifier.md`**.
- **Mandate**: Use `obsidian search/open/read`.

## 4. Cleanup
- Close tab only after Verifier reports **PASS**.
