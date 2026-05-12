import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

export const ROUNDTABLE_MESSAGE_LIMIT = 80;

export function createRoundtableMessage(speakerId, speakerName, content, extra = {}) {
  return {
    id: uid("round"),
    speakerId,
    speakerName,
    content: clean(content),
    createdAt: Date.now(),
    ...extra,
  };
}

export function appendRoundtableMessage(messages, speakerId, speakerName, content, extra = {}) {
  const message = createRoundtableMessage(speakerId, speakerName, content, extra);
  const nextMessages = [...(Array.isArray(messages) ? messages : []), message].slice(-ROUNDTABLE_MESSAGE_LIMIT);
  return { messages: nextMessages, message };
}

export function findRoundtableMessage(messages, id) {
  return Array.isArray(messages) ? messages.find((message) => message.id === id) || null : null;
}

export function removeRoundtableMessage(messages, id) {
  const source = Array.isArray(messages) ? messages : [];
  const nextMessages = source.filter((message) => message.id !== id);
  return {
    messages: nextMessages,
    removed: nextMessages.length !== source.length,
  };
}

export function updateRoundtableMessageText(message, content) {
  if (!message) return null;
  message.content = clean(content);
  message.createdAt ||= Date.now();
  return message;
}

export function toggleRoundtableDecision(message, status) {
  if (!message || message.speakerId === "user") return null;
  message.decisionStatus = message.decisionStatus === status ? "" : status;
  message.decidedAt = message.decisionStatus ? Date.now() : null;
  return message;
}

export function createFailureRoundtableMessage(assistant, errorMessage) {
  return createRoundtableMessage(assistant.id, assistant.name, `请求失败：${errorMessage}`, {
    failed: true,
    errorMessage,
  });
}

export function getAdoptedRoundtableMessages(messages, limit = 12) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message.decisionStatus === "adopted" && clean(message.content))
    .slice(-limit);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripRoundtableSpeakerPrefix(content, speakerName, aliases = []) {
  let text = clean(content);
  const names = Array.from(new Set([
    speakerName,
    ...aliases,
  ].map(clean).filter(Boolean))).sort((a, b) => b.length - a.length);
  if (!names.length) return text;
  for (let index = 0; index < 3; index += 1) {
    const before = text;
    for (const name of names) {
      const pattern = new RegExp(`^\\s*${escapeRegExp(name)}\\s*[：:]\\s*`, "i");
      text = text.replace(pattern, "");
      if (text !== before) break;
    }
    if (text === before) break;
  }
  return clean(text);
}
