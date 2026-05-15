import { escapeHtml } from "./text.js";

function splitTableRow(line) {
  return String(line ?? "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isSafeUrl(url) {
  return /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(String(url ?? "").trim());
}

function renderPlainText(text, options = {}) {
  if (typeof options.renderPlainText === "function") {
    return options.renderPlainText(text, { escapeHtml });
  }
  return escapeHtml(text);
}

function renderInline(text, options = {}) {
  const source = String(text ?? "");
  const tokenPattern = /(`[^`\n]+`)|(\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\))|(\*\*\*([^*]+)\*\*\*)|(___([^_]+)___)|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\n]+)\*)|(_([^_\n]+)_)/;
  let html = "";
  let rest = source;
  while (rest) {
    const match = rest.match(tokenPattern);
    if (!match) {
      html += renderPlainText(rest, options);
      break;
    }
    const index = match.index || 0;
    if (index > 0) html += renderPlainText(rest.slice(0, index), options);
    const token = match[0];
    if (match[1]) {
      html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (match[2]) {
      const label = renderInline(match[3], options);
      const href = match[4];
      const title = match[5] ? ` title="${escapeHtml(match[5])}"` : "";
      if (isSafeUrl(href)) {
        html += `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener"${title}>${label}</a>`;
      } else {
        html += renderPlainText(token, options);
      }
    } else if (match[6] || match[8]) {
      const value = match[7] || match[9] || "";
      html += `<strong><em>${renderInline(value, options)}</em></strong>`;
    } else if (match[10] || match[12]) {
      const value = match[11] || match[13] || "";
      html += `<strong>${renderInline(value, options)}</strong>`;
    } else if (match[14] || match[16]) {
      const value = match[15] || match[17] || "";
      html += `<em>${renderInline(value, options)}</em>`;
    } else {
      html += renderPlainText(token, options);
    }
    rest = rest.slice(index + token.length);
  }
  return html;
}

function renderParagraph(text, options = {}) {
  const parts = String(text ?? "").split("\n");
  const html = parts.map((part) => renderInline(part, options)).join("<br />");
  return `<p>${html}</p>`;
}

function renderList(lines, ordered, options = {}) {
  const tag = ordered ? "ol" : "ul";
  const items = lines.map((line) => {
    const value = ordered
      ? line.replace(/^\s*\d+\.\s+/, "")
      : line.replace(/^\s*[-*+]\s+/, "");
    return `<li>${renderInline(value, options)}</li>`;
  }).join("");
  return `<${tag}>${items}</${tag}>`;
}

function renderTable(lines, options = {}) {
  const header = splitTableRow(lines[0] || "");
  const rows = lines.slice(2).map((line) => splitTableRow(line));
  const headHtml = `<tr>${header.map((cell) => `<th>${renderInline(cell, options)}</th>`).join("")}</tr>`;
  const bodyHtml = rows
    .filter((row) => row.some((cell) => cell))
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, options)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="md-table-wrap"><table><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table></div>`;
}

export function renderMarkdown(text, options = {}) {
  const source = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!source) return "";
  const lines = source.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const trimmed = raw.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      const body = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const lang = language ? ` data-language="${escapeHtml(language)}"` : "";
      blocks.push(`<pre${lang}><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const level = Math.min(6, trimmed.match(/^#+/)[0].length);
      const value = trimmed.replace(/^#{1,6}\s+/, "");
      blocks.push(`<h${level}>${renderInline(value, options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderMarkdown(quoteLines.join("\n"), options)}</blockquote>`);
      continue;
    }

    if (index + 1 < lines.length && raw.includes("|") && isTableSeparator(lines[index + 1])) {
      const tableLines = [raw, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderTable(tableLines, options));
      continue;
    }

    if (/^\s*[-*+]\s+/.test(raw)) {
      const listLines = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, false, options));
      continue;
    }

    if (/^\s*\d+\.\s+/.test(raw)) {
      const listLines = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push(renderList(listLines, true, options));
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push("<hr />");
      index += 1;
      continue;
    }

    const paragraphLines = [raw];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      const lookahead = lines[index].trim();
      if (
        /^```/.test(lookahead)
        || /^#{1,6}\s+/.test(lookahead)
        || /^>\s?/.test(lookahead)
        || /^\s*[-*+]\s+/.test(lines[index])
        || /^\s*\d+\.\s+/.test(lines[index])
        || /^(-{3,}|\*{3,}|_{3,})$/.test(lookahead)
        || (index + 1 < lines.length && lines[index].includes("|") && isTableSeparator(lines[index + 1]))
      ) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(renderParagraph(paragraphLines.join("\n"), options));
  }

  return blocks.join("");
}
