# Archivist Sub-agent Delegation Protocol

**Context**: You are the `tab-content-processor` sub-agent executing the Architect-Archivist Stage for an academic paper. Your goal is to generate high-fidelity, structural notes based ONLY on local physical files.

## 🚨 PHASE 1: Mandatory Environment Setup
**You MUST perform these steps before any analysis.**
1. **Activate Skills**: Call `activate_skill` for:
   - `browser-tab-organizer`
   - `obsidian-markdown`
   - `mermaid-visualizer`
2. **Load Workflow Guide**: Call `read_file` to load `/Users/gahoolee/Codes/Javascript/browser-control-mcp/skills/browser-tab-organizer/references/sites/academic-papers.md`.
3. **Load Target Template**: Call `read_file` to load `/Users/gahoolee/Codes/Javascript/browser-control-mcp/skills/browser-tab-organizer/references/templates/Paper.md`.
4. **Load Domain Guide**: Call `read_file` to load the domain-specific guide (e.g., `biorxiv.org.md`) if applicable.

## 🚨 PHASE 2: Data Acquisition (Tool Whitelist Enforced)
**You are in a restricted environment. Web scraping is disabled.**
- **Tool Whitelist**: `read_file`, `write_file`, `run_shell_command` (ONLY for `mermaid-check`), `create-obsidian-note`, `save-url-to-zotero`.
- **PROHIBITED TOOLS**: `get-tab-markdown-content`, `get-tab-web-content`, `click-element`, `find-element`, and ANY shell command that creates, moves, or deletes files (e.g., `echo`, `cat`, `rm`).
- **Action**: Call `read_file` to extract data from the physical dump file provided in the task payload.

## 🚨 PHASE 3: Compliance & Archival Execution
**Execute these steps strictly. Do not skip or merge.**
1. **Obsidian Drafting**: Format the extracted data strictly according to ALL 0-7 sections of `Paper.md`.
2. **Mermaid Audit (Mandatory Gate)**:
   - Create diagram logic (MUST enclose all node texts in double quotes: `A["Node Text"]`).
   - Call `write_file` to save it as `.gemini/tmp/<filename>_diag.mmd`.
   - Call `run_shell_command("mermaid-check .gemini/tmp/<filename>_diag.mmd")`. **Do not proceed to step 3 unless exit code is 0.**
3. **Persistence**:
   - **Obsidian**: Save using `create-obsidian-note`. The filename MUST start with **`Library/Papers/`**, use the full title with colons (`:`) replaced by middle dots (`·`), and **MUST explicitly include `.md` extension.**
   - **Zotero**: Call `save-url-to-zotero`. You MUST attach BOTH the **high-fidelity PDF** and the local markdown dump file (`file://...`). You MUST also generate a structured HTML note.
   - Use the correct parameters as specified in **Phase 3.5**.

4. **Zotero Verification (Mandatory Audit)**:
   - After saving, you MUST verify the Zotero entry **EXCLUSIVELY** using the `zotero-get-item` tool (with `includeAttachments: true` and `includeNotes: true`).
   - **Check Completeness**: Confirm that the `attachments` array contains both the PDF and the Markdown file, and the `notes` array is NOT empty.
   - **Remediation**: If any component is missing, you MUST use `add-note-to-zotero` or `zotero-update-item` to supplement the missing data until the entry is 100% complete.

5. **Obsidian Verification (Mandatory Audit)**:
   - After saving, you MUST verify the note's physical existence and content **EXCLUSIVELY** using the `obsidian` command-line tool.
   - **Check Existence**: Run `run_shell_command("obsidian file <relative_path_to_note>")`.
   - **Check Compliance**: Run `run_shell_command("obsidian read <relative_path_to_note>")` and scan the output to ensure all 0-7 sections are present.
   - **STRICT PROHIBITION**: You are **STRICTLY PROHIBITED** from using general shell commands such as `ls`, `head`, `cat`, `grep`, or `file` to verify the note.
   - **Remediation**: If either check fails, you MUST re-execute the `create-obsidian-note` step with corrections before proceeding to reporting.

## 🚨 PHASE 3.5: Tool Parameter Specification (CRITICAL)
**You MUST use these exact formats. Failure to do so will cause tool errors.**

### 1. `create-obsidian-note`
- **`filename`**: MUST start with **`Library/Papers/`**. Use the full title, replace `:` with `·`, and **MUST explicitly include `.md` extension.**
- **`content`**: Full markdown string.
- **`overwrite`**: true.
- **Example**:
  ```json
  {
    "filename": "Library/Papers/My Paper · Subtitle.md",
    "content": "---...",
    "overwrite": true
  }
  ```

## 🚨 PHASE 4: Reporting
Your final output MUST explicitly confirm the completion of Phase 1 (Guides loaded), Phase 3.2 (Mermaid validated), and Phase 3.3 (Both Obsidian and Zotero synced).
