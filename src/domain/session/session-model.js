import { uid } from "../../utils/id.js";
import { createSettings, hydrateSessionSettings } from "../settings/settings-model.js";
import { createDefaultNovel } from "../novel/novel-model.js";

export function createAssistantVersion(content = "", usage = null) {
  return {
    id: uid("ver"),
    content,
    usage,
    createdAt: Date.now(),
  };
}

export function createRootNode() {
  return {
    id: "root",
    role: "root",
    parentId: null,
    children: [],
    activeChildId: null,
    createdAt: Date.now(),
  };
}

export function createSession(title = "新会话") {
  const root = createRootNode();
  return {
    id: uid("sess"),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rootId: root.id,
    nodes: { [root.id]: root },
    settings: createSettings(),
    novel: createDefaultNovel(),
  };
}

export function hydrateSession(session, legacySettings = {}) {
  session.settings = hydrateSessionSettings(session.settings || legacySettings);
  session.novel = { ...createDefaultNovel(), ...(session.novel || {}) };
  session.rootId ||= "root";
  session.nodes ||= {};
  session.nodes[session.rootId] ||= createRootNode();
  Object.values(session.nodes).forEach((node) => {
    node.children ||= [];
    node.activeChildId = node.children.includes(node.activeChildId) ? node.activeChildId : node.children[0] || null;
    if (node.role === "assistant") {
      node.versions ||= [];
      if (!node.versions.length) node.versions.push(createAssistantVersion(""));
      node.activeVersionId ||= node.versions[0].id;
    }
  });
  return session;
}
