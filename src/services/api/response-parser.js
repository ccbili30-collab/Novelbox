import { clean } from "../../utils/text.js";

export function parseChatResponse(data) {
  if (data?.__bridgeStatus >= 400) throw new Error(data.error?.message || "请求失败");
  const content = data?.choices?.[0]?.message?.content || data?.content || "";
  if (!content) throw new Error("模型返回为空");
  return { content, usage: data?.usage || null };
}

export function parseTextResponse(data) {
  const result = parseChatResponse(data);
  if (!clean(result.content)) throw new Error("模型返回为空");
  return clean(result.content);
}

export async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text } };
  }
}

export async function readOpenAIStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const dataText = line.slice(5).trim();
      if (!dataText || dataText === "[DONE]") continue;
      const data = JSON.parse(dataText);
      if (data.usage) usage = data.usage;
      const piece = data.choices?.[0]?.delta?.content || "";
      if (piece) {
        content += piece;
        onChunk(content);
      }
    }
  }
  if (!content) throw new Error("模型返回为空");
  return { content, usage };
}
