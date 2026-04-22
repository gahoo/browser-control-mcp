# Cell Press (cell.com)

This guide defines the access detection, element selectors, and macro mappings for Cell Press journals (e.g., Cell, Molecular Plant, Cell Reports).

## 1. Access & Content Detection
Cell journals use a strict subscription/OA hybrid model.

### 1.1 Detection Logic
Identify the current tab's access level using:
- **FULL_TEXT Indicators**:
  - **PDF Button**: Presence of `.pdf-download`, `.download-pdf`, or links containing `/pdf/`.
  - **STAR Methods**: Presence of "STAR★Methods" or "STAR Methods" in the `innerText`.
- **ABSTRACT_ONLY Indicators**:
  - **Login/Purchase**: Presence of `.article-access-options`, `.login-to-access`, or `.purchase-access`.

## 2. Element Selectors
- **Summary/Abstract**: `.article-section__abstract`, `#abstract`, or `.abstract`.
- **Main Body**: `main`, `article`, `.article-wrapper`, or `#body-content`.
- **References (to Mask)**: `.article-section__references`, `.references`, `#section-references`.

## 3. Archival Workflow
Strictly follow the [Academic Paper Archival](../academic-papers.md) "Three Powers" Architecture.

### 3.1 Operator-Extractor Stage
- **Phase 1: Probe & Capture (Abstract/Access)**
  - **Macro**: `scripts/cell-abstract-extractor.macro.yaml`
- **Phase 2: Extract (Full-text Dump)**
  - **Macro**: `scripts/cell-fulltext-extractor.macro.yaml`

### 3.2 Architect-Archivist Stage
- **Contract**: Load **`references/templates/Delegation-Archivist.md`**.
- **Special Rule**: Ensure "STAR★Methods" are analyzed for experimental validation depth.

### 3.3 Verifier Stage
- **Contract**: Load **`references/templates/Delegation-Verifier.md`**.

## 4. Cleanup
- Close tab only after Verifier reports **PASS**.
