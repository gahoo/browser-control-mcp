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

1. **Focus**: ALWAYS run `switch-to-tab(tabId)` before processing.
2. **Value Assessment (Abstract Audit)**:
   - **Action**: Extract abstract using `get-tab-markdown-content`.
   - **Autonomous Categorization**: AI analyzes the abstract to determine the paper's significance and relevance based on the research field and core contribution.
   - **Decision Branch**:
     - **High Value (AI Determined)**:
       - **Action**: Proceed **AUTOMATICALLY** to full archival without waiting for user confirmation.
       - **Steps**:
         1. **Full-Text Navigation**: Navigate to the **Full Text** HTML view (e.g., append `.full-text` for bioRxiv).
         2. **Deep Analysis**: Perform logic mapping and methodology audit.
         3. **Full Archival**: Populate the complete **`Paper.md`** template.
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
     2. **Drafting**: Use the instructions from the activated skill to design flowcharts or sequence diagrams. Use Chinese labels for all nodes and edges.
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

## 3. Storage Standards
- **Obsidian**: `Library/Papers/{{Title}}.md`
- **Zotero**: Entry must contain Meta-data + PDF Attachment + Markdown Full-text Attachment + Comprehensive Reading Note.

## 4. Cleanup
- Close the tab immediately after archival is complete.
- **Critical**: Use `run_shell_command("rm <temp_dir>/{{url_basename}}_fulltext.md")` to delete the temporary markdown file.
