import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 5177);
const maxJsonBytes = 2 * 1024 * 1024;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
};

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxJsonBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeOpenAIUrl(baseUrl) {
  const trimmed = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = new URL(trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Base URL must start with http:// or https://");
  }
  return url;
}

function normalizeOpenAIModelsUrl(baseUrl) {
  let trimmed = String(baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  trimmed = trimmed.replace(/\/chat\/completions$/, "").replace(/\/models$/, "");
  const url = new URL(`${trimmed}/models`);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Base URL must start with http:// or https://");
  }
  return url;
}

async function handleOpenAIChat(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed" } });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const endpoint = normalizeOpenAIUrl(payload.baseUrl);
    const apiKey = String(payload.apiKey || "").trim();
    const model = String(payload.model || "").trim();
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const temperature = Number(payload.temperature);
    const maxTokens = Number(payload.max_tokens);
    const stream = Boolean(payload.stream);
    const minimal = Boolean(payload.minimal);

    if (!apiKey) throw new Error("API Key is required");
    if (!model) throw new Error("Model is required");
    if (!messages.length) throw new Error("Messages are required");

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(!minimal && Number.isFinite(temperature) ? { temperature } : {}),
        ...(!minimal && Number.isFinite(maxTokens) && maxTokens > 0 ? { max_tokens: Math.round(maxTokens) } : {}),
        ...(stream ? { stream: true } : {}),
      }),
    });

    if (stream && upstream.body) {
      res.writeHead(upstream.status, {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      for await (const chunk of upstream.body) {
        res.write(chunk);
      }
      res.end();
      return;
    }

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 502, { error: { message: error.message || "OpenAI-compatible request failed" } });
  }
}

async function handleOpenAIModels(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: { message: "Method not allowed" } });
    return;
  }

  try {
    const payload = await readJsonBody(req);
    const endpoint = normalizeOpenAIModelsUrl(payload.baseUrl);
    const apiKey = String(payload.apiKey || "").trim();
    if (!apiKey) throw new Error("API Key is required");

    const upstream = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 502, { error: { message: error.message || "OpenAI-compatible models request failed" } });
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/openai-chat") {
    await handleOpenAIChat(req, res);
    return;
  }
  if (url.pathname === "/api/openai-models") {
    await handleOpenAIModels(req, res);
    return;
  }

  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (!path) path = "index.html";
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}`);
});
