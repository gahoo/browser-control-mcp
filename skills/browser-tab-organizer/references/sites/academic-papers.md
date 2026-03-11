# Academic Paper Archival (Zotero & AI Summary)

This guide defines the specialized workflow for classifying, summarizing, and archiving scholarly research papers from major domains (arXiv, Nature, bioRxiv, etc.) into **Zotero** with high-fidelity PDF storage.

## 1. Domain Classification
Categorize papers dynamically based on their primary **Scientific Field**.
**Crucial Rule**: The list below is not exhaustive. Propose the most accurate domain for each paper (e.g., **AI**, **Bioinformatics**, **Genomics**, **Neuroscience**) and obtain user approval before finalizing.
- **Preprint**: bioRxiv, medRxiv, arXiv.org.
- **Journal Article**: Nature, Cell, Science, OUP, BMC.
- **Academic Publisher**: Nature Portfolio, Oxford Academic.
- **Custom Domain**: (e.g., #proteomics, #synthetic-biology) - **Propose if more accurate.**

## 2. Archival Workflow
Follow these steps strictly for each scholarly tab:

1. **Focus**: ALWAYS run `switch-to-tab(tabId)` before processing to ensure active session (Cookies).
2. **Extraction & Summary**: 
   - Use `get-tab-markdown-content` to extract the abstract or full text.
   - **Gemini Summary**: Generate a 3-4 point HTML summary highlighting:
     - **Key Breakthroughs** (核心突破)
     - **Core Metrics** (关键指标/实验结论)
     - **Research Impact** (研究意义)
     - **Resource Links** (相关资源/GitHub)
3. **Zotero High-Fidelity Sync**:
   - **Tool**: Use **`save-url-to-zotero`**.
   - **Crucial Parameters**:
     - `downloadMethod: "browser"`: **MANDATORY!** Uses current browser context to fetch PDF, ensuring a real file is stored instead of just a link.
     - `attachmentUrls`: Specify `type: "file"` to force file attachment.
     - `notes`: Attach the generated HTML summary.
     - `tags`: Add domain-specific tags (e.g., `#bioinformatics`, `#genomics`).
4. **Stability Retry**: If extraction or saving fails, execute `reload-browser-tab` -> `is-tab-loaded` -> Retry.

## 3. Storage Standards
- **Zotero Library**: Entry must contain Meta-data + PDF Attachment (Stored) + Gemini Summary Note.
- **Note**: Ensure the PDF is not just a link but a downloaded file.

## 4. Cleanup
- Close the tab immediately after `save-url-to-zotero` returns `uploaded: 1`.
