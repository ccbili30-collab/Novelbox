import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

export const CREATOR_MEMORY_SCOPES = new Set(["identity", "session", "roundtable", "private"]);
export const CREATOR_MEMORY_TYPES = new Set([
  "preference",
  "setting",
  "relationship",
  "style",
  "decision",
  "warning",
  "attachment",
  "summary",
]);

function simpleHash(value) {
  let hash = 0;
  const text = clean(value);
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeScope(value) {
  const scope = clean(value);
  return CREATOR_MEMORY_SCOPES.has(scope) ? scope : "identity";
}

function normalizeType(value) {
  const type = clean(value);
  return CREATOR_MEMORY_TYPES.has(type) ? type : "summary";
}

function normalizeKeywords(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map(clean).filter(Boolean))).slice(0, 24);
  }
  return clean(value)
    .split(/[\s,，、;；|/]+/)
    .map(clean)
    .filter(Boolean)
    .slice(0, 24);
}

export function createCreatorMemoryEntry(overrides = {}, defaults = {}) {
  const now = Number(overrides.createdAt) || Number(defaults.createdAt) || Date.now();
  const text = clean(overrides.text);
  return {
    id: clean(overrides.id) || uid("memory"),
    creatorId: clean(overrides.creatorId) || clean(defaults.creatorId),
    scope: normalizeScope(overrides.scope || defaults.scope),
    sourceSessionId: clean(overrides.sourceSessionId) || clean(defaults.sourceSessionId),
    sourceRoundtableId: clean(overrides.sourceRoundtableId) || clean(defaults.sourceRoundtableId),
    sourceNodeId: clean(overrides.sourceNodeId) || clean(defaults.sourceNodeId),
    sourceRecordId: clean(overrides.sourceRecordId) || clean(defaults.sourceRecordId),
    branchPathHash: clean(overrides.branchPathHash) || clean(defaults.branchPathHash),
    type: normalizeType(overrides.type || defaults.type),
    text,
    keywords: normalizeKeywords(overrides.keywords || defaults.keywords),
    importance: Math.max(0, Math.min(10, Number(overrides.importance) || Number(defaults.importance) || 1)),
    createdAt: now,
    updatedAt: Number(overrides.updatedAt) || now,
    deletedAt: Number(overrides.deletedAt) || 0,
  };
}

export function normalizeCreatorMemoryEntry(entry = {}, defaults = {}) {
  const memory = createCreatorMemoryEntry(entry, defaults);
  return memory.text ? memory : null;
}

export function normalizeLegacyMemorySnapshot(snapshot = {}, defaults = {}) {
  const text = clean(snapshot.text || snapshot.content || snapshot.summary);
  if (!text) return null;
  const legacyId = clean(snapshot.id) || `legacy_${simpleHash(`${defaults.creatorId}:${text}:${snapshot.createdAt || ""}`)}`;
  return createCreatorMemoryEntry({
    id: legacyId,
    creatorId: defaults.creatorId,
    scope: clean(snapshot.source) === "roundtable" ? "roundtable" : "identity",
    sourceRecordId: clean(snapshot.sourceRecordId),
    type: "summary",
    text,
    keywords: snapshot.keywords,
    importance: Number(snapshot.importance) || 2,
    createdAt: Number(snapshot.createdAt) || Date.now(),
    updatedAt: Number(snapshot.updatedAt) || Number(snapshot.createdAt) || Date.now(),
    deletedAt: Number(snapshot.deletedAt) || 0,
  });
}

export function normalizeCreatorMemory(memory = {}, defaults = {}) {
  const creatorId = clean(defaults.creatorId);
  const legacySnapshots = Array.isArray(memory?.compressedSnapshots)
    ? memory.compressedSnapshots.filter((item) => item && typeof item === "object" && clean(item.text || item.content || item.summary))
    : [];
  const explicitEntries = Array.isArray(memory?.entries)
    ? memory.entries
    : [];
  const entriesById = new Map();
  [...explicitEntries, ...legacySnapshots.map((snapshot) => normalizeLegacyMemorySnapshot(snapshot, { creatorId }))].forEach((entry) => {
    const normalized = normalizeCreatorMemoryEntry(entry, { creatorId });
    if (normalized) entriesById.set(normalized.id, normalized);
  });
  return {
    displayName: clean(memory?.displayName) || clean(defaults.displayName) || "主创记忆",
    notes: clean(memory?.notes),
    autoEnabled: memory?.autoEnabled === undefined ? true : Boolean(memory.autoEnabled),
    compressedSnapshots: legacySnapshots,
    entries: [...entriesById.values()].sort((a, b) => a.createdAt - b.createdAt),
  };
}

export function getActiveCreatorMemoryEntries(memory = {}) {
  return (Array.isArray(memory?.entries) ? memory.entries : [])
    .map((entry) => normalizeCreatorMemoryEntry(entry))
    .filter((entry) => entry && !entry.deletedAt);
}

export function appendCreatorMemoryEntry(memory = {}, entry = {}, defaults = {}) {
  const next = normalizeCreatorMemory(memory, defaults);
  const normalized = normalizeCreatorMemoryEntry(entry, defaults);
  if (!normalized) return next;
  const existingIndex = next.entries.findIndex((item) => item.id === normalized.id);
  if (existingIndex >= 0) next.entries[existingIndex] = normalized;
  else next.entries.push(normalized);
  next.entries.sort((a, b) => a.createdAt - b.createdAt);
  return next;
}

export function markCreatorMemoriesDeleted(memory = {}, predicate = () => false, deletedAt = Date.now()) {
  const next = normalizeCreatorMemory(memory);
  next.entries = next.entries.map((entry) => (
    predicate(entry) && !entry.deletedAt
      ? { ...entry, deletedAt, updatedAt: deletedAt }
      : entry
  ));
  return next;
}
