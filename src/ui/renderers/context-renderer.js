export function renderContextBadge(els, info, formatK) {
  els.contextBadge.textContent = `${info.nonSystem}/${info.limit} · ${formatK(info.tokens)}`;
}

function messageContentText(content) {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part?.type === "text") return part.text || "";
      if (part?.type === "image_url") return "[图片]";
      return "";
    }).filter(Boolean).join("\n");
  }
  return String(content || "");
}

export function renderContextPanel(els, info, settings, escapeHtml, formatK) {
  els.contextStats.innerHTML = [
    `上下文 ${info.nonSystem}/${info.limit} 条`,
    `估算 ${formatK(info.tokens)} token`,
    `模型 ${settings.model || "未设置"}`,
    `温度 ${Number(settings.temperature).toFixed(2)}`,
  ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  els.contextPreview.textContent = info.messages.map((message, index) => {
    return `#${index + 1} ${message.role}\n${messageContentText(message.content)}`;
  }).join("\n\n---\n\n") || "本次没有可发送上下文。";
}
