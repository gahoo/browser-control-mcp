# arXiv (arxiv.org)

This guide defines the specific URL patterns, element selectors, and macro mappings for arXiv.org research papers.

## 1. URL Construction & Views
arXiv maintains multiple views for each paper. Prioritize HTML for extraction.
- **Abstract View**: `https://arxiv.org/abs/{id}` (Standard metadata page).
- **HTML View (Preferred)**: `https://arxiv.org/html/{id}` (Rich structure, accessible via "HTML (experimental)" link).
- **PDF View**: `https://arxiv.org/pdf/{id}` (Direct binary). **Note**: Mandatory redirection to Abstract/HTML required via `academic-papers.md`.

## 2. Element Selectors
Use these specific selectors for surgical data extraction:
- **Abstract (HTML View)**: `#abstract`
- **Abstract (Abstract View)**: `.abstract`
- **Full Text Button**: `textContent: "HTML (experimental)"`

## 3. Archival Workflow
Follow the [Academic Paper Archival](academic-papers.md) workflow, specifically the **Distributed Execution & Audit (The "Three Powers" Architecture)** for executing tasks.

### 3.1 Operator-Extractor Stage (Macro-Driven)
- **Phase 1: Probe (Abstract/HTML Entrance)**
  - **Macro**: `scripts/arxiv-abstract-evaluator.macro.yaml`
  - **Objective**: Capture metadata and determine if high-fidelity HTML view is available.
- **Phase 2: Extract (Full-text Dump)**
  - **Macro**: `scripts/arxiv-fulltext-extractor.macro.yaml`
  - **Inputs**: `tabId`, `savePath` (e.g., `/Users/gahoolee/.../.gemini/tmp/arxiv_{id}_fulltext.md`).

### 3.2 Architect-Archivist Stage
1. **Source of Truth**: Read the dumped full-text file.
2. **Dual-Sync Standards**:
   - **Zotero**: 
     - `itemType`: "preprint"
     - `publicationTitle`: "arXiv"
     - **Mandatory Attachments**: 1. High-fidelity PDF (`https://arxiv.org/pdf/{id}`); 2. Local MD full-text dump.
   - **Obsidian**: Follow `Paper.md` (0-7 sections). Use `vault: "Obsidian"`.

## 4. Cleanup
- Close the tab immediately after Zotero confirms `uploaded: 1` and Obsidian note is physically verified.
