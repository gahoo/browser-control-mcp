# Site: Quark Cloud Drive (pan.quark.cn)

## Selectors
- **Save Button**: `.ant-btn.share-save`
  - Action: Click to save files to your own cloud drive.
- **Success Message**: `.ant-modal-body .msg-wrap .text`
  - Text Content: "保存成功"
  - Context: Appears in a modal dialog after a successful save.
- **File List/Content**: `.ant-table-body`
  - Purpose: Use to check filenames and determine resource type.
  - Text Extraction: Use `find-element` with `fields: ["text"]` to save tokens.

## Workflow: Auto-Save Resources

Follow this sequence STRICTLY for each Quark tab.

### 1. Preparation
- **Refresh**: Always reload the tab (`reload-browser-tab`) before processing to ensure the DOM is ready and buttons are active.
- **Wait**: Allow 2-3 seconds for the page to render.

### 2. Content Check
- **Inspect**: Use `find-element` on `.ant-table-body` to get the file list text.
- **Decision Logic**:
  - **Books/Docs** (Keywords: *pdf, epub, mobi, azw3, 书, 册, 传, 教程, 笔记*): **PROCEED** to Step 3.
  - **Videos/Large Files** (Keywords: *mp4, mkv, avi, 视频, 合集, 剧, 电影, 动画, Reach*): **SKIP**.
    - *Reasoning*: Videos consume too much drive space. Leave them for user manual review.
  - **Duplicate URL**: If the URL exists in another processed tab, **SKIP** and **CLOSE** immediately.

### 3. Execution (Books Only)
- **Action**: Click `.ant-btn.share-save`.
- **Verification**:
  - Check for `.ant-modal-body .msg-wrap .text`.
  - Expect text: "保存成功".
  - *Retry*: If not found immediately, retry check once after 1 second.

### 4. Cleanup
- **Success**: If "保存成功" is found -> **CLOSE** the tab (`close-browser-tabs`).
- **Skip/Fail**: If skipped or verification failed -> **KEEP** the tab open for user review.
