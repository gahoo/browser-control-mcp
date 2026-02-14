# WeChat Archival Best Practices (mp.weixin.qq.com)

## 1. Mandatory Pre-Extraction: Image Activation
WeChat images use lazy-loading (`data-src`). To ensure archival captures real images:
- **Action**: ALWAYS run `execute-script` BEFORE extraction.
- **Script**:
  ```javascript
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    const realSrc = img.getAttribute('data-src');
    if (realSrc) img.setAttribute('src', realSrc);
  });
  ```

## 2. Extraction Precision
- **Selector**: Typically `#js_content`. For cleaner layouts, use `#js_content > section`.
- **Footer Removal**: Analyze the structure via `find-element` first. Use `mask` with `section:nth-of-type(n+X)` (where X is the index of the first irrelevant section like Author Bio, Ads, or Related Posts) to strip unnecessary tail information.
- **Layout**: Set `useDefuddle: false` for high-fidelity archival to preserve original nesting.

## 4. Archiving Strategies

### A. Summary Mode (Low to Medium Value)
- **Objective**: Capture the gist of news or brief updates.
- **Action**: Use `get-tab-markdown-content` and save a concise summary to Obsidian.

### B. Zero-Loss Archival Mode (High Value)
- **Objective**: Save long-form technical blogs, architecture deep-dives, or tutorials with 100% integrity.
- **Tool**: Use `create-obsidian-note` with `directExtractOptions`, which is the same with `get-tab-markdown-content`. If failed, come up with a workaround with user approval.
- **Integrity Check**: ALWAYS present the final sentence of the extracted text to the user for confirmation before saving.

### C. Library & Media Database Standards (Books/Movies)
- **Objective**: Create a comprehensive "Work Profile" for resources identified in listicles.
- **Key Fields**:
  - **Background**: Origin, creation year, platform status (e.g., "BBC Classic", "9.5 on Douban").
  - **Creators**: Author/Director names and notable anecdotes (e.g., "inspiration from a mole hole").
  - **Core Value**: Specific utility (e.g., "Logic training", "English immersion").
  - **Highlights**: Key characters or unique visual styles.
- **Supplementation**: If original text is sparse, supplement with factual knowledge (year, score) but **DO NOT fabricate**.
- **Media Integrity**: 
  - Put the resource's first image URL in the `cover` property AND display it in the body.
  - **Fallback**: If standard extraction fails to find images (e.g., in swiper/gallery posts), try extracting from selector `.share_content_page`.
- **Metadata**: Always include `age` (target age group) in frontmatter for movie/educational entries.

## 3. Unified Error Detection (RegExp Mode)
ONLY perform this check if extraction fails or content is suspiciously empty:
- **Action**: Use `find-element` with `mode: "regexp"`, `fields: ["text"]`, and query `^(该内容已被发布者删除|该公众号已迁移)$`.
- **Logic**:
  - **Match "该内容已被发布者删除"**: Mark as dead and recommend closing.
  - **Match "该公众号已迁移"**: Locate and click the **"访问文章"** button to redirect, then restart the activation process.
  - **Note**: Only execute actions if the returned `text` is an **exact match** to avoid false positives.

## 4. **Save to Obsidian**: 
- Use `create-obsidian-note`.
  - **Storage**: Save to the `Clippings/` directory (e.g., `filename: "Clippings/Note Title.md"`).