import { uid } from "../../utils/id.js";

export function createBridgeClient({ timeoutMs, callbacks, streamCallbacks, setActiveStreamRequestId }) {
  function callBridge(methodName, payload) {
    const bridge = window.AndroidBridge;
    const asyncName = `${methodName}Async`;
    if (!bridge || typeof bridge[asyncName] !== "function") return null;
    const requestId = uid("bridge");
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        callbacks.delete(requestId);
        reject(new Error("Android bridge timeout"));
      }, timeoutMs);
      callbacks.set(requestId, {
        resolve: (text) => {
          window.clearTimeout(timeout);
          callbacks.delete(requestId);
          try {
            resolve(JSON.parse(text || "{}"));
          } catch {
            reject(new Error(text || "Android bridge parse failed"));
          }
        },
      });
      bridge[asyncName](requestId, JSON.stringify(payload));
    });
  }

  function callBridgeStream(methodName, payload, onChunk) {
    const bridge = window.AndroidBridge;
    const streamName = `${methodName}StreamAsync`;
    if (!bridge || typeof bridge[streamName] !== "function") return null;
    const requestId = uid("stream");
    setActiveStreamRequestId?.(requestId);
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        streamCallbacks.delete(requestId);
        reject(new Error("Android bridge stream timeout"));
      }, timeoutMs);
      streamCallbacks.set(requestId, {
        chunk: onChunk,
        done: (metaText) => {
          window.clearTimeout(timeout);
          streamCallbacks.delete(requestId);
          let meta = {};
          try {
            meta = metaText ? JSON.parse(metaText) : {};
          } catch {
            meta = {};
          }
          resolve({ content: meta.content || "", usage: meta.usage || null });
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          streamCallbacks.delete(requestId);
          reject(error);
        },
      });
      bridge[streamName](requestId, JSON.stringify(payload));
    });
  }

  return { callBridge, callBridgeStream };
}

export function registerBridgeHooks(callbacks, streamCallbacks) {
  window.__qinglanBridgeResolve = (requestId, text) => {
    callbacks.get(requestId)?.resolve(text);
  };
  window.__qinglanBridgeStreamChunk = (requestId, text) => {
    streamCallbacks.get(requestId)?.chunk(text || "");
  };
  window.__qinglanBridgeStreamDone = (requestId, text) => {
    streamCallbacks.get(requestId)?.done(text);
  };
  window.__qinglanBridgeStreamError = (requestId, message) => {
    streamCallbacks.get(requestId)?.reject(new Error(message || "Android bridge stream failed"));
  };
}
