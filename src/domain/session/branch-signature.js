import { activePath, getNode } from "./session-tree.js";

function simpleHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function nodePathIds(session, nodeId) {
  const ids = [];
  const seen = new Set();
  let node = getNode(session, nodeId);
  while (node?.parentId && !seen.has(node.id)) {
    seen.add(node.id);
    ids.push(node.id);
    node = getNode(session, node.parentId);
  }
  return ids.reverse();
}

export function branchPathHashForNode(session, nodeId) {
  const ids = nodePathIds(session, nodeId);
  return ids.length ? simpleHash(ids.join(">")) : "";
}

export function activeBranchNodeIds(session) {
  return activePath(session).map((node) => node.id);
}

export function activeBranchPathHash(session) {
  const ids = activeBranchNodeIds(session);
  return ids.length ? simpleHash(ids.join(">")) : "";
}

export function isMemoryOnActiveBranch(session, memory = {}) {
  if (!memory.sourceNodeId) return true;
  const activeIds = activeBranchNodeIds(session);
  if (!activeIds.includes(memory.sourceNodeId)) return false;
  if (!memory.branchPathHash) return true;
  return branchPathHashForNode(session, memory.sourceNodeId) === memory.branchPathHash;
}

export function pruneAbandonedBranchMemories(memory = {}, session, deletedAt = Date.now()) {
  const entries = Array.isArray(memory.entries) ? memory.entries : [];
  return {
    ...memory,
    entries: entries.map((entry) => (
      entry?.sourceNodeId && !entry.deletedAt && !isMemoryOnActiveBranch(session, entry)
        ? { ...entry, deletedAt, updatedAt: deletedAt }
        : entry
    )),
  };
}
