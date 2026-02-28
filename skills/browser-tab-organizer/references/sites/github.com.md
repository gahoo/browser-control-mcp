# GitHub Archival Standards (Value-Oriented & Theme-Based)

## 1. Grouping & Planning Logic
- **Deduplication**: Scan all `github.com` tabs first. Close any duplicate URLs, retaining only the one with the smallest `id`.
- **Primary Grouping**: Identify the primary **Topic** (Theme) of the repository (e.g., `Machine Learning`, `API Framework`, `System Tool`).
- **Sub-grouping (Threshold: 30)**: If a single theme group contains more than **30 tabs**, subdivide it further based on **Sub-themes**.
- **Clustering Archival Planning**: For each group, the agent MUST perform a clustering analysis to group similar projects (e.g., Audio tools, Gemini tools, Tutorials) into batches before processing. 
- **Category Consistency**: All projects within the same cluster MUST use the same value for the `category` field in the archival template to ensure organized aggregation in Obsidian Bases.
- **Evaluation Table**: Before archival, present a table: `Project | Stars | Theme | Value Point | Recommendation`.

## 2. Extraction Strategy (Context-Rich Analysis)
- **Repository-First Policy**: If the current tab is a sub-page (e.g., `blob`, `tree`, `issues`), the agent MUST first navigate to the main repository root to fetch the `README.md` and overall context before combining it with sub-page specific findings for archival.
- **Visual Asset Selection (Priority Order)**:
    1. `og:image` meta tag (standard GitHub social preview).
    2. Logo or banner found in `README.md` (check `assets/logo.png`, `docs/banner.jpg`, etc.).
    3. Repository owner's avatar (fallback).
- **Primary Source**: `get-tab-markdown-content(cssSelector: "main")`.
- **Logic**: All qualitative data (Positioning, Architecture, Pros/Cons) must be analyzed from the markdown flow. 
- **Selective Fallback**: Use `find-element` for the following ONLY if the markdown-to-metadata parser fails:
    - **Identity**: `a[href*="LICENSE"]` (License), `a[href$="/graphs/contributors"] .Counter` (Contributors).
    - **Stats**: `#repo-stars-counter-star` (Stars), `#repo-network-counter` (Forks).
    - **Language**: `span[itemprop="programmingLanguage"]`.

## 3. Analysis Dimensions (Content Mapping)
- **Project Positioning**: Identify the **Target Audience** (e.g., "For frontend developers", "For data scientists").
- **Tech Stack & Architecture**: 
    - **Core Stack**: Main languages and frameworks.
    - **Dependencies**: Critical external libraries.
    - **Working Principle**: Briefly summarize how it works (the "How").
- **Pros & Cons**:
    - **Advantages**: Unique selling points or strengths.
    - **Limitations**: Known constraints or trade-offs.

## 4. Storage & Integrity
- **Tool**: Use `create-obsidian-note`.
- **Template**: **`references/templates/GitHub.md`** (Structured metadata + Callouts).
- **Path**: `Library/GitHub/{{Owner}} · {{RepoName}}.md`.
- **Book-like Projects**: Only repositories that are strictly books (physical or online-only e-books) or primary reading materials should trigger a dual archival.
    1. Create a GitHub archival note.
    2. Create a book note in `Library/Books/{{RepoName}}.md` using **`references/templates/Book.md`**.
    3. Apps, Frameworks, and Tools MUST NOT be archived as books.
- **Prompt Collections**: Repositories focused on gathering prompts (e.g., `GPTs`, `gpt4o-image-prompts`) should be categorized as `type: "Prompt Collection"`. Do NOT create book notes for them.
- **Successor Detection**: If the repository is marked as `deprecated`, `retired`, or explicitly mentions a successor project:
    1. Open the successor's link.
    2. Perform a full archival for BOTH the original and the successor.
    3. Add mutual backlinks using the `🔄 继任者信息` section in the original note.
- **Policy**: Lean archival. NO full-text archival (`original_content`). 
- **Overwrite**: Always overwrite existing files with the latest analysis.
