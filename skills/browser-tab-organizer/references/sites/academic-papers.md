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
   - **Decision**:
     - **High Value**: Proceed to full archival.
     - **Low Value**: Close the tab directly.
3. **Dual-Archival (High Value only)**:
   - **Extraction**: Navigate to **Full Text** HTML and extract content.
   - **Content Creation**: Populate the **`Paper.md`** template with detailed methodology, results, and critical analysis.
   - **Obsidian Sync**: Use **`create-obsidian-note`** to save the full Markdown note to `Library/Papers/`.
   - **Zotero Sync**: Use **`save-url-to-zotero`**:
     - `downloadMethod: "browser"`: **MANDATORY** to fetch the actual PDF.
     - `attachmentUrls`: Type `file`.
     - `notes`: Include the Markdown body (the tool will handle HTML conversion).
4. **Cleanup**: Close the tab after both Obsidian and Zotero confirmations.

## 3. Storage Standards
- **Obsidian**: `Library/Papers/{{Title}}.md`
- **Zotero**: Entry must contain Meta-data + PDF Attachment (File) + Comprehensive Reading Note.

## 4. Cleanup
- Close the tab immediately after archival is complete.
