# Defuddle 集成实现计划

## 目标

将 Defuddle 库集成到 browser-control-mcp 项目中，实现对 LLM 更友好的网页内容提取功能，并参考 Obsidian Clipper 的 markdown-converter.ts 实现更好的 Markdown 转换效果。

## 功能概述

### 1. 新增 MCP Tool: `get-tab-readable-content`

一个专门用于获取网页"可读内容"的工具，返回：
- **cleanedHtml**: 清理后的干净 HTML（移除噪音元素）
- **markdown**: 高质量的 Markdown 格式内容
- **metadata**: 结构化元数据（标题、作者、描述、发布日期等）
- **statistics**: 统计信息（字数、解析时间等）

### 2. 增强的 Markdown 转换器

参考 Obsidian Clipper 实现以下功能：
- **表格处理**: 支持简单表格转 Markdown，复杂表格(colspan/rowspan)保留 HTML
- **数学公式**: 支持 MathML、MathJax、KaTeX 转换为 LaTeX
- **代码块**: 语言识别和格式化
- **图片和 Figure**: 支持 srcset、figcaption 处理
- **嵌入内容**: YouTube、Twitter 等嵌入的标准化处理
- **列表**: 正确的缩进和嵌套处理
- **引用/Callout**: GitHub 风格的 markdown-alert 转换
- **脚注**: 标准 Markdown 脚注格式
- **删除线和高亮**: 标准 Markdown 语法

## 技术实现

### Phase 1: 依赖安装和基础设施

1. **安装依赖**
   ```bash
   # firefox-extension
   cd firefox-extension
   npm install defuddle turndown mathml-to-latex
   npm install -D @types/turndown
   ```

2. **创建 Markdown 转换器模块**
   - 路径: `firefox-extension/utils/markdown-converter.ts`
   - 包含 Turndown 配置和所有自定义规则

### Phase 2: Firefox Extension 修改

1. **新增消息类型**（common/server-messages.ts）
   ```typescript
   export interface GetTabReadableContentServerMessage extends ServerMessageBase {
     cmd: "get-tab-readable-content";
     tabId: number;
     options?: {
       includeMarkdown?: boolean;  // 是否返回 Markdown（默认 true）
       includeHtml?: boolean;      // 是否返回清理后的 HTML（默认 false）
       maxLength?: number;         // 最大字符数限制
     };
   }
   ```

2. **新增响应类型**（common/extension-messages.ts）
   ```typescript
   export interface ReadableContentExtensionMessage extends ExtensionMessageBase {
     resource: "readable-content";
     tabId: number;
     content: {
       markdown: string;
       cleanedHtml?: string;
       metadata: {
         title: string;
         author?: string;
         description?: string;
         publishedDate?: string;
         domain: string;
         url: string;
         siteName?: string;
         schemaOrgData?: any;
       };
       statistics: {
         wordCount: number;
         parseTimeMs: number;
         originalLength: number;
         contentLength: number;
       };
     };
     isTruncated: boolean;
   }
   ```

3. **Message Handler 实现**（firefox-extension/message-handler.ts）
   - 新增 `sendReadableContent` 方法
   - 使用 Defuddle 提取内容
   - 使用自定义 Markdown 转换器

### Phase 3: MCP Server 修改

1. **新增 Tool 定义**（mcp-server/server.ts）
   ```typescript
   mcpServer.tool(
     "get-tab-readable-content",
     `Get clean, LLM-friendly content from a webpage. Returns structured markdown 
      with metadata (author, date, etc). Better for reading articles compared to 
      get-tab-web-content which returns raw text.`,
     {
       tabId: z.number().describe("Tab ID to extract content from"),
       includeMarkdown: z.boolean().default(true).describe("Include Markdown content"),
       includeHtml: z.boolean().default(false).describe("Include cleaned HTML"),
       maxLength: z.number().optional().describe("Maximum content length (default: 100000)"),
     },
     async ({ tabId, includeMarkdown, includeHtml, maxLength }) => {
       // Implementation
     }
   );
   ```

2. **Browser API 扩展**（mcp-server/browser-api.ts）
   - 新增 `getReadableContent` 方法

### Phase 4: Markdown 转换器详细实现

```typescript
// firefox-extension/utils/markdown-converter.ts

import TurndownService from 'turndown';
import { MathMLToLaTeX } from 'mathml-to-latex';

export interface MarkdownConverterOptions {
  baseUrl: string;
}

export function createMarkdownConverter(options: MarkdownConverterOptions): TurndownService {
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    preformattedCode: true,
  });

  // 规则 1: 表格处理
  turndownService.addRule('table', { /* ... */ });
  
  // 规则 2: 数学公式 (MathML, MathJax, KaTeX)
  turndownService.addRule('MathJax', { /* ... */ });
  turndownService.addRule('math', { /* ... */ });
  turndownService.addRule('katex', { /* ... */ });
  
  // 规则 3: 代码块
  turndownService.addRule('preformattedCode', { /* ... */ });
  
  // 规则 4: 图片和 Figure
  turndownService.addRule('figure', { /* ... */ });
  
  // 规则 5: 嵌入内容 (YouTube, Twitter)
  turndownService.addRule('embedToMarkdown', { /* ... */ });
  
  // 规则 6: 列表
  turndownService.addRule('list', { /* ... */ });
  turndownService.addRule('listItem', { /* ... */ });
  
  // 规则 7: 高亮和删除线
  turndownService.addRule('highlight', { /* ... */ });
  turndownService.addRule('strikethrough', { /* ... */ });
  
  // 规则 8: 引用/Callout
  turndownService.addRule('callout', { /* ... */ });
  
  // 规则 9: 脚注
  turndownService.addRule('citations', { /* ... */ });
  turndownService.addRule('footnotesList', { /* ... */ });
  
  // 移除不需要的元素
  turndownService.remove(['style', 'script', 'button']);
  turndownService.keep(['iframe', 'video', 'audio', 'sup', 'sub', 'svg', 'math']);

  return turndownService;
}

export function convertToMarkdown(html: string, baseUrl: string): string {
  const turndownService = createMarkdownConverter({ baseUrl });
  
  // 处理 URL（相对路径转绝对路径）
  const processedHtml = processUrls(html, new URL(baseUrl));
  
  let markdown = turndownService.turndown(processedHtml);
  
  // 后处理
  markdown = postProcessMarkdown(markdown);
  
  return markdown;
}

function postProcessMarkdown(markdown: string): string {
  // 移除空链接
  markdown = markdown.replace(/\n*(?<!!)\[\]\([^)]+\)\n*/g, '');
  // 规范化换行
  markdown = markdown.replace(/\n{3,}/g, '\n\n');
  return markdown.trim();
}

function processUrls(html: string, baseUrl: URL): string {
  // 将相对 URL 转换为绝对 URL
  // ...
  return html;
}
```

## 文件变更清单

| 文件 | 操作 | 描述 |
|------|------|------|
| `firefox-extension/package.json` | 修改 | 添加 defuddle, turndown, mathml-to-latex 依赖 |
| `firefox-extension/utils/markdown-converter.ts` | 新建 | Markdown 转换器模块 |
| `firefox-extension/utils/url-processor.ts` | 新建 | URL 处理工具 |
| `common/server-messages.ts` | 修改 | 添加 GetTabReadableContentServerMessage |
| `common/extension-messages.ts` | 修改 | 添加 ReadableContentExtensionMessage |
| `firefox-extension/message-handler.ts` | 修改 | 添加 sendReadableContent 方法 |
| `firefox-extension/extension-config.ts` | 修改 | 添加新命令到权限配置 |
| `mcp-server/server.ts` | 修改 | 添加 get-tab-readable-content tool |
| `mcp-server/browser-api.ts` | 修改 | 添加 getReadableContent 方法 |

## 测试计划

1. **单元测试**
   - Markdown 转换器各规则测试
   - URL 处理测试

2. **集成测试**
   - 各类网页内容提取测试
   - 复杂页面（表格、数学公式、代码）测试

3. **手动测试**
   - 新闻文章
   - 技术博客
   - Wikipedia
   - 学术论文页面（ArXiv）

## 预期输出示例

```json
{
  "content": {
    "markdown": "# Article Title\n\n**Author:** John Doe | **Published:** January 15, 2026\n\nThis is the article content with **proper formatting**...\n\n## Section 1\n\nSome text with math: $E = mc^2$\n\n| Column 1 | Column 2 |\n|----------|----------|\n| Data 1   | Data 2   |",
    "metadata": {
      "title": "Article Title",
      "author": "John Doe",
      "description": "Article description",
      "publishedDate": "2026-01-15",
      "domain": "example.com",
      "url": "https://example.com/article",
      "siteName": "Example Site"
    },
    "statistics": {
      "wordCount": 1234,
      "parseTimeMs": 45,
      "originalLength": 50000,
      "contentLength": 8000
    }
  }
}
```

## 实施顺序

1. ✅ 创建实现计划
2. ⬜ 安装依赖到 firefox-extension
3. ⬜ 创建 markdown-converter.ts
4. ⬜ 创建 url-processor.ts
5. ⬜ 更新 common/server-messages.ts
6. ⬜ 更新 common/extension-messages.ts
7. ⬜ 更新 firefox-extension/message-handler.ts
8. ⬜ 更新 firefox-extension/extension-config.ts
9. ⬜ 更新 mcp-server/browser-api.ts
10. ⬜ 更新 mcp-server/server.ts
11. ⬜ 测试和调试
