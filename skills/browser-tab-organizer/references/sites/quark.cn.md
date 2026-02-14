# Site: Quark Cloud Drive (pan.quark.cn)

## Selectors
- **Save Button**: `.ant-btn.share-save`
  - Action: Click to save files to your own cloud drive.
- **Success Message**: `.ant-modal-body .msg-wrap .text` (Expect: "保存成功")
- **Error/Deleted Status**: 
    - Container: `div[class^="ShareError--content"]`
    - Text: `p[class^="ShareError--tips-text"]` (Keywords: "文件已被分享者删除")
- **File List/Content**: `.ant-table-body`

## Workflow: Auto-Save Resources

Follow this sequence STRICTLY for each Quark tab.

### 1. Preparation
- **Refresh**: Always reload the tab (`reload-browser-tab`) before processing to ensure the DOM is ready.
- **Wait**: Allow 2-3 seconds for rendering.

### 2. Content Check
- **Detect Deletion**: Check `p[class^="ShareError--tips-text"]`. If "文件已被分享者删除" -> **KEEP OPEN** for user awareness.
- **Inspect Files**: Use `find-element` on `.ant-table-body`.
- **Decision Logic**:
  - **Books/Docs** (Keywords: *pdf, epub, mobi, azw3, 书, 册, 传, 教程, 笔记*): **PROCEED** to Step 3.
  - **Videos/Large Files** (Keywords: *mp4, mkv, avi, 视频, 合集, 剧, 电影, 动画, Reach*): **SKIP and KEEP OPEN**.
  - **Duplicate URL**: If already processed -> **CLOSE**.

### 3. Execution (Books Only)
- **Action**: Click `.ant-btn.share-save`.
- **Verification**: Check for "保存成功" in the modal.

### 4. Cleanup
- **ONLY CLOSE** if "保存成功" is explicitly verified.
- **FAIL/SKIP/VIDEO/AUDIO/DELETED**: **MUST STAY OPEN** for manual user review.

