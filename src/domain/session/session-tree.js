import { clean } from "../../utils/text.js";
import { uid } from "../../utils/id.js";
import { createAssistantVersion } from "./session-model.js";

export function getNode(session, id) {
  return session?.nodes?.[id];
}

export function activePath(session) {
  const path = [];
  let node = getNode(session, session?.rootId);
  while (node?.activeChildId) {
    const next = getNode(session, node.activeChildId);
    if (!next) break;
    path.push(next);
    node = next;
  }
  return path;
}

export function activatePathToNode(session, nodeId) {
  const chain = [];
  const seen = new Set();
  let node = getNode(session, nodeId);
  while (node?.parentId && !seen.has(node.id)) {
    seen.add(node.id);
    chain.push(node);
    node = getNode(session, node.parentId);
  }
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const child = chain[index];
    const parent = getNode(session, child.parentId);
    if (parent?.children?.includes(child.id)) parent.activeChildId = child.id;
  }
  return Boolean(chain.length);
}

export function getAssistantVersion(node) {
  if (!node || node.role !== "assistant") return null;
  return node.versions.find((version) => version.id === node.activeVersionId) || node.versions[0] || null;
}

export function getAssistantVersionById(node, versionId) {
  if (!node || node.role !== "assistant") return null;
  return node.versions.find((version) => version.id === versionId) || getAssistantVersion(node);
}

export function setAssistantVersionContent(node, version, content) {
  if (!node || !version) return;
  version.content = content;
  node.content = content;
  node.activeVersionId = version.id;
}

export function createNode(role, parentId, content = "") {
  return {
    id: uid(role),
    role,
    parentId,
    content,
    children: [],
    activeChildId: null,
    versions: role === "assistant" ? [createAssistantVersion(content)] : [],
    activeVersionId: role === "assistant" ? null : null,
    createdAt: Date.now(),
  };
}

export function addChild(session, parent, child) {
  session.nodes[child.id] = child;
  parent.children.push(child.id);
  parent.activeChildId = child.id;
}

export function titleForSession(session) {
  const firstUser = Object.values(session.nodes).find((node) => node.role === "user" && clean(node.content));
  return clean(session.title) && session.title !== "新会话"
    ? session.title
    : clean(firstUser?.content).slice(0, 18) || "新会话";
}

export function touchSession(session) {
  session.title = titleForSession(session);
  session.updatedAt = Date.now();
}
