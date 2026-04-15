# Academic Paper Archival (Zotero & Obsidian Dual-Sync)

This guide defines the specialized workflow for classifying, assessing, and archiving scholarly research papers into both **Obsidian** and **Zotero** with high-fidelity PDF storage.

## 1. Domain Classification
Categorize papers dynamically based on their primary **Scientific Field**.
**Crucial Rule**: Propose the most accurate domain for each paper (e.g., **AI**, **Bioinformatics**, **Genomics**, **Neuroscience**) and obtain user approval before finalizing.
- **Preprint**: bioRxiv, medRxiv, arXiv.org.
- **Journal Article**: Nature, Cell, Science, OUP, BMC.
- **Custom Domain**: (e.g., `Proteomics`, `Synthetic-Biology`) - **Propose if more accurate.**

### 🔄 Template Evolution Rule
When a paper belongs to a **new field** not currently covered by the detailed deep-dive section in `Paper.md`:
1.  **Draft Update**: Propose a new sub-section for `Paper.md` (Methodology/Evidence) tailored to that field's specific "hard questions".
2.  **User Approval**: Submit the template modification plan to the user.
3.  **Update & Archive**: ONLY after the template is updated and approved, proceed to save the paper note using the new template structure.

## 2. Archival Workflow
Follow these steps strictly for each scholarly tab:

1. **Focus & Pre-processing**: 
   - ALWAYS run `switch-to-tab(tabId)` before processing.
   - **PDF Redirection (Mandatory)**: If the current URL ends in **`.pdf`**, you MUST use the **`navigate-url`** tool to redirect the tab to the corresponding HTML abstract or full-text page before proceeding. content extraction tools (like `get-tab-markdown-content`) are NOT supported on raw PDF preview pages.
2. **Value Assessment (Abstract Audit)**:
   - **Adaptive Extraction**: The Evaluator Agent MUST adjust its strategy based on the page context:
     - **Abstract/Summary Page**: Use `get-tab-markdown-content` (no `cssSelector`).
     - **Full-Text Page**: MUST use `cssSelector: ".abstract"` to surgically extract the summary for initial evaluation.
   - **Decision Branch**:
     - **High Value (AI Determined)**:
       - **Action**: Proceed **AUTOMATICALLY** to full archival.
       - **Efficiency Rule**: If the Evaluator is already on a Full-Text page and identifies **High Value**, it should perform the full `dump` immediately. The presence of this dump file informs the main agent to proceed directly to the Archival stage.
       - **Steps (if not already dumped)**:
         1. **Full-Text Navigation**: Navigate to the **Full Text** HTML view (e.g., append `.full-text` for bioRxiv).
         2. **Full-Text Extraction**: Use `get-tab-markdown-content` with `dump`.
         3. **Deep Analysis**: Perform logic mapping and methodology audit using the dumped file.
         4. **Full Archival**: Populate the complete **`Paper.md`** template.
            - **Rigor Mandate**: The AI MUST NOT output brief gists or shallow summaries. Every single field and placeholder in the template must be populated with **extreme depth, exhaustive detail, and critical analytical rigor**, acting as a senior peer reviewer. If the original text is complex, break it down step-by-step.
            - **Storage**: Save to Obsidian + Zotero.
     - **Low Value / Marginal (AI Determined)**:
       - **Action**: Present a brief (1-2 sentence) summary to the user and ask for a decision.
       - **User Choice**: "AI categorized this as **Low Value**. Would you like to (1) **Close directly**, (2) **Archive Abstract-only** (saves metadata + abstract), or (3) **Upgrade to Full Archival**?"
       - **Processing**: Execute the chosen path. Abstract-only archival uses a simplified version of the template.

3. **PDF Discovery (Optimized)**: 
   - **Primary Method**: Use `find-element` with CSS selector to minimize noise.
     - **Mode**: `css`
     - **Query**: `a[href*='pdf']`
   - **Fallback**: If CSS fails, search for download text.
     - **Mode**: `regexp`
     - **Query**: `PDF`
4. **Dual-Archival (High Value only)**:
   - **Extraction & Local Cache**: Navigate to **Full Text** HTML and use `get-tab-markdown-content` with `dump: "<temp_dir>/{{url_basename}}_fulltext.md"`. 
     - *Purpose*: This temporary local file serves as your high-fidelity source of truth. You must use `read_file` on this temp file (using start/end lines if needed) to iteratively extract deep technical nuances for the note, ensuring no detail is missed.
   - **Logic Mapping (Complex Papers)**:
     1. **Skill Activation**: You **MUST** call `activate_skill(name: "mermaid-visualizer")` before drafting any diagram. This ensures the output follows professional aesthetic standards and avoids common syntax pitfalls.
     2. **Drafting**: Use the instructions from the activated skill to design flowcharts or sequence diagrams. 
        - **MANDATORY**: All node text within Mermaid diagrams MUST be enclosed in double quotes (e.g., `A["节点文本"]`) to prevent syntax errors.
        - **Language**: Use Chinese labels for all nodes and edges.
     2. **Incremental Verification (File-Based - MANDATORY)**:
        - **Stage**: Save the Mermaid code to a temporary file: `write_file(path: "<tmp_dir>/{{url_basename}}_diag.mmd", content: "...")`.
        - **Audit**: Run `run_shell_command("mermaid-check <tmp_dir>/{{url_basename}}_diag.mmd")`.
        - **Refine**: If exit code is 1, analyze the error, use **`replace`** or **`write_file`** to fix specific lines in `<tmp_dir>/{{url_basename}}_diag.mmd`, and re-audit.
        - **Loop**: Repeat until `mermaid-check` returns exit code 0.
     3. **Integration**: Read the final content of `<tmp_dir>/{{url_basename}}_diag.mmd` and embed it into the `Core Idea` section of the template.
     4. **Cleanup**: Delete `<tmp_dir>/{{url_basename}}_diag.mmd`.
   - **Content Creation**: Populate the **`Paper.md`** template. 
     - **Requirement for Depth**: You must strictly follow the "Rigor Mandate". Expand every section to clearly articulate *how* data flows, *why* certain methods were chosen, and provide a brutally honest evaluation in the critique sections. Rely heavily on the `{{url_basename}}_fulltext.md` file to fetch exact details.
   - **Obsidian Sync**: Use **`create-obsidian-note`** to save the full Markdown note to `Library/Papers/`.
   - **Zotero Sync**: Use **`save-url-to-zotero`**:
     - `downloadMethod: "browser"`: **MANDATORY** to fetch the actual PDF.
     - `attachmentUrls`: 
       - PDF Attachment: `{ url: "...", type: "file" }`
       - Full-text Markdown Attachment: `{ url: "file://{{url_basename}}_fulltext.md", type: "file", title: "Full Text (Markdown)" }`
     - `notes`: Generate a highly detailed HTML note **in Chinese**. It MUST NOT be a brief summary. It MUST include the following structured sections extracted from your deep analysis:
       1. **核心洞察 (Core Insight)**: Breakthrough, positioning, and verdict.
       2. **核心贡献与创新 (Contributions & Innovation)**: Theoretical and engineering innovations.
       3. **核心思路 (Core Idea)**: Detailed step-by-step logical reconstruction.
       4. **本文局限性 (Limitations)**: Critical evaluation of weaknesses and boundaries.
4. **Cleanup**: Close the tab after both Obsidian and Zotero confirmations.

### 2.3 Distributed Execution & Audit (The "Three Powers" Architecture)
When processing in **Distributed Mode (Option B/D)**, the following sub-agent roles MUST be used:

1. **The Archivist (Maker)**:
   - **Contract**: Load and strictly follow `Delegation-Archivist.md`.
   - **Task**: Perform content extraction, drafting, and dual-sync (Zotero & Obsidian).
   - **Engagement**: MUST perform the Interactive Q&A (Phase 4 of protocol) before handover.

2. **The Verifier (Auditor)**:
   - **Contract**: Load and strictly follow `Delegation-Verifier.md`.
   - **Task**: Perform a non-destructive physical audit of the Archivist's output.
   - **Output**: Report a structured JSON indicating PASS/FAIL.

3. **The Orchestrator (Main Agent)**:
   - Evaluates the Verifier's report and dispatches a **Remediator** for specific FAIL items.

### 2.4 Fallback: Direct PDF Archival (No HTML Version)
If a paper lacks an experimental HTML view (e.g., bioRxiv conversion failure or arXiv PDF-only), follow this high-fidelity fallback path:

1.  **Download PDF**: Use `fetch-url` to download the PDF to `.gemini/tmp/{id}.pdf`.
2.  **Size Check**: Verify that the file size is **under 5MB** to ensure context safety.
3.  **Direct Read**: Use the `read_file` tool to read the physical PDF file. This allows the sub-agent to analyze the full text even without a Markdown dump.
4.  **Zotero Archival**: 
    - Sync metadata using `save-url-to-zotero`.
    - **MANDATORY**: Attach the **local PDF file** using the triple-slash absolute path (`file:///Users/gahoolee/.../tmp/{id}.pdf`).
5.  **Obsidian Archival**: Generate the note based on the PDF content following the `Paper.md` template.

## 3. Storage Standards
- **Obsidian**: `Library/Papers/{{Title}}.md`
  - **Naming Rule**: The filename MUST be the paper's full title. Any colons (`:`) in the title MUST be replaced with a middle dot (`·`) (e.g., "Title: Subtitle" -> "Title · Subtitle.md").
- **Zotero**: Entry must contain Meta-data + PDF Attachment + Markdown Full-text Attachment + Comprehensive Reading Note.

## 4. Cleanup
- Close the tab immediately after archival is complete.
- **Critical**: Use `run_shell_command("rm <temp_dir>/{{url_basename}}_fulltext.md")` to delete the temporary markdown file.
