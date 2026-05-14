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

export function createWriterState(overrides = {}) {
  return {
    styleCache: overrides.styleCache || "",
    styleCacheUpdatedAt: Number(overrides.styleCacheUpdatedAt) || 0,
    styleCacheSourceHash: overrides.styleCacheSourceHash || "",
    inheritingStyle: Boolean(overrides.inheritingStyle),
    modelOverride: overrides.modelOverride && typeof overrides.modelOverride === "object"
      ? { ...overrides.modelOverride }
      : {},
  };
}

export function hydrateWriterState(writerState = {}) {
  return createWriterState(writerState);
}

export function createSession(title = "新会话", options = {}) {
  const root = createRootNode();
  return {
    id: uid("sess"),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    creatorId: options.creatorId || "",
    rootId: root.id,
    nodes: { [root.id]: root },
    settings: createSettings(),
    novel: createDefaultNovel(),
    writerState: createWriterState(),
  };
}

export function hydrateSession(session, legacySettings = {}) {
  session.settings = hydrateSessionSettings(session.settings || legacySettings);
  session.novel = { ...createDefaultNovel(), ...(session.novel || {}) };
  session.creatorId ||= "";
  session.writerState = hydrateWriterState(session.writerState);
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
