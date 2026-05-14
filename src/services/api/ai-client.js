import { buildChatPayload } from "./request-builder.js";
import { parseChatResponse, parseTextResponse, readOpenAIStream, safeJson } from "./response-parser.js";

export function createAiClient({ fetchImpl = fetch, getAbortSignal, bridgeClient }) {
  async function postJson(url, payload) {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: getAbortSignal?.(),
    });
    const data = await safeJson(response);
    if (!response.ok) throw new Error(data?.error?.message || `请求失败 ${response.status}`);
    return data;
  }

  async function generate({ api, settings, messages, continueMode = false, continuePrompt = "" }) {
    const finalMessages = continueMode && continuePrompt
      ? [...messages, { role: "user", content: continuePrompt }]
      : messages;
    const payload = buildChatPayload({ api, settings, messages: finalMessages, stream: false });
    const bridge = await bridgeClient.callBridge("openAIChat", payload);
    const data = bridge || await postJson("/api/openai-chat", payload);
    return parseChatResponse(data);
  }

  async function generateText({ api, settings, messages }) {
    const payload = buildChatPayload({ api, settings, messages, minimal: true });
    const bridge = await bridgeClient.callBridge("openAIChat", payload);
    const data = bridge || await postJson("/api/openai-chat", payload);
    return parseTextResponse(data);
  }

  async function generateStream({ api, settings, messages, onChunk, continueMode = false, continuePrompt = "" }) {
    const finalMessages = continueMode && continuePrompt
      ? [...messages, { role: "user", content: continuePrompt }]
      : messages;
    const payload = buildChatPayload({ api, settings, messages: finalMessages, stream: true });
    const bridgeResult = bridgeClient.callBridgeStream("openAIChat", payload, onChunk);
    if (bridgeResult) return bridgeResult;
    const response = await fetchImpl("/api/openai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: getAbortSignal?.(),
    });
    if (!response.ok) {
      const data = await safeJson(response);
      throw new Error(data?.error?.message || `请求失败 ${response.status}`);
    }
    return readOpenAIStream(response, onChunk);
  }

  async function fetchModels({ api }) {
    const payload = { baseUrl: api.baseUrl, apiKey: api.apiKey };
    const bridge = await bridgeClient.callBridge("openAIModels", payload);
    return bridge || await postJson("/api/openai-models", payload);
  }

  return { generate, generateText, generateStream, fetchModels };
}
