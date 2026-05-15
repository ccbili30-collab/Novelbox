import assert from "node:assert/strict";
import { renderMarkdown } from "../src/utils/markdown.js";

const rich = renderMarkdown(`
# 标题

**加粗**、*斜体*、\`代码\`

- 列表一
- 列表二

> 引用句

| 名称 | 作用 |
| --- | --- |
| 主创 | 主线 |

\`\`\`js
console.log("ok")
\`\`\`

[链接](https://example.com)
`);

assert.match(rich, /<h1>标题<\/h1>/);
assert.match(rich, /<strong>加粗<\/strong>/);
assert.match(rich, /<em>斜体<\/em>/);
assert.match(rich, /<code>代码<\/code>/);
assert.match(rich, /<ul><li>列表一<\/li><li>列表二<\/li><\/ul>/);
assert.match(rich, /<blockquote>/);
assert.match(rich, /<table>/);
assert.match(rich, /console\.log/);
assert.match(rich, /href="https:\/\/example\.com"/);

const mention = renderMarkdown("你好 @设定师，看看 **这里**", {
  renderPlainText(text, { escapeHtml }) {
    return escapeHtml(text).replace("@设定师", '<span class="mention">@设定师</span>');
  },
});

assert.match(mention, /<span class="mention">@设定师<\/span>/);
assert.match(mention, /<strong>这里<\/strong>/);
