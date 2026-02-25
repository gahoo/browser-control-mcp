# GitHub Archival Standards (Value-Oriented & Theme-Based)

## 1. Grouping Logic (Always Theme-Based)
- **Deduplication**: Scan all `github.com` tabs first. Close any duplicate URLs, retaining only the one with the smallest `id`.
- **Primary Grouping**: Identify the primary **Topic** (Theme) of the repository (e.g., `Machine Learning`, `API Framework`, `System Tool`).
- **Sub-grouping (Threshold: 30)**: If a single theme group contains more than **30 tabs**, subdivide it further based on **Sub-themes** (e.g., `Machine Learning` -> `Inference`, `Training`, `Datasets`).
- **Evaluation Table**: Before archival, present a table: `Project | Stars | Theme | Value Point | Recommendation`.

## 2. Extraction Strategy (Markdown-First)
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
- **Path**: `Library/GitHub/{{Owner}}-{{RepoName}}.md`.
- **Policy**: Lean archival. NO full-text archival (`original_content`). 
- **Overwrite**: Always overwrite existing files with the latest analysis.
