import { uid } from "./utils/id.js";
import { clean, escapeHtml } from "./utils/text.js";
import { formatTime } from "./utils/time.js";
import { estimateTokens, formatK } from "./utils/tokens.js";
import { humanizeError } from "./utils/errors.js";
import { createCommandRegistry } from "./app/command-registry.js";
import { createDefaultLayout, hydrateLayout } from "./domain/layout/layout-model.js";
import { createDefaultNovel } from "./domain/novel/novel-model.js";
import {
  buildNovelMemory as buildNovelMemoryFromSession,
  buildNovelSourceText,
} from "./domain/novel/novel-context-builder.js";
import { buildNovelStats } from "./domain/novel/novel-stats.js";
import { hydrateSessionSettings } from "./domain/settings/settings-model.js";
import { hydrateApiSettings } from "./domain/settings/api-settings.js";
import {
  DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT,
  DEFAULT_ROUNDTABLE_CONTEXT,
  GENERATIVE_AGENT_MEMORY_LIMIT,
  createRoundAssistantConfigView,
  getRoundAssistantBaseFromState,
  getRoundAssistantBasesFromState,
  getRoundAssistantAliases,
  hydrateRoundtableState,
  isCustomRoundAssistantInState,
  normalizeAssistantMemories,
  normalizeCustomAssistant,
  normalizeMentionName,
  normalizeRoundtableContextOptions,
  resolveRoundAssistant,
} from "./domain/roundtable/roundtable-model.js";
import {
  buildAssistantMentionInstruction,
  buildAssistantMemoryPrompt as buildAssistantMemoryPromptFromDomain,
  buildRoundtableNovelMaterials as buildRoundtableNovelMaterialsFromDomain,
  buildRoundtablePromptMessages,
  isSociallyActivatedAssistant,
} from "./domain/roundtable/roundtable-context-builder.js";
import {
  buildRoundProgressInstruction,
  createRoundProgress,
  findMentionedRoundtableAssistants,
  moveMentionedAssistantsAfter,
} from "./domain/roundtable/roundtable-flow.js";
import { appendCouncilParticipationRecord } from "./domain/roundtable/council-participation-memory.js";
import {
  appendRoundtableMessage,
  createFailureRoundtableMessage,
  findRoundtableMessage,
  getAdoptedRoundtableMessages,
  removeRoundtableMessage,
  stripRoundtableSpeakerPrefix,
  toggleRoundtableDecision,
  updateRoundtableMessageText,
} from "./domain/roundtable/roundtable-message-model.js";
import {
  appendWriterSync,
  buildWriterManuscriptSegments,
  locateWriterSyncStart,
  removeWriterSyncedSegment,
  replaceWriterSyncedSegment,
} from "./domain/roundtable/roundtable-writer-sync.js";
import { createSession } from "./domain/session/session-model.js";
import {
  getNode as getSessionNode,
  activePath as getActivePath,
  getAssistantVersion,
  getAssistantVersionById,
  setAssistantVersionContent,
  createNode,
  addChild as appendChild,
  titleForSession,
  touchSession,
} from "./domain/session/session-tree.js";
import { createAiClient } from "./services/api/ai-client.js";
import { createBridgeClient, registerBridgeHooks } from "./services/bridge/bridge-client.js";
import { loadState, saveState as persistState } from "./state/persistence.js";
import { bindCommandDelegation } from "./ui/bindings/event-binding.js";
import { createPanelManager } from "./ui/panels/panel-manager.js";
import { renderContextBadge as drawContextBadge, renderContextPanel as drawContextPanel } from "./ui/renderers/context-renderer.js";
import { renderSessions as drawSessions } from "./ui/renderers/session-renderer.js";

const CONTINUE_PROMPT = "继续完成上一条请求，直接给出用户要的内容，不要重复确认。";
const BRIDGE_TIMEOUT = 160000;
const AUTO_CONTEXT_TOKEN_THRESHOLD = 18000;
const COMPRESSED_CONTEXT_TAIL_COUNT = 6;
const PAPER_DEEP_COLLAPSE_THRESHOLD = 0.035;
const MOTION_PULSE_MS = 260;
const MOTION_RIPPLE_MS = 520;
const LOCAL_IMAGE_MAX_BYTES = 2.5 * 1024 * 1024;
const LOCAL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const WORKSPACE_FILE_LIMIT = 160;
const GENERATIVE_AGENT_SOURCE_NOTE = "人格记忆层参考 joonspk-research/generative_agents 的 memory stream / reflection 思路：观察被保存为短记忆，之后再进入角色提示。";

const $ = (selector) => document.querySelector(selector);
const els = {
  body: document.body,
  title: $("#sessionTitle"),
  roundtableEntry: $(".roundtable-entry"),
  messages: $("#messageList"),
  menu: $("#messageMenu"),
  composer: $("#composer"),
  composerToolButton: $("#composerToolButton"),
  input: $("#chatInput"),
  send: $("#sendButton"),
  contextBadge: $("#contextBadge"),
  modelSelect: $("#modelSelect"),
  backdrop: $("#backdrop"),
  historyPanel: $("#historyPanel"),
  settingsPanel: $("#settingsPanel"),
  workspacePanel: $("#workspacePanel"),
  novelPanel: $("#novelPanel"),
  contextPanel: $("#contextPanel"),
  roundtablePanel: $("#roundtablePanel"),
  roundtableWorkspace: $("#roundtableWorkspace"),
  roundtableMembersPanel: $("#roundtableMembersPanel"),
  roundtableContextButton: $("#roundtableContextButton"),
  roundtableCycleButton: $("#roundtableCycleButton"),
  roundtableContextDock: $("#roundtableContextDock"),
  roundtablePaper: $("#roundtablePaper"),
  roundtablePaperViewport: $("#roundtablePaperViewport"),
  roundtablePaperGrip: $("#roundtablePaperGrip"),
  roundtablePaperGripLabel: $("#roundtablePaperGripLabel"),
  roundtablePaperJump: $("#roundtablePaperJump"),
  roundtableManuscript: $("#roundtableManuscript"),
  roundtablePaperStatus: $("#roundtablePaperStatus"),
  roundtableDiscussion: $("#roundtableDiscussion"),
  roundtableMentionPicker: null,
  novelFields: Array.from(document.querySelectorAll("[data-novel-key]")),
  novelStats: $("#novelStats"),
  novelVersionList: $("#novelVersionList"),
  novelSegmentList: $("#novelSegmentList"),
  bodyImportFile: $("#bodyImportFile"),
  sessionList: $("#sessionList"),
  historySearch: $("#historySearch"),
  systemPrompt: $("#systemPromptInput"),
  baseUrl: $("#baseUrlInput"),
  apiKey: $("#apiKeyInput"),
  modelInput: $("#modelInput"),
  modelDatalist: $("#modelDatalist"),
  modelStatus: $("#modelStatus"),
  userNameInput: $("#userNameInput"),
  userAvatarFile: $("#userAvatarFile"),
  userAvatarPreview: $("#userAvatarPreview"),
  chooseUserAvatar: $("#chooseUserAvatarButton"),
  clearUserAvatar: $("#clearUserAvatarButton"),
  sessionBackgroundFile: $("#sessionBackgroundFile"),
  sessionBackgroundPreview: $("#sessionBackgroundPreview"),
  chooseSessionBackground: $("#chooseSessionBackgroundButton"),
  clearSessionBackground: $("#clearSessionBackgroundButton"),
  temperature: $("#temperatureInput"),
  temperatureLabel: $("#temperatureLabel"),
  contextCount: $("#contextCountInput"),
  unlimitedContext: $("#unlimitedContextInput"),
  maxTokens: $("#maxTokensInput"),
  stream: $("#streamInput"),
  layoutInputs: Array.from(document.querySelectorAll("[data-layout-key]")),
  layoutValues: Array.from(document.querySelectorAll("[data-layout-value]")),
  contextStats: $("#contextStats"),
  contextPreview: $("#contextPreview"),
  workspacePathInput: $("#workspacePathInput"),
  workspaceFileInput: $("#workspaceFileInput"),
  workspaceStats: $("#workspaceStats"),
  workspaceFileGroups: $("#workspaceFileGroups"),
  layoutPresetName: $("#layoutPresetName"),
  customLayoutPresets: $("#customLayoutPresets"),
  editDialog: $("#editDialog"),
  editTitle: $("#editTitle"),
  editText: $("#editText"),
  saveEdit: $("#saveEditButton"),
  saveSendEdit: $("#saveSendEditButton"),
  assistantImportFile: $("#assistantImportFile"),
  assistantConfigDialog: $("#assistantConfigDialog"),
  assistantConfigTitle: $("#assistantConfigTitle"),
  assistantNameInput: $("#assistantNameInput"),
  assistantBaseUrlInput: $("#assistantBaseUrlInput"),
  assistantApiKeyInput: $("#assistantApiKeyInput"),
  assistantModelInput: $("#assistantModelInput"),
  fetchAssistantModels: $("#fetchAssistantModelsButton"),
  assistantModelStatus: $("#assistantModelStatus"),
  assistantMaxTokensInput: $("#assistantMaxTokensInput"),
  assistantTemperatureInput: $("#assistantTemperatureInput"),
  assistantTemperatureLabel: $("#assistantTemperatureLabel"),
  assistantIncludeManuscriptInput: $("#assistantIncludeManuscriptInput"),
  assistantIncludeNovelInput: $("#assistantIncludeNovelInput"),
  assistantIncludePlotlineInput: $("#assistantIncludePlotlineInput"),
  assistantIncludeCharactersInput: $("#assistantIncludeCharactersInput"),
  assistantIncludeWorldInput: $("#assistantIncludeWorldInput"),
  assistantIncludeOutlineInput: $("#assistantIncludeOutlineInput"),
  assistantIncludeForeshadowsInput: $("#assistantIncludeForeshadowsInput"),
  assistantIncludeMainChatInput: $("#assistantIncludeMainChatInput"),
  assistantIncludeDiscussionInput: $("#assistantIncludeDiscussionInput"),
  assistantExcerptMaxInput: $("#assistantExcerptMaxInput"),
  assistantDiscussionCountInput: $("#assistantDiscussionCountInput"),
  assistantActivationStatus: $("#assistantActivationStatus"),
  assistantActivationProfileInput: $("#assistantActivationProfileInput"),
  activateAssistant: $("#activateAssistantButton"),
  clearAssistantActivation: $("#clearAssistantActivationButton"),
  assistantAvatarFile: $("#assistantAvatarFile"),
  assistantAvatarPreview: $("#assistantAvatarPreview"),
  chooseAssistantAvatar: $("#chooseAssistantAvatarButton"),
  clearAssistantAvatar: $("#clearAssistantAvatarButton"),
  assistantPromptInput: $("#assistantPromptInput"),
  resetAssistantConfig: $("#resetAssistantConfigButton"),
  deleteAssistant: $("#deleteAssistantButton"),
  importAssistant: $("#importAssistantButton"),
  exportAssistant: $("#exportAssistantButton"),
  saveAssistantConfig: $("#saveAssistantConfigButton"),
  toast: $("#toast"),
};

let state = loadState();
let activeMenuNodeId = null;
let activeRoundtableMessageId = null;
let editTarget = null;
let assistantConfigTargetId = null;
let isGenerating = false;
let abortController = null;
let bridgeRequestId = null;
let streamRequestId = null;
let generatingNodeId = null;
let materialGenerating = false;
let roundtableGenerating = false;
let roundtableShouldStop = false;
let roundtableActiveSpeakerId = null;
let mentionPickerOpen = false;
let mentionPickerQuery = "";
let mentionPickerRange = null;
let assistantActivating = false;
let modelPickerOpen = false;
let assistantModelPickerOpen = false;
let panelHistoryOpen = false;
let toastTimer = null;
let toastMotionTimer = null;
let paperScrollPersistTimer = null;
let paperGripSuppressClickUntil = 0;
const paperDrag = {
  active: false,
  moved: false,
  pointerId: null,
  startY: 0,
  startReveal: 0.68,
};
const bridgeCallbacks = new Map();
const bridgeStreamCallbacks = new Map();
const streamDomTimers = new Map();
const panelManager = createPanelManager(els, {
  onShow: (name) => {
    els.body.dataset.activePanel = name;
    if (name === "context") renderContextPanel();
    if (name === "novel") renderNovelPanel();
    if (name === "workspace") renderWorkspacePanel();
  },
  onClose: () => {
    delete els.body.dataset.activePanel;
  },
});
const bridgeClient = createBridgeClient({
  timeoutMs: BRIDGE_TIMEOUT,
  callbacks: bridgeCallbacks,
  streamCallbacks: bridgeStreamCallbacks,
  setActiveRequestId: (requestId) => {
    bridgeRequestId = requestId;
  },
  setActiveStreamRequestId: (requestId) => {
    streamRequestId = requestId;
  },
});
const aiClient = createAiClient({
  bridgeClient,
  getAbortSignal: () => abortController?.signal,
});
registerBridgeHooks(bridgeCallbacks, bridgeStreamCallbacks);

const layoutPresets = {
  compact: {
    composerMinHeight: 56,
    composerFontSize: 15,
    sendButtonSize: 30,
    toolButtonSize: 24,
    messageFontSize: 16,
    messageLineHeight: 145,
    assistantLeft: 18,
    messageSidePadding: 14,
    messageGap: 10,
    userBubblePadding: 2,
    metaFontSize: 11,
    footerGap: 6,
    moreButtonSize: 24,
  },
  comfortable: {
    composerMinHeight: 86,
    composerFontSize: 18,
    sendButtonSize: 40,
    toolButtonSize: 32,
    messageFontSize: 19,
    messageLineHeight: 165,
    assistantLeft: 22,
    messageSidePadding: 20,
    messageGap: 18,
    userBubblePadding: 4,
    metaFontSize: 13,
    footerGap: 10,
    moreButtonSize: 32,
  },
};

function activeSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || state.sessions[0];
}

function apiSettings() {
  state.api = hydrateApiSettings(state.api);
  return state.api;
}

function sessionSettings(session = activeSession()) {
  session.settings = hydrateSessionSettings(session.settings);
  return session.settings;
}

function sessionAppearance(session = activeSession()) {
  const settings = sessionSettings(session);
  settings.appearance = {
    userName: "我",
    userAvatarDataUrl: "",
    backgroundDataUrl: "",
    ...(settings.appearance || {}),
  };
  return settings.appearance;
}

function sessionNovel(session = activeSession()) {
  session.novel = { ...createDefaultNovel(), ...(session.novel || {}) };
  session.novel.versions = Array.isArray(session.novel.versions)
    ? session.novel.versions.filter((version) => version && typeof version === "object" && clean(version.body))
    : [];
  return session.novel;
}

function sessionWorkspace(session = activeSession()) {
  session.workspace = session.workspace && typeof session.workspace === "object" ? session.workspace : {};
  session.workspace.path = clean(session.workspace.path || "");
  session.workspace.files = Array.isArray(session.workspace.files)
    ? session.workspace.files.filter((file) => file && clean(file.name))
    : [];
  return session.workspace;
}

function roundtableState(session = activeSession()) {
  session.roundtable = hydrateRoundtableState(session.roundtable);
  return session.roundtable;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getRoundAssistantBases(session = activeSession()) {
  return getRoundAssistantBasesFromState(session?.roundtable);
}

function getRoundAssistantBase(id, session = activeSession()) {
  return getRoundAssistantBaseFromState(id, session?.roundtable);
}

function getRoundAssistants() {
  return getRoundAssistantBases().map((assistant) => getRoundAssistant(assistant.id)).filter(Boolean);
}

function isCustomRoundAssistant(id) {
  return isCustomRoundAssistantInState(id, roundtableState());
}

function getRoundAssistant(id) {
  const base = getRoundAssistantBase(id);
  const rt = roundtableState();
  return resolveRoundAssistant({
    base,
    config: rt.assistantConfigs[id],
    api: apiSettings(),
    sessionSettings: sessionSettings(),
    roundtableContextOptions: rt.contextOptions,
  });
}

function getRoundAssistantConfig(id) {
  const assistant = getRoundAssistant(id);
  return createRoundAssistantConfigView(assistant, sessionSettings().temperature);
}

function assistantAliases(assistant) {
  const base = getRoundAssistantBase(assistant.id) || assistant;
  return getRoundAssistantAliases(assistant, base);
}

function cleanRoundtableAssistantOutput(assistant, content) {
  return stripRoundtableSpeakerPrefix(content, assistant?.name, assistant ? assistantAliases(assistant) : []);
}

function rememberCouncilParticipation(assistant, message, instruction = "") {
  if (!assistant || assistant.id === "writer" || !message || !clean(message.content)) return;
  const result = appendCouncilParticipationRecord(state.councilParticipationRecords, {
    councilId: assistant.id,
    sessionId: activeSession()?.id,
    roundtableMessageId: message.id,
    topic: clean(roundtableState().contextOptions?.roundTopic || instruction),
    speakerName: assistant.name,
    content: message.content,
    roleState: "creator",
  });
  state.councilParticipationRecords = result.records;
}

function getRoundtableMentionableAssistants(options = {}) {
  const rt = roundtableState();
  const selected = new Set(rt.selectedIds);
  const allowWriter = options.allowWriter !== false;
  return getRoundAssistants().filter((assistant) => {
    if (assistant.id === "writer") return allowWriter;
    return selected.has(assistant.id);
  });
}

function getRoundtableMentionPickerItems() {
  const query = normalizeMentionName(mentionPickerQuery);
  return getRoundtableMentionableAssistants()
    .map((assistant) => ({
      assistant,
      aliases: assistantAliases(assistant),
    }))
    .filter((item) => {
      if (!query) return true;
      return item.aliases.some((alias) => alias.includes(query));
    })
    .map((item) => item.assistant);
}

function parseRoundtableMentions(text, options = {}) {
  const allowWriter = options.allowWriter !== false;
  const assistants = getRoundtableMentionableAssistants({ allowWriter })
    .map((assistant) => ({
      ...assistant,
      aliases: assistantAliases(assistant),
    }));
  return findMentionedRoundtableAssistants(text, assistants, options);
}

function moveRoundtableMentionsAfter(progress, currentIndex, text) {
  const assistants = parseRoundtableMentions(text, { allowWriter: false });
  return moveMentionedAssistantsAfter(progress, currentIndex, assistants);
}

function renderRoundtableRichText(text) {
  const source = clean(text);
  if (!source) return "";
  const mentionMap = new Map();
  getRoundtableMentionableAssistants().forEach((assistant) => {
    assistantAliases(assistant).forEach((alias) => {
      if (!mentionMap.has(alias)) mentionMap.set(alias, assistant);
    });
  });
  const pattern = /@([A-Za-z0-9_\-\u4e00-\u9fff]+)/g;
  let html = "";
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source))) {
    html += escapeHtml(source.slice(lastIndex, match.index));
    const raw = match[0];
    const alias = normalizeMentionName(match[1]);
    const target = mentionMap.get(alias);
    if (!target) {
      html += `<span class="roundtable-mention unknown">${escapeHtml(raw)}</span>`;
    } else {
      const profile = getRoundtableSpeakerProfile({ speakerId: target.id, speakerName: target.name });
      html += `<span class="roundtable-mention ${profile.tone}" data-mention-id="${escapeHtml(target.id)}">${escapeHtml(raw)}</span>`;
    }
    lastIndex = match.index + raw.length;
  }
  html += escapeHtml(source.slice(lastIndex));
  return html;
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, "\\$&");
}

function scheduleStreamDomUpdate(key, callback, delay = 120) {
  const existing = streamDomTimers.get(key);
  if (existing) return;
  const timer = window.setTimeout(() => {
    streamDomTimers.delete(key);
    callback();
  }, delay);
  streamDomTimers.set(key, timer);
}

function cancelStreamDomUpdate(key = null) {
  const keys = key ? [key] : Array.from(streamDomTimers.keys());
  keys.forEach((item) => {
    const timer = streamDomTimers.get(item);
    if (timer) window.clearTimeout(timer);
    streamDomTimers.delete(item);
  });
}

function getNode(id, session = activeSession()) {
  return getSessionNode(session, id);
}

function activePath(session = activeSession()) {
  return getActivePath(session);
}

function getMessageContent(node) {
  if (!node) return "";
  if (node.role === "assistant") return getAssistantVersion(node)?.content || "";
  return node.content || "";
}

function contextMessages(extraUserText = "", includeDraftAssistantId = null) {
  const path = activePath();
  const settings = sessionSettings();
  const limit = settings.unlimitedContext ? Infinity : Math.max(0, Number(settings.contextCount) || 0);
  let selected = Number.isFinite(limit) ? path.slice(-limit) : path.slice();
  if (includeDraftAssistantId) selected = selected.filter((node) => node.id !== includeDraftAssistantId);
  const buildMessagesFromSelection = (selection, compressed = false) => {
    const messages = [];
    if (clean(settings.systemPrompt)) {
      messages.push({ role: "system", content: settings.systemPrompt });
    }
    const novelMemory = buildNovelMemory();
    if (novelMemory) {
      messages.push({ role: "system", content: novelMemory });
    }
    if (compressed) {
      messages.push({
        role: "system",
        content: "当前对话过长，已自动改用小说资料和最近对话继续。剧情线、角色卡、世界观、大纲、伏笔线是压缩后的长期记忆，请优先依据它们保持连续性。",
      });
    }
    selection.forEach((node) => {
      if (node.role === "user") messages.push({ role: "user", content: node.content });
      if (node.role === "assistant") messages.push({ role: "assistant", content: getAssistantVersion(node)?.content || "" });
    });
    if (clean(extraUserText)) messages.push({ role: "user", content: extraUserText });
    return messages;
  };
  let messages = buildMessagesFromSelection(selected);
  const estimated = estimateTokens(messages.map((message) => `${message.role}: ${message.content}`).join("\n\n"));
  const novelMemory = buildNovelMemory();
  if (estimated > AUTO_CONTEXT_TOKEN_THRESHOLD && novelMemory && selected.length > COMPRESSED_CONTEXT_TAIL_COUNT) {
    selected = selected.slice(-COMPRESSED_CONTEXT_TAIL_COUNT);
    messages = buildMessagesFromSelection(selected, true);
  }
  return messages.filter((message) => clean(message.content));
}

function getAutoContextCompressedInfo(extraUserText = "") {
  const full = contextMessages(extraUserText);
  const text = full.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  return {
    compressed: text.includes("当前对话过长，已自动改用小说资料和最近对话继续。"),
    tokens: estimateTokens(text),
  };
}

function estimateFullContextTokens(extraUserText = "", includeDraftAssistantId = null) {
  const path = activePath();
  const settings = sessionSettings();
  const limit = settings.unlimitedContext ? Infinity : Math.max(0, Number(settings.contextCount) || 0);
  let selected = Number.isFinite(limit) ? path.slice(-limit) : path.slice();
  if (includeDraftAssistantId) selected = selected.filter((node) => node.id !== includeDraftAssistantId);
  const parts = [
    settings.systemPrompt,
    buildNovelMemory(),
    ...selected.map((node) => getMessageContent(node)),
    extraUserText,
  ].filter((part) => clean(part));
  return estimateTokens(parts.join("\n\n"));
}

function extractJsonObject(text) {
  const source = clean(text)
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(source);
  } catch {}
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function autoCompressionSourceSize() {
  return [
    sessionNovel().body,
    activePath().map((node) => getMessageContent(node)).join("\n\n"),
  ].join("\n\n").length;
}

async function ensureAutoCompressNovelMemory(extraUserText = "", includeDraftAssistantId = null) {
  syncNovelFromFields();
  const fullTokens = estimateFullContextTokens(extraUserText, includeDraftAssistantId);
  if (fullTokens <= AUTO_CONTEXT_TOKEN_THRESHOLD) return false;
  const novel = sessionNovel();
  const sourceSize = autoCompressionSourceSize();
  if (novel.autoCompression && Math.abs((Number(novel.autoCompression.sourceSize) || 0) - sourceSize) < 2000) {
    return false;
  }
  showToast("上下文过长，正在自动压缩到小说资料");
  const recentChat = activePath()
    .slice(-24)
    .map((node) => `${node.role === "user" ? "用户" : "AI"}：${getMessageContent(node)}`)
    .join("\n\n");
  const source = [
    clean(novel.body) ? `【正文库后段】\n${clean(novel.body).slice(-24000)}` : "",
    buildNovelMemory() ? `【已有小说资料】\n${buildNovelMemory()}` : "",
    clean(recentChat) ? `【最近对话】\n${recentChat}` : "",
    clean(extraUserText) ? `【本次请求】\n${extraUserText}` : "",
  ].filter(Boolean).join("\n\n");
  const prompt = [
    "请把以下长篇小说创作上下文压缩成可长期复用的小说资料。",
    "只输出 JSON，不要解释。字段必须是 plotline, characters, world, outline, foreshadows。",
    "要求：保留已经发生的剧情、人物关系与动机、世界规则、后续目标、未回收伏笔；删除闲聊和重复表达；用中文。",
    source,
  ].join("\n\n");
  const text = await aiClient.generateText({
    api: apiSettings(),
    settings: { ...sessionSettings(), temperature: 0.25, maxTokens: Math.max(1600, Number(sessionSettings().maxTokens) || 0) },
    messages: [{ role: "user", content: prompt }],
  });
  const data = extractJsonObject(text);
  if (!data) throw new Error("自动压缩失败：模型没有返回可读取的 JSON");
  ["plotline", "characters", "world", "outline", "foreshadows"].forEach((key) => {
    if (clean(data[key])) novel[key] = clean(data[key]);
  });
  novel.autoCompression = { updatedAt: Date.now(), sourceSize, fullTokens };
  renderNovelPanel();
  renderContextBadge();
  persistState(state);
  showToast("已自动压缩到小说资料，并继续生成");
  return true;
}

function buildNovelMemory() {
  return buildNovelMemoryFromSession(sessionNovel());
}

function getNovelSourceText() {
  const novel = sessionNovel();
  const chat = activePath()
    .slice(-12)
    .map((node) => `${node.role === "user" ? "用户" : "AI"}：${getMessageContent(node)}`)
    .join("\n\n");
  return buildNovelSourceText(novel, chat);
}

function contextInfo(extraUserText = "") {
  const messages = contextMessages(extraUserText);
  const text = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  const nonSystem = messages.filter((message) => message.role !== "system").length;
  const settings = sessionSettings();
  const limit = settings.unlimitedContext ? "∞" : settings.contextCount;
  return { messages, text, nonSystem, limit, tokens: estimateTokens(text) };
}

function shouldFollowBottom() {
  return els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 90;
}

function scrollBottom(force = false) {
  requestAnimationFrame(() => {
    if (!force && !shouldFollowBottom()) return;
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  window.clearTimeout(toastMotionTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  els.toast.classList.remove("toast-pop");
  void els.toast.offsetWidth;
  els.toast.classList.add("toast-pop");
  toastMotionTimer = window.setTimeout(() => {
    els.toast.classList.remove("toast-pop");
  }, 420);
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 1800);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

function vibrateLight(command = "") {
  if (!navigator.vibrate || prefersReducedMotion()) return;
  const heavier = /delete|stop|close|reset|undo/.test(command);
  try {
    navigator.vibrate(heavier ? 16 : 8);
  } catch {}
}

function pulseElement(element) {
  if (!element || prefersReducedMotion()) return;
  element.classList.remove("motion-press");
  void element.offsetWidth;
  element.classList.add("motion-press");
  window.setTimeout(() => element.classList.remove("motion-press"), MOTION_PULSE_MS);
}

function addMotionRipple(element, event) {
  if (!element || !event || prefersReducedMotion()) return;
  const rect = element.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const ripple = document.createElement("span");
  const size = Math.max(rect.width, rect.height) * 1.45;
  ripple.className = "motion-ripple";
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  element.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), MOTION_RIPPLE_MS);
}

function showCommandFeedback(target, command, event) {
  if (!target) return;
  const feedbackTarget = target.closest("button, .message-card, .roundtable-speech, .roundtable-writer-card, .roundtable-member-option, [data-command]");
  pulseElement(feedbackTarget);
  addMotionRipple(feedbackTarget, event);
  vibrateLight(command);
}

function setRoundtableActiveSpeaker(id) {
  roundtableActiveSpeakerId = id || null;
  if (roundtableState().enabled) renderRoundtable();
}

function showPanel(name) {
  if (name === "workspace") ensureWorkspaceUi();
  const hadPanel = Boolean(panelManager.getActivePanel());
  panelManager.showPanel(name);
  if (!hadPanel && !history.state?.tbirdPanelOpen) {
    try {
      history.pushState({ ...(history.state || {}), tbirdPanelOpen: true }, "");
      panelHistoryOpen = true;
    } catch {
      panelHistoryOpen = false;
    }
  }
}

function closePanels(options = {}) {
  const hadPanel = Boolean(panelManager.getActivePanel());
  panelManager.closePanels();
  if (options.fromHistory) {
    panelHistoryOpen = false;
    return;
  }
  if (hadPanel && panelHistoryOpen && history.state?.tbirdPanelOpen) {
    panelHistoryOpen = false;
    history.back();
  }
}

function ensureWorkspaceUi() {
  const topActions = document.querySelector(".top-actions");
  topActions?.querySelector('button[data-command="open-search"]')?.remove();
  topActions?.querySelector('button[data-command="open-history"]')?.remove();
  if (topActions && !topActions.querySelector('[data-command="open-workspace"]')) {
    const button = document.createElement("button");
    button.className = "icon-button workspace-entry";
    button.type = "button";
    button.dataset.command = "open-workspace";
    button.setAttribute("aria-label", "工作区");
    button.textContent = "工";
    topActions.insertBefore(button, topActions.firstChild);
  }
  if (!els.workspacePanel) {
    const panel = document.createElement("aside");
    panel.id = "workspacePanel";
    panel.className = "side-panel right-panel workspace-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="panel-head">
        <div>
          <strong>工作区</strong>
          <span class="muted">当前会话的小说文件夹</span>
        </div>
        <button class="icon-button" type="button" data-command="close-panels">×</button>
      </div>
      <label class="field">
        <span>文件夹路径</span>
        <input id="workspacePathInput" type="text" placeholder="例如 D:\\Novel\\圆桌小说盒子" />
      </label>
      <p class="workspace-hint">先记录路径与已加入文件，并按类型自动归类；安卓文件夹扫描需要后续增加原生文件夹授权桥。</p>
      <input id="workspaceFileInput" type="file" multiple hidden />
      <div class="workspace-actions">
        <button type="button" data-command="choose-workspace-files">加入文件</button>
        <button type="button" data-command="clear-workspace-files">清空列表</button>
      </div>
      <div id="workspaceStats" class="workspace-stats"></div>
      <div id="workspaceFileGroups" class="workspace-file-groups"></div>
    `;
    document.body.appendChild(panel);
    els.workspacePanel = panel;
    els.workspacePathInput = panel.querySelector("#workspacePathInput");
    els.workspaceFileInput = panel.querySelector("#workspaceFileInput");
    els.workspaceStats = panel.querySelector("#workspaceStats");
    els.workspaceFileGroups = panel.querySelector("#workspaceFileGroups");
    els.workspacePathInput?.addEventListener("input", updateWorkspacePath);
    els.workspaceFileInput?.addEventListener("change", handleWorkspaceFilesSelected);
  }
}

function ensureModelPickerUi() {
  if (!els.modelSelect) return;
  els.modelSelect.hidden = true;
  if (!els.modelSelectButton) {
    const button = document.createElement("button");
    button.id = "modelSelectButton";
    button.className = "model-select-button";
    button.type = "button";
    button.dataset.command = "toggle-model-picker";
    button.setAttribute("aria-label", "选择模型");
    els.modelSelect.before(button);
    els.modelSelectButton = button;
  }
  if (!els.modelPickerPanel) {
    const panel = document.createElement("div");
    panel.id = "modelPickerPanel";
    panel.className = "model-picker-panel";
    panel.hidden = true;
    els.composer.after(panel);
    els.modelPickerPanel = panel;
  }
}

function ensureAssistantModelPickerUi() {
  if (!els.assistantModelInput) return;
  els.assistantModelInput.removeAttribute("list");
  if (!els.assistantModelPickerButton) {
    const row = document.createElement("div");
    row.className = "assistant-model-picker-row";
    row.innerHTML = `
      <button id="assistantModelPickerButton" value="default" type="button" data-command="toggle-assistant-model-picker">选择已拉取模型</button>
    `;
    const panel = document.createElement("div");
    panel.id = "assistantModelPicker";
    panel.className = "assistant-model-picker";
    panel.hidden = true;
    const field = els.assistantModelInput.closest(".field");
    field?.after(panel);
    field?.after(row);
    els.assistantModelPickerButton = row.querySelector("#assistantModelPickerButton");
    els.assistantModelPicker = panel;
  }
}

function applyLayout() {
  const layout = sessionSettings().layout;
  const root = document.documentElement.style;
  root.setProperty("--composer-min-height", `${layout.composerMinHeight}px`);
  root.setProperty("--composer-font-size", `${layout.composerFontSize}px`);
  root.setProperty("--send-button-size", `${layout.sendButtonSize}px`);
  root.setProperty("--tool-button-size", `${layout.toolButtonSize}px`);
  root.setProperty("--font-size", `${layout.messageFontSize}px`);
  root.setProperty("--line-height", `${layout.messageLineHeight / 100}`);
  root.setProperty("--assistant-left", `${layout.assistantLeft}px`);
  root.setProperty("--message-side-padding", `${layout.messageSidePadding}px`);
  root.setProperty("--message-gap", `${layout.messageGap}px`);
  root.setProperty("--user-bubble-padding-y", `${layout.userBubblePadding}px`);
  root.setProperty("--user-bubble-padding-x", `${Math.round(layout.userBubblePadding * 1.3)}px`);
  root.setProperty("--meta-font-size", `${layout.metaFontSize}px`);
  root.setProperty("--footer-gap", `${layout.footerGap}px`);
  root.setProperty("--more-button-size", `${layout.moreButtonSize}px`);
  root.setProperty("--composer-max-textarea", `${Math.max(44, layout.composerMinHeight + 8)}px`);
}

function applySessionAppearance() {
  const appearance = sessionAppearance();
  const background = clean(appearance.backgroundDataUrl);
  document.documentElement.style.setProperty("--session-bg-image", background ? `url("${background}")` : "none");
  els.body.classList.toggle("has-session-background", Boolean(background));
}

function render() {
  const session = activeSession();
  const rt = roundtableState(session);
  ensureWorkspaceUi();
  ensureModelPickerUi();
  applyLayout();
  applySessionAppearance();
  els.title.textContent = rt.enabled ? `圆桌 · ${titleForSession(session)}` : titleForSession(session);
  renderRoundtable();
  renderMessages();
  renderSessions();
  renderSettings();
  renderCustomLayoutPresets();
  renderNovelPanel();
  renderWorkspacePanel();
  renderModelPicker();
  renderContextBadge();
  renderMenu();
  els.body.classList.toggle("is-generating", isGenerating);
  els.body.classList.toggle("roundtable-mode", rt.enabled);
  els.body.classList.toggle("roundtable-busy", roundtableGenerating);
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)));
  persistState(state);
}

function renderRoundtable() {
  if (!els.roundtableWorkspace) return;
  const rt = roundtableState();
  if (rt.enabled && els.roundtableMembersPanel && els.composer && els.roundtableMembersPanel.parentElement !== els.composer) {
    els.composer.insertBefore(els.roundtableMembersPanel, els.composer.firstChild);
  }
  els.roundtableWorkspace.hidden = !rt.enabled;
  els.messages.hidden = rt.enabled;
  if (rt.enabled) {
    els.input.placeholder = "在圆桌里发言；输入 @写手 可把讨论转成正文...";
  } else {
    els.input.placeholder = "在这里输入你的问题...";
  }
  if (els.composerToolButton) {
    els.composerToolButton.textContent = rt.enabled ? "参会人" : "⚙";
    els.composerToolButton.setAttribute("aria-label", rt.enabled ? "参会人" : "设置");
    els.composerToolButton.setAttribute("title", rt.enabled ? "参会人" : "设置");
    els.composerToolButton.classList.toggle("is-roundtable-members", rt.enabled);
  }
  if (els.roundtableCycleButton) {
    els.roundtableCycleButton.hidden = !rt.enabled;
    els.roundtableCycleButton.textContent = roundtableGenerating ? "结束" : "开始";
    els.roundtableCycleButton.setAttribute("aria-label", roundtableGenerating ? "结束本轮" : "开始本轮");
    els.roundtableCycleButton.setAttribute("title", roundtableGenerating ? "结束本轮" : "开始本轮");
    els.roundtableCycleButton.classList.toggle("is-ending", roundtableGenerating);
  }
  if (els.roundtableEntry) {
    els.roundtableEntry.setAttribute("aria-label", rt.enabled ? "退出圆桌共创模式" : "圆桌共创模式");
    els.roundtableEntry.setAttribute("title", rt.enabled ? "退出圆桌" : "圆桌共创");
  }
  if (els.roundtableMembersPanel) {
    els.roundtableMembersPanel.hidden = !rt.membersOpen;
    els.roundtableMembersPanel.innerHTML = renderRoundtableMembers(rt);
  }
  if (els.roundtableContextButton) {
    els.roundtableContextButton.hidden = !rt.enabled;
    els.roundtableContextButton.classList.toggle("active", rt.contextOpen);
  }
  if (els.roundtableContextDock) {
    els.roundtableContextDock.hidden = true;
    els.roundtableContextDock.innerHTML = "";
  }
  syncRoundtablePaperContent(rt);
  if (els.roundtablePaperStatus) {
    els.roundtablePaperStatus.textContent = getRoundtablePaperStatus();
  }
  if (els.roundtablePaperJump) {
    els.roundtablePaperJump.hidden = !rt.paperHasNewProse;
  }
  syncRoundtablePaper();
  if (els.roundtableDiscussion) {
    els.roundtableDiscussion.innerHTML = renderRoundtableDiscussion(rt.messages);
  }
  renderRoundtableMentionPicker();
}

function ensureRoundtableMentionPicker() {
  if (els.roundtableMentionPicker) return els.roundtableMentionPicker;
  const picker = document.createElement("div");
  picker.id = "roundtableMentionPicker";
  picker.className = "roundtable-mention-picker";
  picker.hidden = true;
  els.composer?.appendChild(picker);
  els.roundtableMentionPicker = picker;
  return picker;
}

function renderRoundtableMentionPicker() {
  const picker = ensureRoundtableMentionPicker();
  const rt = roundtableState();
  const open = rt.enabled && mentionPickerOpen && Boolean(mentionPickerRange);
  picker.hidden = !open;
  if (!open) {
    picker.innerHTML = "";
    return;
  }
  const items = getRoundtableMentionPickerItems();
  picker.innerHTML = items.length
    ? `<div class="roundtable-mention-picker-title">选择要 @ 的成员</div>${items.map((assistant) => {
        const profile = getRoundtableSpeakerProfile({ speakerId: assistant.id, speakerName: assistant.name });
        const order = assistant.id === "writer" ? "写" : String((rt.selectedIds || []).indexOf(assistant.id) + 1 || "");
        return `
          <button class="roundtable-mention-choice ${profile.tone}" type="button" data-command="insert-roundtable-mention" data-member-id="${escapeHtml(assistant.id)}">
            <span class="roundtable-mention-choice-index">${escapeHtml(order)}</span>
            <b>${escapeHtml(assistant.name)}</b>
            <small>${escapeHtml(assistant.role)}</small>
          </button>
        `;
      }).join("")}`
    : `<div class="roundtable-mention-empty">没有可 @ 的议员</div>`;
}

function renderRoundtableMembers(rt) {
  const order = new Map(rt.selectedIds.map((id, index) => [id, index + 1]));
  const members = getRoundAssistantBases()
    .filter((base) => base.id !== "writer")
    .map((base) => {
      const assistant = getRoundAssistant(base.id);
      const selected = order.get(assistant.id);
      const model = assistant.model || sessionSettings().model || "未选模型";
      const speaking = roundtableActiveSpeakerId === assistant.id;
      return `
        <div class="roundtable-member-option ${selected ? "selected" : ""} ${speaking ? "speaking" : ""}">
          <button class="roundtable-member-main" type="button" data-command="roundtable-toggle-member" data-member-id="${assistant.id}">
            <span>${selected || ""}</span>
            <b>${escapeHtml(assistant.name)}</b>
            <small>${escapeHtml(assistant.role)} · ${escapeHtml(model)}</small>
          </button>
          <button class="roundtable-member-edit" type="button" data-command="roundtable-edit-assistant" data-member-id="${assistant.id}">改</button>
        </div>
      `;
    })
    .join("");
  return `<div class="roundtable-member-sheet-title"><span>参会人设置</span><small>按数字顺序发言，@写手继续正文</small></div>
    ${members}
    <button class="roundtable-material-toggle ${rt.materialsOpen ? "active" : ""}" type="button" data-command="toggle-roundtable-materials">材料</button>
    ${rt.materialsOpen ? renderRoundtableContextControls(rt) : ""}
    <button class="roundtable-member-add" type="button" data-command="roundtable-add-assistant">+ 添加议员</button>`;
}

function renderRoundtableContextControls(rt) {
  const options = normalizeRoundtableContextOptions(rt.contextOptions);
  const checked = (value) => value ? "checked" : "";
  return `
    <section class="roundtable-context-options" aria-label="圆桌材料">
      <div class="roundtable-context-head">
        <b>材料</b>
        <span>设置本轮 AI 阅读范围</span>
      </div>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeManuscript" ${checked(options.includeManuscript)} />
        <span>正文</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeMainChat" ${checked(options.includeMainChat)} />
        <span>主线对话</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeDiscussion" ${checked(options.includeDiscussion)} />
        <span>圆桌记录</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includePlotline" ${checked(options.includePlotline)} />
        <span>剧情线</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeCharacters" ${checked(options.includeCharacters)} />
        <span>角色卡</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeWorld" ${checked(options.includeWorld)} />
        <span>世界观</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeOutline" ${checked(options.includeOutline)} />
        <span>大纲</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeForeshadows" ${checked(options.includeForeshadows)} />
        <span>伏笔</span>
      </label>
      <label class="roundtable-context-number">
        <span>正文读多少字</span>
        <input type="number" min="120" max="2400" step="40" data-roundtable-context-key="excerptMax" value="${options.excerptMax}" />
      </label>
      <label class="roundtable-context-number">
        <span>记录条数</span>
        <input type="number" min="0" max="80" step="1" data-roundtable-context-key="discussionCount" value="${options.discussionCount}" />
      </label>
      <label class="roundtable-context-topic">
        <span>本轮主题</span>
        <input type="text" data-roundtable-context-key="roundTopic" value="${escapeHtml(options.roundTopic)}" placeholder="例如：妹妹记忆被夺走这一转折是否成立" />
      </label>
    </section>`;
}

function renderRoundtableEmpty() {
  return "";
}

function renderRoundtableDiscussion(messages) {
  if (!messages.length) return renderRoundtableEmpty();
  let lastDateKey = "";
  return messages
    .map((message, index) => {
      const dateKey = roundtableDateKey(message.createdAt);
      const divider = index === 0 || dateKey !== lastDateKey
        ? `<div class="roundtable-divider"><span>${escapeHtml(formatTime(message.createdAt))}</span></div>`
        : "";
      lastDateKey = dateKey;
      return `${divider}${renderRoundtableMessage(message)}`;
    })
    .join("");
}

function getRoundtableSpeakerProfile(message) {
  const appearance = sessionAppearance();
  const profiles = {
    user: { avatar: "我", badge: "发起人", tone: "tone-user", name: "你" },
    setting: { avatar: "设", badge: "设定", tone: "tone-setting", name: "设定师" },
    plot: { avatar: "剧", badge: "剧情", tone: "tone-plot", name: "剧情师" },
    review: { avatar: "审", badge: "审稿", tone: "tone-review", name: "审稿" },
    style: { avatar: "风", badge: "文风", tone: "tone-style", name: "文风师" },
    writer: { avatar: "写", badge: "写手", tone: "tone-writer", name: "写手" },
  };
  const profile = profiles[message.speakerId];
  const assistant = message.speakerId === "user" ? null : getRoundAssistant(message.speakerId);
  const fallbackName = message.speakerId === "user"
    ? clean(appearance.userName) || clean(message.speakerName) || "我"
    : clean(message.speakerName) || assistant?.name || profile?.name || "成员";
  return {
    ...(profile || { avatar: fallbackName.slice(0, 1) || "聊", badge: "讨论", tone: "tone-review", name: fallbackName }),
    name: fallbackName,
    avatar: fallbackName.slice(0, 1) || profile?.avatar || "聊",
    avatarDataUrl: message.speakerId === "user" ? clean(appearance.userAvatarDataUrl) : clean(assistant?.avatarDataUrl),
  };
}

function renderRoundtableAvatar(profile, memberId = "") {
  const content = profile.avatarDataUrl
    ? `<img src="${escapeHtml(profile.avatarDataUrl)}" alt="${escapeHtml(profile.name)}" />`
    : escapeHtml(profile.avatar);
  const attrs = memberId && memberId !== "user"
    ? ` type="button" data-command="roundtable-edit-assistant" data-member-id="${escapeHtml(memberId)}" title="打开${escapeHtml(profile.name)}设置" aria-label="打开${escapeHtml(profile.name)}设置"`
    : "";
  return attrs
    ? `<button class="roundtable-avatar ${profile.tone} avatar-button" ${attrs}>${content}</button>`
    : `<div class="roundtable-avatar ${profile.tone}">${content}</div>`;
}

function renderRoundtableMessage(message) {
  const isUser = message.speakerId === "user";
  const isWriter = message.speakerId === "writer";
  const profile = getRoundtableSpeakerProfile(message);
  const time = formatTime(message.createdAt);
  const decision = renderRoundtableDecisionBadge(message);
  const mentionBadge = renderRoundtableMentionBadge(message);
  const failedClass = message.failed ? " failed" : "";
  const streamingClass = message.streaming ? " streaming" : "";
  if (isWriter) {
    return `
      <article class="roundtable-writer-block ${profile.tone}${streamingClass}">
        <div class="roundtable-writer-card" data-command="toggle-roundtable-menu" data-round-id="${message.id}">
          <div class="roundtable-writer-head">
            ${renderRoundtableAvatar(profile, message.speakerId)}
            <div class="roundtable-writer-meta">
              <div class="roundtable-writer-title">
                <strong>${escapeHtml(profile.name)}</strong>
                <span class="roundtable-role-badge ${profile.tone}">${escapeHtml(profile.badge)}</span>
              </div>
              <time>${escapeHtml(time)}</time>
            </div>
          </div>
          ${decision}
          ${mentionBadge}
          <div class="roundtable-writer-tip">已将这一段同步到上方正文区</div>
          <div class="roundtable-writer-snippet">${renderRoundtableRichText(message.content || "")}${message.streaming ? '<span class="stream-caret"></span>' : ""}</div>
        </div>
      </article>
    `;
  }
  return `
    <article class="roundtable-line ${isUser ? "user" : ""} ${profile.tone}${failedClass}${streamingClass}">
      ${renderRoundtableAvatar(profile, message.speakerId)}
      <div class="roundtable-bubble-stack">
        <div class="roundtable-bubble-meta">
          <span class="roundtable-speaker">${escapeHtml(profile.name)}</span>
          <span class="roundtable-role-badge ${profile.tone}">${escapeHtml(profile.badge)}</span>
          ${decision}
          ${mentionBadge}
          <time>${escapeHtml(time)}</time>
        </div>
        <div class="roundtable-speech" data-command="toggle-roundtable-menu" data-round-id="${message.id}">${renderRoundtableRichText(message.content || "")}${message.streaming ? '<span class="stream-caret"></span>' : ""}</div>
      </div>
    </article>
  `;
}

function renderRoundtableDecisionBadge(message) {
  const status = message.decisionStatus;
  if (status === "adopted") return `<span class="roundtable-decision adopted">已采纳</span>`;
  if (status === "ignored") return `<span class="roundtable-decision ignored">已忽略</span>`;
  if (status === "approved") return `<span class="roundtable-decision approved">通过</span>`;
  if (status === "revision") return `<span class="roundtable-decision revision">需修改</span>`;
  return "";
}

function renderRoundtableMentionBadge(message) {
  if (!message.mentionMeta?.triggeredByName) return "";
  return `<span class="roundtable-mention-badge">回应 @${escapeHtml(message.mentionMeta.triggeredByName)}</span>`;
}

function getRoundtablePaperSource() {
  const body = clean(sessionNovel().body);
  if (body) {
    return {
      text: body,
      source: "正文历史稿",
      updatedAt: activeSession()?.updatedAt || Date.now(),
    };
  }
  const rt = roundtableState();
  const lastWriter = [...rt.messages].reverse().find((message) => message.speakerId === "writer" && clean(message.content));
  if (lastWriter) {
    return {
      text: lastWriter.content,
      source: "写手最新正文",
      updatedAt: lastWriter.createdAt,
    };
  }
  const lastAssistant = [...activePath()].reverse().find((node) => node.role === "assistant" && clean(getMessageContent(node)));
  if (lastAssistant) {
    return {
      text: getMessageContent(lastAssistant),
      source: "主线对话摘录",
      updatedAt: lastAssistant.createdAt || Date.now(),
    };
  }
  return {
    text: "正文还没有放上桌。先在普通模式写一段，或在这里 @写手 开始。",
    source: "待开始",
    updatedAt: Date.now(),
  };
}

function normalizePaperText(text) {
  return clean(text).replace(/\n{3,}/g, "\n\n");
}

function getRoundtableManuscript() {
  return normalizePaperText(getRoundtablePaperSource().text);
}

function getRoundtablePaperStatus() {
  const source = getRoundtablePaperSource();
  const length = clean(source.text).length;
  return `${source.source} · ${length} 字 · ${getRoundtableRevealLabel()} · ${formatTime(source.updatedAt)}`;
}

function getRoundtablePromptExcerpt(max = roundtableState().contextOptions.excerptMax) {
  const value = normalizePaperText(getRoundtablePaperSource().text);
  return value.length > max ? `...${value.slice(-max)}` : value;
}

function buildRoundtableNovelMaterials(options) {
  return buildRoundtableNovelMaterialsFromDomain(options, sessionNovel());
}

function roundtableDateKey(value) {
  const date = new Date(value || Date.now());
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function getViewportHeight() {
  return Math.round(window.visualViewport?.height || window.innerHeight || 760);
}

function getRoundtablePaperMetrics() {
  const viewportHeight = getViewportHeight();
  const composerHeight = Math.ceil(els.composer?.getBoundingClientRect().height || 118);
  const minHeight = 0;
  const paperTop = els.roundtablePaperViewport?.getBoundingClientRect().top || 0;
  const composerTop = els.composer?.getBoundingClientRect().top || 0;
  const measuredAvailableHeight = paperTop > 0 && composerTop > paperTop
    ? composerTop - paperTop - 72
    : 0;
  const fallbackAvailableHeight = viewportHeight - composerHeight - 300;
  const maxHeight = clamp(Math.round(measuredAvailableHeight || fallbackAvailableHeight), 280, 560);
  const reveal = roundtableState().paperReveal;
  const currentHeight = Math.round(minHeight + (maxHeight - minHeight) * reveal);
  return {
    minHeight,
    maxHeight,
    currentHeight,
    reveal,
  };
}

function getRoundtableRevealLabel() {
  return `展开 ${Math.round(getRoundtablePaperMetrics().reveal * 100)}%`;
}

function isRoundtablePaperNearBottom() {
  const viewport = els.roundtablePaperViewport;
  if (!viewport) return true;
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 72;
}

function syncRoundtablePaperContent(rt = roundtableState()) {
  if (!els.roundtableManuscript) return;
  const nextText = getRoundtableManuscript();
  const previousText = els.roundtableManuscript.textContent || "";
  const wasNearBottom = isRoundtablePaperNearBottom() || rt.paperAtBottom;
  if (previousText !== nextText) {
    const grew = nextText.length > Math.max(previousText.length, rt.paperTextLength || 0);
    els.roundtableManuscript.textContent = nextText;
    rt.paperTextLength = nextText.length;
    if (grew && !wasNearBottom) {
      rt.paperHasNewProse = true;
      restoreRoundtablePaperScroll();
    } else if (wasNearBottom) {
      rt.paperHasNewProse = false;
      scrollRoundtablePaperBottom({ silent: true });
    } else {
      restoreRoundtablePaperScroll();
    }
  } else if (rt.paperAtBottom) {
    scrollRoundtablePaperBottom({ silent: true });
  } else {
    restoreRoundtablePaperScroll();
  }
}

function syncRoundtablePaper() {
  if (!els.roundtablePaper) return;
  const metrics = getRoundtablePaperMetrics();
  const isDeepCollapsed = !paperDrag.active && metrics.reveal <= PAPER_DEEP_COLLAPSE_THRESHOLD;
  const displayReveal = isDeepCollapsed ? 0 : metrics.reveal;
  const chromeProgress = clamp(metrics.reveal / PAPER_DEEP_COLLAPSE_THRESHOLD, 0, 1);
  els.roundtablePaper.style.setProperty("--paper-body-height", `${isDeepCollapsed ? 0 : metrics.currentHeight}px`);
  els.roundtablePaper.style.setProperty("--paper-progress", `${displayReveal.toFixed(3)}`);
  els.roundtablePaper.style.setProperty("--paper-chrome-top", `${Math.round(6 + 7 * chromeProgress)}px`);
  els.roundtablePaper.style.setProperty("--paper-chrome-bottom", `${Math.round(18 + 20 * chromeProgress)}px`);
  els.roundtablePaper.style.setProperty("--paper-meta-height", `${Math.round(28 * chromeProgress)}px`);
  els.roundtablePaper.style.setProperty("--paper-meta-margin", `${Math.round(9 * chromeProgress)}px`);
  els.roundtablePaper.style.setProperty("--paper-meta-opacity", `${chromeProgress.toFixed(3)}`);
  els.roundtablePaper.classList.toggle("paper-peek", displayReveal < 0.96);
  els.roundtablePaper.classList.toggle("paper-deep-collapsed", isDeepCollapsed);
  if (els.roundtablePaperGripLabel) {
    els.roundtablePaperGripLabel.textContent = `${Math.round(displayReveal * 100)}%`;
  }
  if (els.roundtablePaperGrip) {
    els.roundtablePaperGrip.dataset.state = displayReveal < 0.32 ? "collapsed" : displayReveal > 0.8 ? "expanded" : "mid";
  }
}

function setRoundtablePaperReveal(nextReveal, options = {}) {
  const rt = roundtableState();
  rt.paperReveal = clamp(nextReveal, 0, 1);
  syncRoundtablePaper();
  if (els.roundtablePaperStatus) {
    els.roundtablePaperStatus.textContent = getRoundtablePaperStatus();
  }
  if (!options.silent) {
    touchSession(activeSession());
    persistState(state);
  }
}

function toggleRoundtablePaperReveal() {
  if (Date.now() < paperGripSuppressClickUntil) return;
  const reveal = roundtableState().paperReveal;
  setRoundtablePaperReveal(reveal > 0.72 ? 0 : 1);
}

function renderMessages() {
  const path = activePath();
  if (!path.length) {
    els.messages.innerHTML = "";
    return;
  }
  els.messages.innerHTML = path.map(renderMessage).join("");
}

function renderAvatar(role) {
  if (role === "user") {
    const appearance = sessionAppearance();
    const label = (clean(appearance.userName) || "我").slice(0, 1);
    const avatar = clean(appearance.userAvatarDataUrl)
      ? `<img src="${escapeHtml(appearance.userAvatarDataUrl)}" alt="${escapeHtml(clean(appearance.userName) || "我")}" />`
      : escapeHtml(label);
    return `<div class="avatar">${avatar}</div>`;
  }
  return `<div class="avatar">AI</div>`;
}

function renderChatAvatar(role) {
  if (role === "user") {
    const appearance = sessionAppearance();
    const label = (clean(appearance.userName) || "我").slice(0, 1);
    const avatar = clean(appearance.userAvatarDataUrl)
      ? `<img src="${escapeHtml(appearance.userAvatarDataUrl)}" alt="${escapeHtml(clean(appearance.userName) || "我")}" />`
      : escapeHtml(label);
    return `<div class="chat-avatar user-chat-avatar">${avatar}</div>`;
  }
  return `<div class="chat-avatar assistant-chat-avatar">AI</div>`;
}

function renderMessage(node) {
  const content = getMessageContent(node);
  const version = getAssistantVersion(node);
  const usage = version?.usage?.total_tokens ? ` · ${formatK(version.usage.total_tokens)} tok` : "";
  const meta = `${content.length}字 · ${formatTime(version?.createdAt || node.createdAt)}${usage}`;
  const isUser = node.role === "user";
  const versionIndex = node.role === "assistant" ? Math.max(0, node.versions.findIndex((item) => item.id === node.activeVersionId)) + 1 : 1;
  const failedClass = node.role === "assistant" && /^请求失败[:：]/.test(clean(content)) ? " failed" : "";
  const switcher = node.role === "assistant"
    ? node.versions.length > 1
    ? `<div class="switcher">
        <button type="button" data-command="prev-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""}>‹</button>
        <span>${versionIndex}/${node.versions.length}</span>
        <button type="button" data-command="next-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""}>›</button>
      </div>`
    : ""
    : renderBranchSwitcher(node);
  return `
    <article class="chat-row ${isUser ? "is-user" : "is-assistant"}${failedClass}" data-node-id="${node.id}">
      ${renderChatAvatar(node.role)}
      <div class="chat-main">
        <div class="chat-bubble chat-speech" data-command="toggle-menu" data-node-id="${node.id}"><span class="message-content">${escapeHtml(content)}</span>${isGenerating && generatingNodeId === node.id ? '<span class="stream-caret"></span>' : ""}</div>
        ${isUser ? "" : `<div class="message-meta chat-message-meta">${escapeHtml(meta)}</div>`}
        ${switcher}
      </div>
    </article>
  `;
}

function renderBranchSwitcher(node) {
  const parent = getNode(node.parentId);
  if (!parent || parent.children.length < 2) return "";
  const index = parent.children.indexOf(node.id) + 1;
  return `<div class="switcher">
    <button type="button" data-command="prev-branch" data-node-id="${node.id}">‹</button>
    <span>${index}/${parent.children.length}</span>
    <button type="button" data-command="next-branch" data-node-id="${node.id}">›</button>
  </div>`;
}

function renderMenu() {
  if (activeRoundtableMessageId) {
    renderRoundtableMenu();
    return;
  }
  const node = activeMenuNodeId ? getNode(activeMenuNodeId) : null;
  if (!node) {
    els.menu.hidden = true;
    els.menu.innerHTML = "";
    return;
  }
  const userActions = `
    <button type="button" data-command="edit-user" data-node-id="${node.id}">编辑内容</button>
    <button type="button" data-command="resend-user" data-node-id="${node.id}">重新发送</button>
    <button type="button" data-command="copy-message" data-node-id="${node.id}">复制</button>
    <button type="button" data-command="delete-message" data-node-id="${node.id}">删除</button>
  `;
  const assistantActions = `
    <button type="button" data-command="regen-ai" data-node-id="${node.id}">重新生成</button>
    <button type="button" data-command="edit-ai" data-node-id="${node.id}">编辑AI输出</button>
    <button type="button" data-command="continue-ai" data-node-id="${node.id}">继续</button>
    <button type="button" data-command="copy-message" data-node-id="${node.id}">复制</button>
    <button type="button" data-command="delete-message" data-node-id="${node.id}">删除</button>
  `;
  els.menu.innerHTML = node.role === "user" ? userActions : assistantActions;
  els.menu.hidden = false;
}

function renderRoundtableMenu() {
  const message = getRoundtableMessage(activeRoundtableMessageId);
  if (!message) {
    activeRoundtableMessageId = null;
    els.menu.hidden = true;
    els.menu.innerHTML = "";
    return;
  }
  const canRegenerate = message.speakerId !== "user";
  const isWriter = message.speakerId === "writer";
  const canDecide = message.speakerId !== "user" && !isWriter;
  const isReview = message.speakerId === "review";
  els.menu.innerHTML = `
    <button type="button" data-command="copy-roundtable-message" data-round-id="${message.id}">复制</button>
    <button type="button" data-command="send-roundtable-to-main" data-round-id="${message.id}">发回主线</button>
    <button type="button" data-command="adopt-roundtable-message" data-round-id="${message.id}">让写手采纳</button>
    ${canDecide ? `<button type="button" data-command="mark-roundtable-adopted" data-round-id="${message.id}">标记采纳</button>` : ""}
    ${canDecide ? `<button type="button" data-command="mark-roundtable-ignored" data-round-id="${message.id}">标记忽略</button>` : ""}
    ${isReview ? `<button type="button" data-command="mark-roundtable-approved" data-round-id="${message.id}">审稿通过</button>` : ""}
    ${isReview ? `<button type="button" data-command="mark-roundtable-revision" data-round-id="${message.id}">需修改</button>` : ""}
    ${isWriter ? `<button type="button" data-command="locate-writer-segment" data-round-id="${message.id}">定位正文</button>` : ""}
    ${isWriter ? `<button type="button" data-command="undo-writer-sync" data-round-id="${message.id}">撤回正文</button>` : ""}
    ${isWriter ? `<button type="button" data-command="rewrite-writer-sync" data-round-id="${message.id}">重写并替换</button>` : ""}
    ${isWriter ? `<button type="button" data-command="hide-writer-message" data-round-id="${message.id}">仅保留正文</button>` : ""}
    ${canRegenerate ? `<button type="button" data-command="regen-roundtable-message" data-round-id="${message.id}">重新回答</button>` : ""}
    <button type="button" data-command="delete-roundtable-message" data-round-id="${message.id}">删除</button>
  `;
  els.menu.hidden = false;
}

function renderSessions() {
  const query = clean(els.historySearch.value).toLowerCase();
  drawSessions(els, state.sessions, state.activeSessionId, query, {
    activePath,
    titleForSession,
    escapeHtml,
    formatTime,
  });
}

function renderAvatarPreview(element, dataUrl, fallback) {
  if (!element) return;
  element.innerHTML = clean(dataUrl)
    ? `<img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(fallback || "头像")}" />`
    : escapeHtml((fallback || "头像").slice(0, 1));
}

function renderBackgroundPreview(element, dataUrl) {
  if (!element) return;
  element.style.backgroundImage = clean(dataUrl) ? `url("${dataUrl}")` : "";
  element.classList.toggle("empty", !clean(dataUrl));
}

function renderSettings() {
  const s = sessionSettings();
  const api = apiSettings();
  const appearance = sessionAppearance();
  if (document.activeElement !== els.systemPrompt) els.systemPrompt.value = s.systemPrompt;
  if (document.activeElement !== els.baseUrl) els.baseUrl.value = api.baseUrl;
  if (document.activeElement !== els.apiKey) els.apiKey.value = api.apiKey;
  if (document.activeElement !== els.modelInput) els.modelInput.value = s.model;
  if (els.userNameInput && document.activeElement !== els.userNameInput) els.userNameInput.value = clean(appearance.userName) || "我";
  renderAvatarPreview(els.userAvatarPreview, appearance.userAvatarDataUrl, clean(appearance.userName) || "我");
  renderBackgroundPreview(els.sessionBackgroundPreview, appearance.backgroundDataUrl);
  if (document.activeElement !== els.contextCount) els.contextCount.value = s.contextCount;
  if (document.activeElement !== els.maxTokens) els.maxTokens.value = s.maxTokens;
  els.temperature.value = s.temperature;
  els.temperatureLabel.textContent = Number(s.temperature).toFixed(2);
  els.unlimitedContext.checked = s.unlimitedContext;
  els.stream.checked = s.stream;
  els.layoutInputs.forEach((input) => {
    const key = input.dataset.layoutKey;
    if (document.activeElement !== input) input.value = s.layout[key];
  });
  els.layoutValues.forEach((value) => {
    const key = value.dataset.layoutValue;
    value.textContent = formatLayoutValue(key, s.layout[key]);
  });
}

function renderCustomLayoutPresets() {
  if (!els.customLayoutPresets) return;
  const presets = sessionSettings().layoutPresets || [];
  els.customLayoutPresets.innerHTML = presets.length
    ? presets.map((preset) => `
      <div class="custom-preset-item">
        <button type="button" data-command="layout-custom-preset" data-preset-id="${escapeHtml(preset.id)}">${escapeHtml(preset.name)}</button>
        <button type="button" data-command="delete-layout-preset" data-preset-id="${escapeHtml(preset.id)}">删除</button>
      </div>
    `).join("")
    : `<p class="muted">还没有自定义排版预设。</p>`;
}

function renderNovelPanel() {
  const novel = sessionNovel();
  els.novelFields.forEach((field) => {
    const key = field.dataset.novelKey;
    if (document.activeElement !== field) field.value = novel[key] || "";
  });
  if (els.novelStats) {
    const stats = buildNovelStats(novel);
    const items = [
      `正文 ${stats.bodyLength} 字`,
      `剧情线 ${stats.plotlineLength} 字`,
      `资料估算 ${formatK(stats.memoryTokens)} token`,
    ];
    els.novelStats.innerHTML = items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }
  renderNovelVersions();
  renderNovelSegments();
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${Math.round(size / 1024 / 102.4) / 10} MB`;
  if (size >= 1024) return `${Math.round(size / 102.4) / 10} KB`;
  return `${size} B`;
}

function workspaceCategoryForFile(file) {
  const name = clean(file.name).toLowerCase();
  const type = clean(file.type).toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop() : "";
  if (/(正文|章节|chapter|manuscript|draft)/i.test(name) && ["txt", "md", "markdown", "doc", "docx"].includes(ext)) return "正文草稿";
  if (/(角色|人物|character|cast)/i.test(name)) return "角色资料";
  if (/(世界|设定|setting|world|lore)/i.test(name)) return "世界观";
  if (/(大纲|剧情|plot|outline|beat)/i.test(name)) return "剧情大纲";
  if (/(伏笔|foreshadow|clue)/i.test(name)) return "伏笔线";
  if (type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "视觉参考";
  if (type.startsWith("audio/") || ["mp3", "wav", "m4a", "flac"].includes(ext)) return "声音资料";
  if (["txt", "md", "markdown", "rtf"].includes(ext)) return "文本资料";
  if (["json", "yaml", "yml", "csv"].includes(ext)) return "结构化资料";
  if (["pdf", "doc", "docx", "epub"].includes(ext)) return "参考文档";
  return "未分类";
}

function renderWorkspacePanel() {
  ensureWorkspaceUi();
  if (!els.workspacePanel) return;
  const workspace = sessionWorkspace();
  if (els.workspacePathInput && document.activeElement !== els.workspacePathInput) {
    els.workspacePathInput.value = workspace.path;
  }
  const files = workspace.files || [];
  const totalSize = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
  if (els.workspaceStats) {
    els.workspaceStats.innerHTML = [
      `路径 ${workspace.path ? "已设置" : "未设置"}`,
      `${files.length} 个文件`,
      formatBytes(totalSize),
    ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }
  if (!els.workspaceFileGroups) return;
  if (!files.length) {
    els.workspaceFileGroups.innerHTML = `<p class="muted">还没有加入文件。可以先添加 TXT、MD、图片、PDF、DOCX 等小说资料。</p>`;
    return;
  }
  const groups = files.reduce((map, file) => {
    const category = clean(file.category) || "未分类";
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(file);
    return map;
  }, new Map());
  els.workspaceFileGroups.innerHTML = [...groups.entries()].map(([category, items]) => `
    <section class="workspace-group">
      <div class="workspace-group-head">
        <strong>${escapeHtml(category)}</strong>
        <span>${items.length}</span>
      </div>
      ${items.map((file) => `
        <article class="workspace-file-item">
          <div>
            <b>${escapeHtml(file.name)}</b>
            <small>${escapeHtml(file.ext || "file")} · ${escapeHtml(formatBytes(file.size))} · ${escapeHtml(formatTime(file.addedAt))}</small>
          </div>
          <button type="button" data-command="remove-workspace-file" data-file-id="${escapeHtml(file.id)}">移除</button>
        </article>
      `).join("")}
    </section>
  `).join("");
}

function renderNovelVersions() {
  if (!els.novelVersionList) return;
  const versions = sessionNovel().versions || [];
  if (!versions.length) {
    els.novelVersionList.innerHTML = `<p class="muted">还没有正文版本。</p>`;
    return;
  }
  els.novelVersionList.innerHTML = `
    <div class="novel-version-head">
      <strong>正文版本</strong>
      <span>${versions.length}/40</span>
    </div>
    ${versions.slice(0, 8).map((version) => `
      <article class="novel-version-item">
        <div>
          <b>${escapeHtml(version.name || "未命名版本")}</b>
          <small>${escapeHtml(formatTime(version.createdAt))} · ${clean(version.body).length} 字</small>
        </div>
        <div class="novel-version-actions">
          <button type="button" data-command="restore-manuscript-version" data-version-id="${escapeHtml(version.id)}">恢复</button>
          <button type="button" data-command="delete-manuscript-version" data-version-id="${escapeHtml(version.id)}">删除</button>
        </div>
      </article>
    `).join("")}
  `;
}

function getWriterManuscriptSegments() {
  return buildWriterManuscriptSegments(roundtableState().messages, sessionNovel().body);
}

function renderNovelSegments() {
  if (!els.novelSegmentList) return;
  const segments = getWriterManuscriptSegments();
  if (!segments.length) {
    els.novelSegmentList.innerHTML = "";
    return;
  }
  els.novelSegmentList.innerHTML = `
    <div class="novel-version-head">
      <strong>写手正文片段</strong>
      <span>${segments.length}</span>
    </div>
    ${segments.slice(-12).reverse().map(({ message, content, stillLinked }) => `
      <article class="novel-segment-item ${stillLinked ? "" : "is-stale"}">
        <div>
          <b>${escapeHtml(message.speakerName || "写手")} · ${escapeHtml(formatTime(message.createdAt))}</b>
          <small>${stillLinked ? "已关联正文" : "正文已改动"} · ${content.length} 字 · ${escapeHtml(content.slice(0, 42))}</small>
        </div>
        <div class="novel-version-actions">
          <button type="button" data-command="locate-writer-segment" data-round-id="${escapeHtml(message.id)}">定位</button>
          <button type="button" data-command="rewrite-writer-sync" data-round-id="${escapeHtml(message.id)}">重写</button>
          <button type="button" data-command="hide-writer-message" data-round-id="${escapeHtml(message.id)}">仅留正文</button>
          <button type="button" data-command="undo-writer-sync" data-round-id="${escapeHtml(message.id)}">撤回</button>
        </div>
      </article>
    `).join("")}
  `;
}

function formatLayoutValue(key, value) {
  if (key === "messageLineHeight") return `${value}%`;
  return `${value}px`;
}

function renderModelPicker() {
  ensureModelPickerUi();
  ensureAssistantModelPickerUi();
  const settings = sessionSettings();
  const models = Array.from(new Set([settings.model, ...apiSettings().models].filter(Boolean)));
  els.modelSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  els.modelSelect.value = settings.model;
  if (els.modelSelectButton) {
    els.modelSelectButton.textContent = settings.model || "选择模型";
    els.modelSelectButton.classList.toggle("active", modelPickerOpen);
    els.modelSelectButton.setAttribute("aria-expanded", String(modelPickerOpen));
  }
  if (els.modelPickerPanel) {
    els.modelPickerPanel.hidden = !modelPickerOpen;
    els.modelPickerPanel.innerHTML = `
      <div class="model-picker-head">
        <strong>选择模型</strong>
        <button type="button" data-command="toggle-model-picker" aria-label="关闭模型列表">×</button>
      </div>
      <div class="model-picker-list">
        ${models.map((model) => `
          <button class="${model === settings.model ? "selected" : ""}" type="button" data-command="select-model" data-model="${escapeHtml(model)}">
            <span>${escapeHtml(model)}</span>
            ${model === settings.model ? "<b>当前</b>" : ""}
          </button>
        `).join("")}
      </div>
    `;
  }
  els.modelDatalist.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
  renderAssistantModelPicker(models);
}

function renderAssistantModelPicker(models = null) {
  ensureAssistantModelPickerUi();
  if (!els.assistantModelPicker || !els.assistantModelPickerButton) return;
  const current = clean(els.assistantModelInput?.value) || sessionSettings().model;
  const items = Array.from(new Set([current, sessionSettings().model, ...apiSettings().models].filter(Boolean))).sort();
  const list = models || items;
  els.assistantModelPickerButton.classList.toggle("active", assistantModelPickerOpen);
  els.assistantModelPickerButton.setAttribute("aria-expanded", String(assistantModelPickerOpen));
  els.assistantModelPicker.hidden = !assistantModelPickerOpen;
  els.assistantModelPicker.innerHTML = list.length
    ? list.map((model) => `
        <button class="${model === current ? "selected" : ""}" type="button" data-command="select-assistant-model" data-model="${escapeHtml(model)}">
          <span>${escapeHtml(model)}</span>
          ${model === current ? "<b>当前</b>" : ""}
        </button>
      `).join("")
    : `<p class="muted">还没有模型。先拉取此议员模型，或直接手动输入。</p>`;
}

function toggleModelPicker(force) {
  modelPickerOpen = typeof force === "boolean" ? force : !modelPickerOpen;
  renderModelPicker();
}

function selectModelFromPicker(model) {
  setActiveModel(model);
  modelPickerOpen = false;
  render();
  persistState(state);
}

function toggleAssistantModelPicker(force) {
  assistantModelPickerOpen = typeof force === "boolean" ? force : !assistantModelPickerOpen;
  renderAssistantModelPicker();
}

function selectAssistantModelFromPicker(model) {
  if (!els.assistantModelInput) return;
  els.assistantModelInput.value = clean(model);
  assistantModelPickerOpen = false;
  if (els.assistantModelStatus) els.assistantModelStatus.textContent = `当前：${clean(model)}`;
  renderAssistantModelPicker();
}

function renderContextBadge() {
  const info = contextInfo(clean(els.input.value));
  drawContextBadge(els, info, formatK);
}

function renderContextPanel() {
  const info = contextInfo(clean(els.input.value));
  drawContextPanel(els, info, sessionSettings(), escapeHtml, formatK);
}

function setActiveModel(model) {
  const value = clean(model);
  if (!value) return;
  sessionSettings().model = value;
  const api = apiSettings();
  api.models = Array.from(new Set([value, ...api.models]));
}

function openEditor(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  const version = node.role === "assistant" ? getAssistantVersion(node) : null;
  editTarget = { nodeId, role: node.role, versionId: version?.id || null };
  els.editTitle.textContent = node.role === "assistant" ? "编辑 AI 输出" : "编辑内容";
  els.editText.value = node.role === "assistant" ? version?.content || "" : getMessageContent(node);
  els.saveEdit.textContent = "保存";
  els.saveSendEdit.textContent = node.role === "assistant" ? "保存并继续" : "保存并重新发送";
  els.saveSendEdit.style.display = "";
  els.editDialog.showModal();
  requestAnimationFrame(() => els.editText.focus());
}

function closeEditor() {
  editTarget = null;
  if (els.editDialog.open) els.editDialog.close();
}

async function saveEditor(sendAfterSave = false) {
  if (!editTarget) return;
  const text = clean(els.editText.value);
  if (!text) return showToast("内容不能为空");
  const node = getNode(editTarget.nodeId);
  if (!node) return;
  if (node.role === "assistant") {
    const version = getAssistantVersionById(node, editTarget.versionId);
    if (!version) return;
    setAssistantVersionContent(node, version, text);
    version.usage = null;
    version.createdAt = Date.now();
    closeEditor();
    touchSession(activeSession());
    render();
    if (sendAfterSave) await continueFromAssistant(node.id);
    else showToast("已直接修改 AI 输出");
    return;
  }
  if (sendAfterSave) {
    closeEditor();
    await editUserBranch(node.id, text);
    return;
  }
  node.content = text;
  node.createdAt = Date.now();
  closeEditor();
  touchSession(activeSession());
  render();
  showToast("已修改用户内容");
}

async function appendUserMessage(text) {
  const session = activeSession();
  const path = activePath(session);
  const parent = path[path.length - 1] || getNode(session.rootId, session);
  const user = createNode("user", parent.id, text);
  appendChild(session, parent, user);
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  appendChild(session, user, assistant);
  touchSession(session);
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(assistant.id, text, assistant.versions[0].id);
}

async function editUserBranch(nodeId, text) {
  if (isGenerating) return;
  const old = getNode(nodeId);
  const parent = getNode(old?.parentId);
  if (!old || !parent) return;
  const user = createNode("user", parent.id, text);
  appendChild(activeSession(), parent, user);
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  appendChild(activeSession(), user, assistant);
  touchSession(activeSession());
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(assistant.id, text, assistant.versions[0].id);
}

async function resendUser(nodeId) {
  if (isGenerating) return;
  const user = getNode(nodeId);
  if (!user || user.role !== "user") return;
  const assistant = getNode(user.activeChildId);
  if (!assistant || assistant.role !== "assistant") return;
  const version = createAssistantVersion("");
  assistant.versions.push(version);
  assistant.activeVersionId = version.id;
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(assistant.id, user.content, version.id);
}

async function regenerateAssistant(nodeId) {
  if (isGenerating) return;
  const assistant = getNode(nodeId);
  const user = getNode(assistant?.parentId);
  if (!assistant || assistant.role !== "assistant" || !user) return;
  const version = createAssistantVersion("");
  assistant.versions.push(version);
  assistant.activeVersionId = version.id;
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(assistant.id, user.role === "user" ? user.content : "", version.id);
}

async function continueFromAssistant(nodeId) {
  if (isGenerating) return;
  const assistant = getNode(nodeId);
  if (!assistant || assistant.role !== "assistant") return;
  const next = createNode("assistant", assistant.id, "");
  next.activeVersionId = next.versions[0].id;
  appendChild(activeSession(), assistant, next);
  touchSession(activeSession());
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(next.id, "", next.versions[0].id, true);
}

function validateApi(settings = sessionSettings(), api = apiSettings()) {
  if (!clean(api.apiKey)) throw new Error("请先在设置里填写 API Key");
  if (!clean(settings.model)) throw new Error("请先选择或填写模型");
}

async function generateIntoAssistant(nodeId, userText, versionId, continueMode = false) {
  validateApi();
  const node = getNode(nodeId);
  const version = node?.versions.find((item) => item.id === versionId);
  if (!node || !version) return;
  isGenerating = true;
  abortController = new AbortController();
  streamRequestId = null;
  generatingNodeId = nodeId;
  activeMenuNodeId = nodeId;
  setAssistantVersionContent(node, version, "");
  version.usage = null;
  try {
    await ensureAutoCompressNovelMemory(continueMode ? CONTINUE_PROMPT : userText, nodeId);
  } catch (error) {
    if (error.name === "AbortError") throw error;
    showToast(humanizeError(error, "自动压缩失败，已改用现有资料继续"));
  }
  const contextCompression = getAutoContextCompressedInfo(continueMode ? CONTINUE_PROMPT : userText);
  if (contextCompression.compressed) showToast("上下文过长，已自动使用小说资料压缩续写");
  render();
  try {
    const result = sessionSettings().stream
      ? await callOpenAIStream((partial) => {
          setAssistantVersionContent(node, version, partial);
          renderStreamingNode(nodeId, versionId);
        }, nodeId, continueMode)
      : await callOpenAI(nodeId, continueMode);
    cancelStreamDomUpdate(`main:${nodeId}`);
    setAssistantVersionContent(node, version, result.content);
    version.usage = result.usage || null;
    version.createdAt = Date.now();
    touchSession(activeSession());
  } catch (error) {
    if (error.name !== "AbortError") {
      const message = humanizeError(error, "生成失败");
      version.content = version.content || `请求失败：${message}`;
      showToast(message);
    }
  } finally {
    isGenerating = false;
    abortController = null;
    bridgeRequestId = null;
    streamRequestId = null;
    generatingNodeId = null;
    cancelStreamDomUpdate(`main:${nodeId}`);
    render();
  }
}

function renderStreamingNode(nodeId, versionId) {
  const node = getNode(nodeId);
  const version = node?.versions.find((item) => item.id === versionId);
  const card = els.messages.querySelector(`[data-node-id="${nodeId}"] .chat-speech`);
  if (!card || !version) {
    render();
    return;
  }
  const contentElement = card.querySelector(".message-content");
  if (!contentElement) return render();
  scheduleStreamDomUpdate(`main:${nodeId}`, () => {
    contentElement.textContent = version.content || "";
    if (!card.querySelector(".stream-caret")) {
      contentElement.insertAdjacentHTML("afterend", '<span class="stream-caret"></span>');
    }
  });
}

function stopGeneration() {
  if (!isGenerating) return;
  abortController?.abort();
  bridgeClient.cancelBridgeRequest(bridgeRequestId);
  if (streamRequestId && bridgeStreamCallbacks.has(streamRequestId)) {
    bridgeClient.cancelBridgeRequest(streamRequestId);
  }
  isGenerating = false;
  abortController = null;
  bridgeRequestId = null;
  streamRequestId = null;
  generatingNodeId = null;
  cancelStreamDomUpdate();
  showToast("已停止生成");
  render();
}

function requestMessages(assistantNodeId, continueMode = false) {
  return contextMessages(continueMode ? CONTINUE_PROMPT : "", assistantNodeId);
}

async function callOpenAI(assistantNodeId, continueMode = false) {
  return aiClient.generate({
    api: apiSettings(),
    settings: sessionSettings(),
    messages: requestMessages(assistantNodeId),
    continueMode,
    continuePrompt: CONTINUE_PROMPT,
  });
}

async function callOpenAIText(messages) {
  validateApi();
  abortController = new AbortController();
  try {
    return await aiClient.generateText({
      api: apiSettings(),
      settings: sessionSettings(),
      messages,
    });
  } finally {
    abortController = null;
    bridgeRequestId = null;
  }
}

async function callOpenAITextWithSettings(messages, settingsOverride, apiOverride = null) {
  const api = apiOverride || apiSettings();
  validateApi(settingsOverride || sessionSettings(), api);
  abortController = new AbortController();
  try {
    return await aiClient.generateText({
      api,
      settings: settingsOverride || sessionSettings(),
      messages,
    });
  } finally {
    if (!roundtableGenerating) {
      abortController = null;
      bridgeRequestId = null;
    }
  }
}

async function callOpenAITextStreamWithSettings(messages, settingsOverride, apiOverride = null, onChunk = null) {
  const api = apiOverride || apiSettings();
  validateApi(settingsOverride || sessionSettings(), api);
  abortController = new AbortController();
  streamRequestId = null;
  try {
    const result = await aiClient.generateStream({
      api,
      settings: settingsOverride || sessionSettings(),
      messages,
      onChunk: (partial) => onChunk?.(partial),
    });
    return clean(result.content);
  } finally {
    if (!roundtableGenerating) {
      abortController = null;
      bridgeRequestId = null;
      streamRequestId = null;
    }
  }
}

async function callOpenAIStream(onChunk, assistantNodeId, continueMode = false) {
  return aiClient.generateStream({
    api: apiSettings(),
    settings: sessionSettings(),
    messages: requestMessages(assistantNodeId),
    onChunk,
    continueMode,
    continuePrompt: CONTINUE_PROMPT,
  });
}

async function fetchModels() {
  try {
    validateApi();
    els.modelStatus.textContent = "正在拉取...";
    const api = apiSettings();
    const settings = sessionSettings();
    const data = await aiClient.fetchModels({ api });
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "模型拉取失败");
    const models = (data.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("没有读取到模型");
    api.models = Array.from(new Set([settings.model, ...models].filter(Boolean)));
    if (!settings.model) settings.model = models[0];
    els.modelStatus.textContent = `已拉取 ${models.length} 个`;
    render();
  } catch (error) {
    const message = humanizeError(error, "模型拉取失败");
    els.modelStatus.textContent = message;
    showToast(message);
  }
}

async function fetchAssistantModels() {
  if (!assistantConfigTargetId) return;
  try {
    const api = {
      ...apiSettings(),
      baseUrl: clean(els.assistantBaseUrlInput?.value) || apiSettings().baseUrl,
      apiKey: clean(els.assistantApiKeyInput?.value) || apiSettings().apiKey,
    };
    if (!clean(api.apiKey)) throw new Error("请先填写此议员或全局 API Key");
    if (els.assistantModelStatus) els.assistantModelStatus.textContent = "正在拉取...";
    if (els.fetchAssistantModels) els.fetchAssistantModels.disabled = true;
    const data = await aiClient.fetchModels({ api });
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "模型拉取失败");
    const models = (data.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("没有读取到模型");
    const globalApi = apiSettings();
    globalApi.models = Array.from(new Set([sessionSettings().model, clean(els.assistantModelInput?.value), ...models].filter(Boolean)));
    if (!clean(els.assistantModelInput?.value)) {
      els.assistantModelInput.value = models[0];
    }
    if (els.assistantModelStatus) els.assistantModelStatus.textContent = `已拉取 ${models.length} 个`;
    renderModelPicker();
    renderAssistantModelPicker();
    persistState(state);
  } catch (error) {
    const message = humanizeError(error, "议员模型拉取失败");
    if (els.assistantModelStatus) els.assistantModelStatus.textContent = message;
    showToast(message);
  } finally {
    if (els.fetchAssistantModels) els.fetchAssistantModels.disabled = false;
  }
}

function switchSibling(nodeId, delta) {
  const node = getNode(nodeId);
  const parent = getNode(node?.parentId);
  if (!node || !parent || parent.children.length < 2) return;
  const index = parent.children.indexOf(node.id);
  const next = (index + delta + parent.children.length) % parent.children.length;
  parent.activeChildId = parent.children[next];
  activeMenuNodeId = null;
  render();
}

function switchVersion(nodeId, delta) {
  const node = getNode(nodeId);
  if (!node || node.role !== "assistant" || node.versions.length < 2) return;
  const index = node.versions.findIndex((item) => item.id === node.activeVersionId);
  const next = (index + delta + node.versions.length) % node.versions.length;
  node.activeVersionId = node.versions[next].id;
  activeMenuNodeId = null;
  render();
}

function deleteMessage(nodeId) {
  if (isGenerating) return showToast("生成中不能删除消息");
  const session = activeSession();
  const node = getNode(nodeId, session);
  const parent = getNode(node?.parentId, session);
  if (!node || !parent) return;
  const index = parent.children.indexOf(node.id);
  const childIds = node.children.filter((id) => getNode(id, session));
  childIds.forEach((id) => {
    session.nodes[id].parentId = parent.id;
  });
  if (index >= 0) parent.children.splice(index, 1, ...childIds);
  delete session.nodes[node.id];
  if (parent.activeChildId === node.id) {
    parent.activeChildId = childIds.includes(node.activeChildId)
      ? node.activeChildId
      : parent.children[Math.max(0, Math.min(index, parent.children.length - 1))] || null;
  }
  activeMenuNodeId = null;
  touchSession(session);
  render();
  showToast("已删除这条消息，分支已保留");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("已复制");
}

function newSession() {
  const session = createSession();
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  activeMenuNodeId = null;
  activeRoundtableMessageId = null;
  closePanels();
  render();
}

function stopRoundtableGeneration() {
  if (!roundtableGenerating) return showToast("当前没有圆桌生成任务");
  roundtableShouldStop = true;
  abortController?.abort();
  bridgeClient.cancelBridgeRequest(bridgeRequestId);
  bridgeClient.cancelBridgeRequest(streamRequestId);
  roundtableGenerating = false;
  abortController = null;
  bridgeRequestId = null;
  streamRequestId = null;
  showToast("已停止圆桌生成");
  render();
}

async function sendRoundtableMessageToMain(id) {
  if (isGenerating || roundtableGenerating || materialGenerating) return showToast("已有生成任务进行中");
  const message = getRoundtableMessage(id);
  const content = clean(message?.content);
  if (!message || !content) return;
  const text = `圆桌消息：${message.speakerName}\n\n${content}`;
  roundtableState().enabled = false;
  activeRoundtableMessageId = null;
  render();
  resizeInput();
  await appendUserMessage(text);
}

function switchSession(sessionId) {
  if (isGenerating) return showToast("生成中不能切换会话");
  if (!state.sessions.some((session) => session.id === sessionId)) return;
  state.activeSessionId = sessionId;
  activeMenuNodeId = null;
  activeRoundtableMessageId = null;
  closePanels();
  render();
  scrollBottom();
}

function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const nextTitle = window.prompt("重命名会话", titleForSession(session));
  if (nextTitle === null) return;
  const title = clean(nextTitle);
  if (!title) return showToast("会话名不能为空");
  session.title = title;
  touchSession(session);
  render();
  persistState(state);
  showToast("会话已重命名");
}

function copySession(sessionId) {
  const source = state.sessions.find((session) => session.id === sessionId);
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = uid("sess");
  copy.title = `${titleForSession(source)} 副本`;
  copy.createdAt = Date.now();
  copy.updatedAt = Date.now();
  state.sessions.unshift(copy);
  state.activeSessionId = copy.id;
  render();
  showToast("已复制会话");
}

function deleteSession(sessionId) {
  if (state.sessions.length <= 1) {
    state.sessions = [createSession()];
    state.activeSessionId = state.sessions[0].id;
    render();
    return;
  }
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  if (state.activeSessionId === sessionId) state.activeSessionId = state.sessions[0].id;
  activeMenuNodeId = null;
  render();
}

function syncNovelFromFields() {
  const novel = sessionNovel();
  els.novelFields.forEach((field) => {
    novel[field.dataset.novelKey] = field.value;
  });
}

function saveNovel() {
  syncNovelFromFields();
  renderNovelPanel();
  renderContextBadge();
  persistState(state);
  showToast("小说资料已保存");
}

function saveManuscriptVersion(name = "手动保存") {
  syncNovelFromFields();
  const version = recordManuscriptVersion(name);
  if (!version) return showToast("正文库为空，无法保存版本");
  renderNovelPanel();
  persistState(state);
  showToast("正文版本已保存");
}

function recordManuscriptVersion(name = "正文版本", bodyOverride = null) {
  const novel = sessionNovel();
  const body = clean(bodyOverride ?? novel.body);
  if (!body) return null;
  const latest = novel.versions?.[0];
  if (latest && clean(latest.body) === body && latest.name === name) return latest;
  const version = {
    id: uid("novel_version"),
    name,
    body,
    createdAt: Date.now(),
  };
  novel.versions = [version, ...(novel.versions || [])].slice(0, 40);
  return version;
}

function restoreManuscriptVersion(id) {
  const novel = sessionNovel();
  const version = novel.versions.find((item) => item.id === id);
  if (!version) return;
  recordManuscriptVersion("恢复前备份");
  novel.body = clean(version.body);
  touchSession(activeSession());
  renderNovelPanel();
  renderContextBadge();
  render();
  persistState(state);
  showToast("已恢复正文版本");
}

function deleteManuscriptVersion(id) {
  const novel = sessionNovel();
  const before = novel.versions.length;
  novel.versions = novel.versions.filter((item) => item.id !== id);
  if (novel.versions.length === before) return;
  renderNovelPanel();
  persistState(state);
  showToast("已删除正文版本");
}

function readLocalImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("没有选择图片"));
    if (!LOCAL_IMAGE_TYPES.has(file.type)) return reject(new Error("请使用 PNG、JPG 或 WebP 图片"));
    if (file.size > LOCAL_IMAGE_MAX_BYTES) return reject(new Error("图片过大，请选择 2.5MB 以内的图片"));
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("图片读取失败")));
    reader.readAsDataURL(file);
  });
}

function importBodyFile() {
  els.bodyImportFile?.click();
}

async function handleBodyFileSelected() {
  const file = els.bodyImportFile?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    sessionNovel().body = clean(text);
    recordManuscriptVersion("TXT 导入");
    renderNovelPanel();
    renderContextBadge();
    persistState(state);
    showToast("正文 TXT 已导入");
  } catch (error) {
    showToast(humanizeError(error, "正文导入失败"));
  } finally {
    if (els.bodyImportFile) els.bodyImportFile.value = "";
  }
}

async function handleUserAvatarSelected() {
  const file = els.userAvatarFile?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readLocalImageDataUrl(file);
    const appearance = sessionAppearance();
    appearance.userAvatarDataUrl = dataUrl;
    touchSession(activeSession());
    render();
    persistState(state);
    showToast("用户头像已更新");
  } catch (error) {
    showToast(humanizeError(error, "用户头像读取失败"));
  } finally {
    if (els.userAvatarFile) els.userAvatarFile.value = "";
  }
}

async function handleSessionBackgroundSelected() {
  const file = els.sessionBackgroundFile?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readLocalImageDataUrl(file);
    const appearance = sessionAppearance();
    appearance.backgroundDataUrl = dataUrl;
    touchSession(activeSession());
    render();
    persistState(state);
    showToast("会话背景已更新");
  } catch (error) {
    showToast(humanizeError(error, "背景读取失败"));
  } finally {
    if (els.sessionBackgroundFile) els.sessionBackgroundFile.value = "";
  }
}

function updateSessionUserName() {
  const appearance = sessionAppearance();
  appearance.userName = clean(els.userNameInput?.value) || "我";
  touchSession(activeSession());
  renderMessages();
  renderRoundtable();
  renderSettings();
  persistState(state);
}

function clearUserAvatar() {
  sessionAppearance().userAvatarDataUrl = "";
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("用户头像已清除");
}

function clearSessionBackground() {
  sessionAppearance().backgroundDataUrl = "";
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("会话背景已清除");
}

function updateWorkspacePath() {
  sessionWorkspace().path = clean(els.workspacePathInput?.value);
  touchSession(activeSession());
  renderWorkspacePanel();
  persistState(state);
}

function chooseWorkspaceFiles() {
  ensureWorkspaceUi();
  els.workspaceFileInput?.click();
}

async function handleWorkspaceFilesSelected() {
  const selected = Array.from(els.workspaceFileInput?.files || []);
  if (!selected.length) return;
  const workspace = sessionWorkspace();
  const existing = new Map(workspace.files.map((file) => [`${file.name}:${file.size}:${file.lastModified || ""}`, file]));
  selected.forEach((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified || ""}`;
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    existing.set(key, {
      id: existing.get(key)?.id || uid("wfile"),
      name: file.name,
      size: file.size,
      type: file.type || "",
      ext,
      category: workspaceCategoryForFile(file),
      lastModified: file.lastModified || 0,
      addedAt: existing.get(key)?.addedAt || Date.now(),
    });
  });
  workspace.files = Array.from(existing.values()).slice(-WORKSPACE_FILE_LIMIT);
  touchSession(activeSession());
  renderWorkspacePanel();
  persistState(state);
  if (els.workspaceFileInput) els.workspaceFileInput.value = "";
  showToast(`已加入 ${selected.length} 个工作区文件`);
}

function clearWorkspaceFiles() {
  sessionWorkspace().files = [];
  touchSession(activeSession());
  renderWorkspacePanel();
  persistState(state);
  showToast("工作区文件列表已清空");
}

function removeWorkspaceFile(id) {
  const workspace = sessionWorkspace();
  workspace.files = workspace.files.filter((file) => file.id !== id);
  touchSession(activeSession());
  renderWorkspacePanel();
  persistState(state);
}

function exportBodyFile() {
  const text = clean(sessionNovel().body);
  if (!text) return showToast("正文库为空");
  downloadText(`TBird-正文-${Date.now()}.txt`, text);
  showToast("正文已导出为 TXT");
}

function syncBodyFromAssistant() {
  const bodyText = activePath()
    .filter((node) => node.role === "assistant")
    .map((node) => clean(getAssistantVersion(node)?.content || ""))
    .filter(Boolean)
    .join("\n\n");
  if (!bodyText) return showToast("当前会话还没有可同步的 AI 输出");
  sessionNovel().body = bodyText;
  recordManuscriptVersion("同步 AI 输出");
  renderNovelPanel();
  renderContextBadge();
  persistState(state);
  showToast("已按顺序同步全部 AI 输出到正文库");
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function novelPromptFor(target) {
  const labels = {
    plotline: "剧情线",
    characters: "角色卡",
    world: "世界观",
    outline: "大纲",
    foreshadows: "伏笔线",
  };
  const instructions = {
    plotline: "请根据正文库和最近对话，归纳当前剧情线。要求按时间顺序、保留关键因果、人物状态、冲突进展，不要续写新剧情。",
    characters: "请整理角色卡。按角色分条，包含身份定位、目标动机、关系、性格/口癖、当前状态。不要编造正文没有支撑的设定。",
    world: "请整理世界观。提取时代背景、阵营势力、规则制度、地点、技术/能力体系、禁忌与常识。不要另起设定。",
    outline: "请整理大纲。根据已有正文和对话，输出已发生内容、下一阶段可能目标、章节推进建议。不要写正式正文。",
    foreshadows: "请整理伏笔线。列出未回收伏笔、悬念、暗线、可能回收方式和相关人物。不要擅自回收。",
  };
  return {
    label: labels[target] || target,
    messages: [
      {
        role: "user",
        content: [
          "你是严谨的小说资料整理助手。只能整理、归纳、压缩用户提供的小说材料；除非明确要求，不要续写正文。",
          instructions[target] || "请整理小说资料。",
          getNovelSourceText() || "当前资料为空，请返回：暂无足够资料。",
        ].join("\n\n"),
      },
    ],
  };
}

async function generateNovelMaterial(target) {
  if (materialGenerating || isGenerating) return showToast("已有生成任务进行中");
  if (!["plotline", "characters", "world", "outline", "foreshadows"].includes(target)) return;
  syncNovelFromFields();
  materialGenerating = true;
  const { label, messages } = novelPromptFor(target);
  showToast(`正在生成${label}`);
  try {
    const text = await callOpenAIText(messages);
    sessionNovel()[target] = text;
    renderNovelPanel();
    renderContextBadge();
    persistState(state);
    showToast(`${label}已填充`);
  } catch (error) {
    showToast(humanizeError(error, `${label}生成失败`));
  } finally {
    materialGenerating = false;
  }
}

function toggleRoundtable() {
  const rt = roundtableState();
  rt.enabled = !rt.enabled;
  rt.membersOpen = false;
  activeMenuNodeId = null;
  activeRoundtableMessageId = null;
  closePanels();
  render();
  resizeInput();
  if (rt.enabled) showToast("已进入圆桌共创模式");
}

function toggleRoundtableMembers() {
  const rt = roundtableState();
  rt.membersOpen = !rt.membersOpen;
  render();
}

function toggleRoundtableMaterials() {
  const rt = roundtableState();
  rt.materialsOpen = !rt.materialsOpen;
  render();
}

function handleComposerTool() {
  if (roundtableState().enabled) {
    toggleRoundtableMembers();
    return;
  }
  showPanel("settings");
}

function toggleRoundtableRound() {
  if (roundtableGenerating) {
    stopRoundtableGeneration();
    return;
  }
  return startRoundtableRound();
}

function toggleRoundtableContextDock() {
  const rt = roundtableState();
  if (!rt.enabled) return;
  rt.contextOpen = !rt.contextOpen;
  render();
  resizeInput();
}

function toggleRoundtableMember(id) {
  const rt = roundtableState();
  if (!getRoundAssistantBase(id) || id === "writer") return;
  const index = rt.selectedIds.indexOf(id);
  if (index >= 0) rt.selectedIds.splice(index, 1);
  else rt.selectedIds.push(id);
  render();
}

function updateRoundtableContextOption(key, rawValue) {
  const rt = roundtableState();
  const options = normalizeRoundtableContextOptions(rt.contextOptions);
  if ([
    "includeManuscript",
    "includeNovel",
    "includePlotline",
    "includeCharacters",
    "includeWorld",
    "includeOutline",
    "includeForeshadows",
    "includeMainChat",
    "includeDiscussion",
  ].includes(key)) {
    options[key] = Boolean(rawValue);
  } else if (key === "excerptMax") {
    options.excerptMax = clamp(Number(rawValue) || DEFAULT_ROUNDTABLE_CONTEXT.excerptMax, 120, 2400);
  } else if (key === "discussionCount") {
    options.discussionCount = clamp(Number(rawValue) || 0, 0, 80);
  } else if (key === "roundTopic") {
    options.roundTopic = clean(rawValue);
  } else {
    return;
  }
  rt.contextOptions = options;
  touchSession(activeSession());
  persistState(state);
}

function handleRoundtableContextOptionInput(event) {
  const target = event.target.closest("[data-roundtable-context-key]");
  if (!target) return;
  const key = target.dataset.roundtableContextKey;
  const value = target.type === "checkbox" ? target.checked : target.value;
  updateRoundtableContextOption(key, value);
}

function createCustomRoundAssistant() {
  const rt = roundtableState();
  const id = uid("round_member");
  const assistant = normalizeCustomAssistant({
    id,
    name: `新议员${rt.customAssistants.length + 1}`,
    role: "议员",
    prompt: DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT,
  });
  if (!assistant) return;
  rt.customAssistants.push(assistant);
  rt.selectedIds.push(assistant.id);
  touchSession(activeSession());
  render();
  persistState(state);
  openAssistantConfig(assistant.id);
}

function openAssistantConfig(id) {
  const assistant = getRoundAssistant(id);
  const config = getRoundAssistantConfig(id);
  if (!assistant || !config) return;
  assistantConfigTargetId = id;
  assistantModelPickerOpen = false;
  ensureAssistantModelPickerUi();
  els.assistantConfigTitle.textContent = `${assistant.name}设置`;
  els.assistantNameInput.value = config.name;
  if (els.assistantAvatarPreview) {
    els.assistantAvatarPreview.dataset.avatarDataUrl = config.avatarDataUrl || "";
    renderAvatarPreview(els.assistantAvatarPreview, config.avatarDataUrl, config.name || assistant.name || "议");
  }
  if (els.assistantBaseUrlInput) els.assistantBaseUrlInput.value = config.apiBaseUrl || "";
  if (els.assistantApiKeyInput) els.assistantApiKeyInput.value = config.apiKey || "";
  els.assistantModelInput.value = config.model;
  if (els.assistantMaxTokensInput) els.assistantMaxTokensInput.value = config.maxTokens || "";
  els.assistantTemperatureInput.value = config.temperature;
  els.assistantTemperatureLabel.textContent = Number(config.temperature).toFixed(2);
  const contextOptions = normalizeRoundtableContextOptions(config.contextOptions);
  if (els.assistantIncludeManuscriptInput) els.assistantIncludeManuscriptInput.checked = contextOptions.includeManuscript;
  if (els.assistantIncludeNovelInput) els.assistantIncludeNovelInput.checked = contextOptions.includeNovel;
  if (els.assistantIncludePlotlineInput) els.assistantIncludePlotlineInput.checked = contextOptions.includePlotline;
  if (els.assistantIncludeCharactersInput) els.assistantIncludeCharactersInput.checked = contextOptions.includeCharacters;
  if (els.assistantIncludeWorldInput) els.assistantIncludeWorldInput.checked = contextOptions.includeWorld;
  if (els.assistantIncludeOutlineInput) els.assistantIncludeOutlineInput.checked = contextOptions.includeOutline;
  if (els.assistantIncludeForeshadowsInput) els.assistantIncludeForeshadowsInput.checked = contextOptions.includeForeshadows;
  if (els.assistantIncludeMainChatInput) els.assistantIncludeMainChatInput.checked = contextOptions.includeMainChat;
  if (els.assistantIncludeDiscussionInput) els.assistantIncludeDiscussionInput.checked = contextOptions.includeDiscussion;
  if (els.assistantExcerptMaxInput) els.assistantExcerptMaxInput.value = contextOptions.excerptMax;
  if (els.assistantDiscussionCountInput) els.assistantDiscussionCountInput.value = contextOptions.discussionCount;
  if (els.assistantActivationProfileInput) els.assistantActivationProfileInput.value = config.activationProfile || "";
  if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = config.activationProfile ? "已激活" : "未激活";
  if (els.activateAssistant) els.activateAssistant.textContent = config.activationProfile ? "重新激活" : "激活";
  if (els.assistantModelStatus) els.assistantModelStatus.textContent = config.model ? `当前：${config.model}` : "未拉取";
  renderAssistantModelPicker();
  els.assistantPromptInput.value = config.prompt;
  if (els.deleteAssistant) {
    els.deleteAssistant.hidden = id === "writer";
  }
  els.assistantConfigDialog.showModal();
  requestAnimationFrame(() => els.assistantPromptInput.focus());
}

function currentAssistantContextOptions() {
  return {
    includeManuscript: els.assistantIncludeManuscriptInput?.checked !== false,
    includeNovel: els.assistantIncludeNovelInput?.checked !== false,
    includePlotline: els.assistantIncludePlotlineInput?.checked !== false,
    includeCharacters: els.assistantIncludeCharactersInput?.checked !== false,
    includeWorld: els.assistantIncludeWorldInput?.checked !== false,
    includeOutline: els.assistantIncludeOutlineInput?.checked !== false,
    includeForeshadows: els.assistantIncludeForeshadowsInput?.checked !== false,
    includeMainChat: els.assistantIncludeMainChatInput?.checked !== false,
    includeDiscussion: els.assistantIncludeDiscussionInput?.checked !== false,
    excerptMax: clamp(Number(els.assistantExcerptMaxInput?.value) || DEFAULT_ROUNDTABLE_CONTEXT.excerptMax, 120, 2400),
    discussionCount: clamp(Number(els.assistantDiscussionCountInput?.value) || 0, 0, 80),
  };
}

function currentAssistantFormConfig() {
  const previous = assistantConfigTargetId ? roundtableState().assistantConfigs[assistantConfigTargetId] || {} : {};
  return {
    name: clean(els.assistantNameInput.value),
    apiBaseUrl: clean(els.assistantBaseUrlInput?.value),
    apiKey: clean(els.assistantApiKeyInput?.value),
    model: clean(els.assistantModelInput.value),
    maxTokens: Number(els.assistantMaxTokensInput?.value) || 0,
    temperature: Number(els.assistantTemperatureInput.value),
    contextOptions: currentAssistantContextOptions(),
    activationProfile: clean(els.assistantActivationProfileInput?.value),
    memories: normalizeAssistantMemories(previous.memories),
    avatarDataUrl: clean(els.assistantAvatarPreview?.dataset.avatarDataUrl),
    prompt: clean(els.assistantPromptInput.value),
  };
}

function exportAssistantConfig() {
  if (!assistantConfigTargetId) return;
  const config = currentAssistantFormConfig();
  if (!config.name && !config.prompt) return showToast("议员配置为空");
  const payload = {
    type: "roundtable-assistant",
    version: 1,
    exportedAt: Date.now(),
    config,
  };
  downloadText(`Roundtable-议员-${config.name || assistantConfigTargetId}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  showToast("议员配置已导出");
}

function importAssistantConfig() {
  if (!assistantConfigTargetId) return;
  els.assistantImportFile?.click();
}

async function handleAssistantImportSelected() {
  const file = els.assistantImportFile?.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const config = payload?.config || payload;
    const name = clean(config?.name);
    const prompt = clean(config?.prompt);
    if (!name || !prompt) return showToast("议员配置 JSON 缺少 name/prompt");
    els.assistantNameInput.value = name;
    if (els.assistantBaseUrlInput) els.assistantBaseUrlInput.value = clean(config.apiBaseUrl);
    if (els.assistantApiKeyInput) els.assistantApiKeyInput.value = clean(config.apiKey);
    els.assistantModelInput.value = clean(config.model);
    if (els.assistantMaxTokensInput) els.assistantMaxTokensInput.value = Number(config.maxTokens) || "";
    const temperature = Number(config.temperature);
    els.assistantTemperatureInput.value = Number.isFinite(temperature) ? clamp(temperature, 0, 2) : sessionSettings().temperature;
    els.assistantTemperatureLabel.textContent = Number(els.assistantTemperatureInput.value).toFixed(2);
    const contextOptions = normalizeRoundtableContextOptions(config.contextOptions);
    if (els.assistantIncludeManuscriptInput) els.assistantIncludeManuscriptInput.checked = contextOptions.includeManuscript;
    if (els.assistantIncludeNovelInput) els.assistantIncludeNovelInput.checked = contextOptions.includeNovel;
    if (els.assistantIncludePlotlineInput) els.assistantIncludePlotlineInput.checked = contextOptions.includePlotline;
    if (els.assistantIncludeCharactersInput) els.assistantIncludeCharactersInput.checked = contextOptions.includeCharacters;
    if (els.assistantIncludeWorldInput) els.assistantIncludeWorldInput.checked = contextOptions.includeWorld;
    if (els.assistantIncludeOutlineInput) els.assistantIncludeOutlineInput.checked = contextOptions.includeOutline;
    if (els.assistantIncludeForeshadowsInput) els.assistantIncludeForeshadowsInput.checked = contextOptions.includeForeshadows;
    if (els.assistantIncludeMainChatInput) els.assistantIncludeMainChatInput.checked = contextOptions.includeMainChat;
    if (els.assistantIncludeDiscussionInput) els.assistantIncludeDiscussionInput.checked = contextOptions.includeDiscussion;
    if (els.assistantExcerptMaxInput) els.assistantExcerptMaxInput.value = contextOptions.excerptMax;
    if (els.assistantDiscussionCountInput) els.assistantDiscussionCountInput.value = contextOptions.discussionCount;
    if (els.assistantActivationProfileInput) els.assistantActivationProfileInput.value = clean(config.activationProfile);
    if (assistantConfigTargetId && config.memories) {
      roundtableState().assistantConfigs[assistantConfigTargetId] ||= {};
      roundtableState().assistantConfigs[assistantConfigTargetId].memories = normalizeAssistantMemories(config.memories);
    }
    if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = clean(config.activationProfile) ? "已激活" : "未激活";
    if (els.activateAssistant) els.activateAssistant.textContent = clean(config.activationProfile) ? "重新激活" : "激活";
    if (els.assistantAvatarPreview) {
      els.assistantAvatarPreview.dataset.avatarDataUrl = clean(config.avatarDataUrl);
      renderAvatarPreview(els.assistantAvatarPreview, config.avatarDataUrl, name || "议");
    }
    els.assistantPromptInput.value = prompt;
    showToast("议员配置已导入，保存后生效");
  } catch (error) {
    showToast(humanizeError(error, "议员配置导入失败"));
  } finally {
    if (els.assistantImportFile) els.assistantImportFile.value = "";
  }
}

async function handleAssistantAvatarSelected() {
  const file = els.assistantAvatarFile?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await readLocalImageDataUrl(file);
    if (els.assistantAvatarPreview) {
      els.assistantAvatarPreview.dataset.avatarDataUrl = dataUrl;
      renderAvatarPreview(els.assistantAvatarPreview, dataUrl, clean(els.assistantNameInput?.value) || "议");
    }
    showToast("议员头像已选择，保存后生效");
  } catch (error) {
    showToast(humanizeError(error, "议员头像读取失败"));
  } finally {
    if (els.assistantAvatarFile) els.assistantAvatarFile.value = "";
  }
}

function clearAssistantAvatar() {
  if (els.assistantAvatarPreview) {
    els.assistantAvatarPreview.dataset.avatarDataUrl = "";
    renderAvatarPreview(els.assistantAvatarPreview, "", clean(els.assistantNameInput?.value) || "议");
  }
  showToast("议员头像已清除，保存后生效");
}

function closeAssistantConfig() {
  assistantConfigTargetId = null;
  assistantModelPickerOpen = false;
  if (els.assistantConfigDialog?.open) els.assistantConfigDialog.close();
}

function buildAssistantActivationMessages(base, config) {
  const options = normalizeRoundtableContextOptions(config.contextOptions);
  const novelMaterials = buildRoundtableNovelMaterials(options);
  const discussion = options.includeDiscussion
    ? roundtableState().messages
      .slice(-Math.min(options.discussionCount || DEFAULT_ROUNDTABLE_CONTEXT.discussionCount, 12))
      .map((message) => `${message.speakerName}：${message.content}`)
      .join("\n")
    : "";
  const sections = [
    `【要激活的议员】${config.name || base.name}（${base.role || "议员"}）`,
    `【原始职责提示词】\n${config.prompt || base.prompt}`,
    options.includeManuscript ? `【当前正文】\n${getRoundtablePromptExcerpt(Math.min(options.excerptMax || 520, 900))}` : "",
    novelMaterials ? `【小说材料】\n${novelMaterials}` : "",
    options.includeMainChat ? `【主线对话】\n${getNovelSourceText() || "暂无主线对话。"}` : "",
    options.includeDiscussion ? `【圆桌记录】\n${discussion || "暂无圆桌记录。"}` : "",
  ].filter(Boolean).join("\n\n");
  return [{
    role: "user",
    content: [
      "你正在为一个小说圆桌共创工具生成“演员身份卡”。",
      "设计参考 generative_agents 的 persona / memory stream 思路：这个身份卡用于之后形成稳定记忆和立场。",
      "目标：让这个议员以后像稳定的参会者一样发言，而不是像泛用助手答题。",
      "请结合当前小说信息、圆桌记录和它的职责，构建一个现实感很强但明确虚构的参会身份。",
      "不要声称它是真实存在的人；不要写系统提示词；不要输出解释。",
      "注意：它激活后可以把成员加入、离席、删除、沉默、失败理解为会议动态，并形成简短社交判断；但这些判断必须服务创作，不要长篇情绪表演。",
      "输出中文，控制在220字以内，格式如下：",
      "称呼：",
      "身份质感：",
      "创作偏见：",
      "说话方式：",
      "会反驳什么：",
      "禁区：",
      "默认发言：1-3句，短、准、像真人开会。",
      sections,
    ].join("\n\n"),
  }];
}

async function activateAssistantIdentity() {
  const id = assistantConfigTargetId;
  const base = getRoundAssistantBase(id);
  if (!base) return;
  if (assistantActivating || isGenerating || roundtableGenerating || materialGenerating) return showToast("已有生成任务进行中");
  const config = currentAssistantFormConfig();
  const settings = {
    ...sessionSettings(),
    model: config.model || sessionSettings().model,
    maxTokens: Math.min(Number(config.maxTokens) || sessionSettings().maxTokens || 900, 900),
    temperature: Number.isFinite(Number(config.temperature)) ? config.temperature : sessionSettings().temperature,
  };
  const api = {
    ...apiSettings(),
    baseUrl: config.apiBaseUrl || apiSettings().baseUrl,
    apiKey: config.apiKey || apiSettings().apiKey,
  };
  try {
    validateApi(settings, api);
    assistantActivating = true;
    if (els.activateAssistant) {
      els.activateAssistant.disabled = true;
      els.activateAssistant.textContent = "激活中...";
    }
    if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = "激活中";
    showToast("正在激活议员人格");
    const profile = await callOpenAITextWithSettings(buildAssistantActivationMessages(base, config), settings, api);
    const text = clean(profile);
    if (!text) return showToast("激活失败：模型没有返回身份卡");
    if (els.assistantActivationProfileInput) els.assistantActivationProfileInput.value = text;
    saveAssistantConfigFromForm({ close: false, toast: false });
    if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = "已激活";
    if (els.activateAssistant) els.activateAssistant.textContent = "重新激活";
    showToast("议员人格已激活并保存");
  } catch (error) {
    showToast(humanizeError(error, "议员激活失败"));
  } finally {
    assistantActivating = false;
    if (els.activateAssistant) {
      els.activateAssistant.disabled = false;
      els.activateAssistant.textContent = clean(els.assistantActivationProfileInput?.value) ? "重新激活" : "激活";
    }
    if (els.assistantActivationStatus && !clean(els.assistantActivationProfileInput?.value)) {
      els.assistantActivationStatus.textContent = "未激活";
    }
  }
}

function clearAssistantActivationProfile() {
  if (els.assistantActivationProfileInput) els.assistantActivationProfileInput.value = "";
  if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = "未激活";
  if (els.activateAssistant) els.activateAssistant.textContent = "激活";
  if (assistantConfigTargetId && roundtableState().assistantConfigs[assistantConfigTargetId]) {
    roundtableState().assistantConfigs[assistantConfigTargetId].memories = [];
  }
  saveAssistantConfigFromForm({ close: false, toast: false });
  showToast("已清除议员身份卡");
}

function saveAssistantConfigFromForm(options = {}) {
  const id = assistantConfigTargetId;
  const base = getRoundAssistantBase(id);
  if (!base) return false;
  const rt = roundtableState();
  const model = clean(els.assistantModelInput.value);
  rt.assistantConfigs[id] = {
    name: clean(els.assistantNameInput.value) || base.name,
    apiBaseUrl: clean(els.assistantBaseUrlInput?.value),
    apiKey: clean(els.assistantApiKeyInput?.value),
    model,
    maxTokens: Number(els.assistantMaxTokensInput?.value) || 0,
    temperature: Number(els.assistantTemperatureInput.value),
    contextOptions: currentAssistantContextOptions(),
    activationProfile: clean(els.assistantActivationProfileInput?.value),
    memories: normalizeAssistantMemories(rt.assistantConfigs[id]?.memories),
    avatarDataUrl: clean(els.assistantAvatarPreview?.dataset.avatarDataUrl),
    prompt: clean(els.assistantPromptInput.value) || base.prompt,
  };
  if (model) {
    const api = apiSettings();
    api.models = Array.from(new Set([model, ...api.models]));
  }
  if (options.close !== false) closeAssistantConfig();
  touchSession(activeSession());
  if (options.render !== false) render();
  persistState(state);
  if (options.toast !== false) showToast("议员设置已保存");
  return true;
}

function saveAssistantConfig() {
  saveAssistantConfigFromForm();
}

function resetAssistantConfig() {
  const id = assistantConfigTargetId;
  if (!getRoundAssistantBase(id)) return;
  delete roundtableState().assistantConfigs[id];
  closeAssistantConfig();
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已恢复默认议员设置");
}

function deleteCustomRoundAssistant() {
  const id = assistantConfigTargetId;
  if (!id || id === "writer") return;
  const rt = roundtableState();
  if (isCustomRoundAssistant(id)) {
    rt.customAssistants = rt.customAssistants.filter((assistant) => assistant.id !== id);
  } else if (getRoundAssistantBase(id)) {
    rt.hiddenAssistantIds = Array.from(new Set([...(rt.hiddenAssistantIds || []), id]));
  }
  rt.selectedIds = rt.selectedIds.filter((selectedId) => selectedId !== id);
  delete rt.assistantConfigs[id];
  closeAssistantConfig();
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已删除议员");
}

function addRoundtableMessage(speakerId, speakerName, content, extra = {}) {
  const rt = roundtableState();
  const shouldFollowPaper = speakerId === "writer" && els.roundtablePaperViewport
    ? els.roundtablePaperViewport.scrollHeight - els.roundtablePaperViewport.scrollTop - els.roundtablePaperViewport.clientHeight < 72
    : false;
  const { messages, message } = appendRoundtableMessage(rt.messages, speakerId, speakerName, content, extra);
  rt.messages = messages;
  touchSession(activeSession());
  render();
  if (speakerId === "writer" && shouldFollowPaper) {
    scrollRoundtablePaperBottom();
  }
  return message;
}

function addRoundtableFailureMessage(assistant, error) {
  const errorMessage = humanizeError(error, `${assistant.name}发言失败`);
  const message = createFailureRoundtableMessage(assistant, errorMessage);
  addRoundtableMessage(message.speakerId, message.speakerName, message.content, {
    id: message.id,
    createdAt: message.createdAt,
    failed: message.failed,
    errorMessage: message.errorMessage,
  });
}

async function addAssistantRoundtableReply(assistant, content, extra = {}, instruction = "") {
  const text = cleanRoundtableAssistantOutput(assistant, content);
  const message = addRoundtableMessage(assistant.id, assistant.name, text, extra);
  rememberCouncilParticipation(assistant, message, instruction);
  await rememberActivatedAssistantTurn(assistant, text, instruction);
  return message;
}

function updateRoundtableMessageContent(message, content) {
  if (!message) return;
  updateRoundtableMessageText(message, content);
  touchSession(activeSession());
  render();
}

function renderStreamingRoundtableMessage(message) {
  if (!message) return;
  const selector = `[data-round-id="${cssEscape(message.id)}"]`;
  const target = message.speakerId === "writer"
    ? els.roundtableDiscussion?.querySelector(`${selector} .roundtable-writer-snippet`)
    : els.roundtableDiscussion?.querySelector(`.roundtable-speech${selector}`);
  if (!target) return;
  scheduleStreamDomUpdate(`round:${message.id}`, () => {
    target.innerHTML = `${renderRoundtableRichText(message.content || "")}<span class="stream-caret"></span>`;
  });
}

async function streamAssistantRoundtableReply(assistant, instruction, extra = {}) {
  const message = addRoundtableMessage(assistant.id, assistant.name, "", {
    ...extra,
    streaming: Boolean(sessionSettings().stream),
  });
  const text = await callRoundtableAssistant(assistant, instruction, (partial) => {
    message.streaming = true;
    message.content = cleanRoundtableAssistantOutput(assistant, partial);
    renderStreamingRoundtableMessage(message);
  });
  cancelStreamDomUpdate(`round:${message.id}`);
  message.streaming = false;
  const cleanText = cleanRoundtableAssistantOutput(assistant, text);
  updateRoundtableMessageContent(message, cleanText);
  rememberCouncilParticipation(assistant, message, instruction);
  await rememberActivatedAssistantTurn(assistant, cleanText, instruction);
  return { message, text: cleanText };
}

function appendAssistantMemory(assistantId, text, source = "roundtable") {
  const memory = clean(text);
  if (!assistantId || !memory) return;
  const rt = roundtableState();
  rt.assistantConfigs[assistantId] ||= {};
  const memories = normalizeAssistantMemories(rt.assistantConfigs[assistantId].memories);
  memories.push({
    id: uid("memory"),
    text: memory,
    source,
    createdAt: Date.now(),
  });
  rt.assistantConfigs[assistantId].memories = memories.slice(-GENERATIVE_AGENT_MEMORY_LIMIT);
  touchSession(activeSession());
  persistState(state);
}

function buildAssistantMemoryPrompt(assistant, reply, instruction) {
  return buildAssistantMemoryPromptFromDomain({
    assistant,
    reply,
    instruction,
    roundtableMessages: roundtableState().messages,
    sourceNote: GENERATIVE_AGENT_SOURCE_NOTE,
  });
}

async function rememberActivatedAssistantTurn(assistant, reply, instruction = "") {
  if (!isSociallyActivatedAssistant(assistant) || !clean(reply)) return;
  try {
    const settings = {
      ...sessionSettings(),
      model: assistant.model || sessionSettings().model,
      maxTokens: 180,
      temperature: 0.25,
    };
    const api = {
      ...apiSettings(),
      baseUrl: assistant.apiBaseUrl || apiSettings().baseUrl,
      apiKey: assistant.apiKey || apiSettings().apiKey,
    };
    const memory = await callOpenAITextWithSettings(buildAssistantMemoryPrompt(assistant, reply, instruction), settings, api);
    appendAssistantMemory(assistant.id, memory, "generative-agent-reflection");
  } catch {
    // Memory reflection is a soft generative-agents layer; failed memory must not interrupt the round.
  }
}

function getRoundtableMessage(id) {
  return findRoundtableMessage(roundtableState().messages, id);
}

function toggleRoundtableMenu(id) {
  activeMenuNodeId = null;
  activeRoundtableMessageId = activeRoundtableMessageId === id ? null : id;
  renderMenu();
}

function deleteRoundtableMessage(id) {
  if (roundtableGenerating || isGenerating) return showToast("生成中不能删除圆桌消息");
  const rt = roundtableState();
  const result = removeRoundtableMessage(rt.messages, id);
  if (!result.removed) return;
  rt.messages = result.messages;
  activeRoundtableMessageId = null;
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已删除圆桌消息");
}

function copyRoundtableMessage(id) {
  const message = getRoundtableMessage(id);
  if (!message) return;
  copyText(message.content || "");
}

function markRoundtableDecision(id, status) {
  const message = getRoundtableMessage(id);
  if (!toggleRoundtableDecision(message, status)) return;
  activeRoundtableMessageId = null;
  touchSession(activeSession());
  render();
  persistState(state);
  const labels = { adopted: "已标记采纳", ignored: "已标记忽略", approved: "已标记通过", revision: "已标记需修改" };
  showToast(labels[status] || "已更新标记");
}

function syncWriterMessageToNovel(message, text) {
  const result = appendWriterSync(sessionNovel().body, text);
  sessionNovel().body = result.body;
  recordManuscriptVersion("写手续写");
  message.manuscriptSync = result.manuscriptSync;
}

function replaceSyncedWriterSegment(message, nextText) {
  const novel = sessionNovel();
  const result = replaceWriterSyncedSegment(novel.body, message?.manuscriptSync, message?.content, nextText);
  if (!result.ok) return false;
  novel.body = result.body;
  recordManuscriptVersion("写手替换");
  message.manuscriptSync = result.manuscriptSync;
  return true;
}

function removeSyncedWriterSegment(message) {
  const novel = sessionNovel();
  const result = removeWriterSyncedSegment(novel.body, message?.manuscriptSync, message?.content);
  if (!result.ok) return false;
  novel.body = result.body;
  recordManuscriptVersion("撤回写手正文");
  message.manuscriptSync = result.manuscriptSync;
  return true;
}

function locateWriterSegment(id) {
  const message = getRoundtableMessage(id);
  const sync = message?.manuscriptSync;
  if (!message || message.speakerId !== "writer" || !sync?.active) return showToast("找不到这段写手正文");
  const body = sessionNovel().body || "";
  const start = locateWriterSyncStart(body, sync);
  if (start < 0) return showToast("正文已被修改，无法定位这段");
  const rt = roundtableState();
  rt.enabled = true;
  rt.paperReveal = Math.max(rt.paperReveal, 0.82);
  rt.paperHasNewProse = false;
  activeRoundtableMessageId = null;
  closePanels();
  render();
  resizeInput();
  requestAnimationFrame(() => {
    const viewport = els.roundtablePaperViewport;
    if (!viewport) return;
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const ratio = body.length ? start / body.length : 1;
    viewport.scrollTop = clamp(Math.round(maxTop * ratio), 0, maxTop);
    rt.paperScrollTop = viewport.scrollTop;
    rt.paperAtBottom = isRoundtablePaperNearBottom();
    persistState(state);
  });
  showToast("已定位到写手正文片段");
}

function hideWriterMessageKeepText(id) {
  if (roundtableGenerating || isGenerating) return showToast("生成中不能整理正文片段");
  const rt = roundtableState();
  const message = getRoundtableMessage(id);
  if (!message || message.speakerId !== "writer" || !message.manuscriptSync?.active) return;
  rt.messages = removeRoundtableMessage(rt.messages, id).messages;
  activeRoundtableMessageId = null;
  touchSession(activeSession());
  render();
  renderNovelPanel();
  persistState(state);
  showToast("已隐藏圆桌气泡，正文保留在正文库");
}

function undoWriterManuscriptSync(id) {
  if (roundtableGenerating || isGenerating) return showToast("生成中不能撤回正文");
  const message = getRoundtableMessage(id);
  if (!message || message.speakerId !== "writer") return;
  activeRoundtableMessageId = null;
  if (!removeSyncedWriterSegment(message)) {
    render();
    return showToast("正文已被修改，无法自动撤回这一段");
  }
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已撤回这段写手正文");
}

async function adoptRoundtableMessage(id) {
  const message = getRoundtableMessage(id);
  if (!message) return;
  activeRoundtableMessageId = null;
  await generateRoundtableWriter(`请采纳这条圆桌意见并续写正文：\n${message.speakerName}：${message.content}`);
}

async function writeFromAdoptedRoundtableMessages() {
  const adopted = getAdoptedRoundtableMessages(roundtableState().messages);
  if (!adopted.length) return showToast("还没有标记采纳的圆桌意见");
  const instruction = [
    "请只采纳以下已标记采纳的圆桌意见来续写正文。未列出的意见不要主动混入。",
    adopted.map((message) => `${message.speakerName}：${message.content}`).join("\n"),
  ].join("\n\n");
  await generateRoundtableWriter(instruction);
}

async function rewriteWriterManuscriptSync(id) {
  const message = getRoundtableMessage(id);
  if (!message || message.speakerId !== "writer") return;
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  roundtableShouldStop = false;
  roundtableGenerating = true;
  activeRoundtableMessageId = null;
  render();
  try {
    const writer = getRoundAssistant("writer");
    const text = await callRoundtableAssistant(writer, `请重写下面这段正文。保留创作意图，但改善表达、节奏和画面。只输出重写后的正文：\n${message.content}`);
    if (roundtableShouldStop) return;
    const next = cleanRoundtableAssistantOutput(writer, text);
    if (!next) return showToast("写手没有返回可替换正文");
    if (!replaceSyncedWriterSegment(message, next)) {
      return showToast("正文已被修改，无法自动替换这一段");
    }
    message.content = next;
    message.speakerName = writer.name;
    message.createdAt = Date.now();
    touchSession(activeSession());
    showToast("已重写并替换正文");
  } catch (error) {
    if (!roundtableShouldStop && error.name !== "AbortError") {
      showToast(humanizeError(error, "重写替换失败"));
    }
  } finally {
    roundtableGenerating = false;
    abortController = null;
    roundtableShouldStop = false;
    render();
    persistState(state);
  }
}

async function regenerateRoundtableMessage(id) {
  const message = getRoundtableMessage(id);
  if (!message || message.speakerId === "user") return;
  if (message.speakerId === "writer") {
    activeRoundtableMessageId = null;
    await generateRoundtableWriter(`请重新写这一段正文，保留圆桌讨论意图但换一种更好的表达：\n${message.content}`);
    return;
  }
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  const assistant = getRoundAssistant(message.speakerId);
  if (!assistant) return showToast("找不到这个议员");
  roundtableGenerating = true;
  activeRoundtableMessageId = null;
  render();
  try {
    message.streaming = Boolean(sessionSettings().stream);
    const text = await callRoundtableAssistant(assistant, `请重新回答你上一条圆桌聊天发言。保持聊天语气，除非用户明确要求，否则不要直接写成长篇成稿。上一条内容是：\n${message.content}`, (partial) => {
      message.streaming = true;
      message.content = clean(partial);
      renderStreamingRoundtableMessage(message);
    });
    cancelStreamDomUpdate(`round:${message.id}`);
    message.streaming = false;
    message.content = clean(text);
    message.createdAt = Date.now();
    message.speakerName = assistant.name;
    delete message.mentionMeta;
    touchSession(activeSession());
    showToast(`${assistant.name}已重新回答`);
  } catch (error) {
    showToast(humanizeError(error, "重新回答失败"));
  } finally {
    roundtableGenerating = false;
    render();
    persistState(state);
  }
}

function scrollRoundtablePaperBottom(options = {}) {
  requestAnimationFrame(() => {
    if (els.roundtablePaperViewport) {
      els.roundtablePaperViewport.scrollTop = els.roundtablePaperViewport.scrollHeight;
      const rt = roundtableState();
      rt.paperScrollTop = els.roundtablePaperViewport.scrollTop;
      rt.paperAtBottom = true;
      rt.paperHasNewProse = false;
      if (!options.silent) persistState(state);
    }
  });
}

function restoreRoundtablePaperScroll() {
  requestAnimationFrame(() => {
    const viewport = els.roundtablePaperViewport;
    if (!viewport) return;
    const rt = roundtableState();
    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    viewport.scrollTop = clamp(rt.paperScrollTop, 0, maxTop);
  });
}

function handleRoundtablePaperScroll() {
  const viewport = els.roundtablePaperViewport;
  if (!viewport || !roundtableState().enabled) return;
  const rt = roundtableState();
  rt.paperScrollTop = viewport.scrollTop;
  rt.paperAtBottom = isRoundtablePaperNearBottom();
  if (rt.paperAtBottom) rt.paperHasNewProse = false;
  if (els.roundtablePaperJump) {
    els.roundtablePaperJump.hidden = !rt.paperHasNewProse;
  }
  window.clearTimeout(paperScrollPersistTimer);
  paperScrollPersistTimer = window.setTimeout(() => persistState(state), 160);
}

function jumpRoundtablePaperLatest() {
  const rt = roundtableState();
  rt.paperAtBottom = true;
  rt.paperHasNewProse = false;
  scrollRoundtablePaperBottom();
  if (els.roundtablePaperJump) els.roundtablePaperJump.hidden = true;
  render();
}

function moveRoundtableMember(id, delta) {
  const rt = roundtableState();
  const index = rt.selectedIds.indexOf(id);
  if (index < 0) return;
  const next = clamp(index + delta, 0, rt.selectedIds.length - 1);
  if (next === index) return;
  const [item] = rt.selectedIds.splice(index, 1);
  rt.selectedIds.splice(next, 0, item);
  touchSession(activeSession());
  render();
  persistState(state);
}

function updateRoundtableMentionPicker() {
  if (!roundtableState().enabled) {
    mentionPickerOpen = false;
    mentionPickerRange = null;
    renderRoundtableMentionPicker();
    return;
  }
  const value = els.input.value || "";
  const caret = els.input.selectionStart ?? value.length;
  const before = value.slice(0, caret);
  const match = before.match(/@([A-Za-z0-9_\-\u4e00-\u9fff]*)$/);
  if (!match) {
    mentionPickerOpen = false;
    mentionPickerRange = null;
    renderRoundtableMentionPicker();
    return;
  }
  const start = caret - match[0].length;
  mentionPickerOpen = true;
  mentionPickerQuery = match[1] || "";
  mentionPickerRange = { start, end: caret };
  renderRoundtableMentionPicker();
}

function insertRoundtableMention(id) {
  const assistant = getRoundAssistant(id);
  if (!assistant || !mentionPickerRange) return;
  const value = els.input.value || "";
  const mention = `@${assistant.name} `;
  const next = `${value.slice(0, mentionPickerRange.start)}${mention}${value.slice(mentionPickerRange.end)}`;
  els.input.value = next;
  const caret = mentionPickerRange.start + mention.length;
  els.input.focus();
  els.input.setSelectionRange(caret, caret);
  mentionPickerOpen = false;
  mentionPickerRange = null;
  mentionPickerQuery = "";
  resizeInput();
  renderContextBadge();
  renderRoundtableMentionPicker();
}

async function handleRoundtableUser(text) {
  addRoundtableMessage("user", clean(sessionAppearance().userName) || "我", text);
  const mentions = parseRoundtableMentions(text);
  if (!mentions.length && clean(text).includes("@")) {
    showToast("只能 @ 已安排顺序的议员，或 @写手");
  }
  if (!mentions.length) {
    persistState(state);
    return;
  }
  const writer = mentions.find((assistant) => assistant.id === "writer");
  if (writer) return generateRoundtableWriter(text);
  return generateMentionedRoundtableAssistants(mentions, text);
}

async function generateMentionedRoundtableAssistants(assistants, userText) {
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  const targets = assistants.filter((assistant) => assistant.id !== "writer");
  if (!targets.length) return;
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    for (const assistant of targets) {
      if (roundtableShouldStop) break;
      showToast(`${assistant.name}正在回应`);
      try {
        const { text } = await streamAssistantRoundtableReply(assistant, `用户刚刚点名你发言：${userText}`);
        if (roundtableShouldStop) break;
      } catch (error) {
        if (error.name === "AbortError" || roundtableShouldStop) break;
        addRoundtableFailureMessage(assistant, error);
      }
    }
  } catch (error) {
    if (!roundtableShouldStop && error.name !== "AbortError") {
      showToast(humanizeError(error, "点名发言失败"));
    }
  } finally {
    roundtableGenerating = false;
    abortController = null;
    roundtableShouldStop = false;
    render();
    persistState(state);
  }
}

async function startRoundtableRound() {
  const rt = roundtableState();
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  if (!rt.selectedIds.length) return showToast("先在参会人里选择至少一个议员");
  rt.roundProgress = createRoundProgress(rt.selectedIds, rt.contextOptions?.roundTopic);
  await runRoundtableProgress();
}

async function resumeRoundtableRound() {
  const rt = roundtableState();
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  if (!rt.roundProgress?.ids?.length) return showToast("没有可继续的圆桌轮次");
  await runRoundtableProgress();
}

async function runRoundtableProgress() {
  const rt = roundtableState();
  const progress = rt.roundProgress;
  if (!progress?.ids?.length) return;
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    for (let index = Number(progress.nextIndex) || 0; index < progress.ids.length; index += 1) {
      progress.nextIndex = index;
      progress.updatedAt = Date.now();
      if (roundtableShouldStop) break;
      const id = progress.ids[index];
      const assistant = getRoundAssistant(id);
      if (!assistant) {
        progress.nextIndex = index + 1;
        continue;
      }
      showToast(`${assistant.name}正在发言`);
      const topic = clean(progress.topic || rt.contextOptions?.roundTopic);
      try {
        const instruction = buildRoundProgressInstruction(topic);
        const { text } = await streamAssistantRoundtableReply(assistant, instruction);
        if (roundtableShouldStop) break;
        const moved = moveRoundtableMentionsAfter(progress, index, text);
        if (moved.length) {
          showToast(`${moved.map((item) => item.name).join("、")}已加入后续发言`);
        }
      } catch (error) {
        if (error.name === "AbortError" || roundtableShouldStop) break;
        addRoundtableFailureMessage(assistant, error);
      }
      progress.nextIndex = index + 1;
    }
    if (!roundtableShouldStop && progress.nextIndex >= progress.ids.length) {
      rt.roundProgress = null;
      showToast("本轮圆桌已完成");
    }
  } catch (error) {
    if (!roundtableShouldStop && error.name !== "AbortError") {
      showToast(humanizeError(error, "圆桌发言失败"));
    }
  } finally {
    roundtableGenerating = false;
    abortController = null;
    roundtableShouldStop = false;
    render();
    persistState(state);
  }
}

async function generateRoundtableWriter(userText) {
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    const writer = getRoundAssistant("writer");
    const message = addRoundtableMessage("writer", writer.name || "写手", "", {
      streaming: Boolean(sessionSettings().stream),
    });
    const text = await callRoundtableAssistant(writer, userText || "请根据圆桌讨论继续完成用户要的产出。", (partial) => {
      message.streaming = true;
      message.content = cleanRoundtableAssistantOutput(writer, partial);
      renderStreamingRoundtableMessage(message);
    });
    cancelStreamDomUpdate(`round:${message.id}`);
    if (roundtableShouldStop) return;
    const cleanText = cleanRoundtableAssistantOutput(writer, text);
    message.streaming = false;
    updateRoundtableMessageContent(message, cleanText);
    syncWriterMessageToNovel(message, cleanText);
    persistState(state);
    showToast("写手已更新正文，并同步到正文库");
  } catch (error) {
    if (!roundtableShouldStop && error.name !== "AbortError") {
      showToast(humanizeError(error, "写手续写失败"));
    }
  } finally {
    roundtableGenerating = false;
    abortController = null;
    roundtableShouldStop = false;
    render();
  }
}

async function runAssistantMentionFollowUps(originAssistant, originText, options = {}) {
  const maxFollowUps = Number.isFinite(Number(options.maxFollowUps)) ? Number(options.maxFollowUps) : 2;
  const visitedIds = options.visitedIds instanceof Set ? options.visitedIds : new Set(options.visitedIds || []);
  let remaining = Math.max(0, maxFollowUps);
  let currentAssistant = originAssistant;
  let currentText = clean(originText);
  const queuedIds = new Set();
  const queue = [];
  const enqueueTargets = (sourceAssistant, text) => {
    parseRoundtableMentions(text, {
      allowWriter: false,
      excludeIds: new Set([...visitedIds, sourceAssistant.id]),
    }).forEach((assistant) => {
      if (visitedIds.has(assistant.id) || queuedIds.has(assistant.id)) return;
      queue.push({ sourceAssistant, targetAssistant: assistant, sourceText: text });
      queuedIds.add(assistant.id);
    });
  };
  enqueueTargets(currentAssistant, currentText);
  while (queue.length && remaining > 0 && !roundtableShouldStop) {
    const { sourceAssistant: source, targetAssistant, sourceText } = queue.shift();
    queuedIds.delete(targetAssistant.id);
    visitedIds.add(targetAssistant.id);
    showToast(`${targetAssistant.name}被@，正在回应`);
    try {
      const reply = await callRoundtableAssistant(targetAssistant, buildAssistantMentionInstruction(source, targetAssistant, sourceText));
      if (roundtableShouldStop) break;
      await addAssistantRoundtableReply(targetAssistant, reply, {
        mentionMeta: {
          triggeredById: source.id,
          triggeredByName: source.name,
        },
      }, buildAssistantMentionInstruction(source, targetAssistant, sourceText));
      remaining -= 1;
      currentAssistant = targetAssistant;
      currentText = reply;
      enqueueTargets(currentAssistant, currentText);
    } catch (error) {
      if (error.name === "AbortError" || roundtableShouldStop) break;
      addRoundtableFailureMessage(targetAssistant, error);
      break;
    }
  }
}

async function callRoundtableAssistant(assistant, instruction, onChunk = null) {
  setRoundtableActiveSpeaker(assistant.id);
  try {
    try {
      await ensureAutoCompressNovelMemory(instruction);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      showToast(humanizeError(error, "圆桌自动压缩失败，已改用现有资料继续"));
    }
    const messages = buildRoundtableMessages(assistant, instruction);
    const settings = {
      ...sessionSettings(),
      model: assistant.model || sessionSettings().model,
      maxTokens: Number(assistant.maxTokens) || sessionSettings().maxTokens,
      temperature: Number.isFinite(Number(assistant.temperature)) ? Number(assistant.temperature) : sessionSettings().temperature,
    };
    const api = {
      ...apiSettings(),
      baseUrl: assistant.apiBaseUrl || apiSettings().baseUrl,
      apiKey: assistant.apiKey || apiSettings().apiKey,
    };
    if (sessionSettings().stream) {
      return await callOpenAITextStreamWithSettings(messages, settings, api, onChunk);
    }
    return await callOpenAITextWithSettings(messages, settings, api);
  } finally {
    if (roundtableActiveSpeakerId === assistant.id) setRoundtableActiveSpeaker(null);
  }
}

function buildRoundtableMessages(assistant, instruction) {
  const rt = roundtableState();
  const options = normalizeRoundtableContextOptions({
    ...rt.contextOptions,
    ...(assistant.contextOptions || {}),
  });
  const result = buildRoundtablePromptMessages({
    assistant,
    instruction,
    options,
    mentionableAssistants: getRoundtableMentionableAssistants(),
    roundtableMessages: rt.messages,
    novel: sessionNovel(),
    manuscriptText: getRoundtableManuscript(),
    mainChatText: getNovelSourceText(),
    tokenThreshold: AUTO_CONTEXT_TOKEN_THRESHOLD,
  });
  if (result.compressed) {
    showToast("圆桌上下文过长，已自动压缩本轮材料");
  }
  return result.messages;
}

const handleCommand = createCommandRegistry({
  "open-history": () => showPanel("history"),
  "open-settings": () => showPanel("settings"),
  "open-workspace": () => showPanel("workspace"),
  "open-novel": () => showPanel("novel"),
  "open-context": () => showPanel("context"),
  "composer-tool": () => handleComposerTool(),
  "open-roundtable": () => toggleRoundtable(),
  "toggle-roundtable": () => toggleRoundtable(),
  "toggle-roundtable-members": () => toggleRoundtableMembers(),
  "toggle-roundtable-materials": () => toggleRoundtableMaterials(),
  "toggle-roundtable-context": () => toggleRoundtableContextDock(),
  "toggle-roundtable-paper": () => toggleRoundtablePaperReveal(),
  "roundtable-writer-settings": () => openAssistantConfig("writer"),
  "roundtable-add-assistant": () => createCustomRoundAssistant(),
  "roundtable-toggle-member": (target) => toggleRoundtableMember(target.dataset.memberId),
  "roundtable-member-up": (target) => moveRoundtableMember(target.dataset.memberId, -1),
  "roundtable-member-down": (target) => moveRoundtableMember(target.dataset.memberId, 1),
  "roundtable-edit-assistant": (target) => openAssistantConfig(target.dataset.memberId),
  "roundtable-cycle": () => toggleRoundtableRound(),
  "roundtable-start": () => startRoundtableRound(),
  "roundtable-resume": () => resumeRoundtableRound(),
  "roundtable-stop": () => stopRoundtableGeneration(),
  "insert-roundtable-mention": (target) => insertRoundtableMention(target.dataset.memberId),
  "jump-roundtable-paper": () => jumpRoundtablePaperLatest(),
  "open-search": () => showPanel("history"),
  "roundtable-preview": () => toggleRoundtable(),
  "close-panels": () => closePanels(),
  "new-session": () => newSession(),
  "switch-session": (target) => switchSession(target.dataset.sessionId),
  "rename-session": (target) => renameSession(target.dataset.sessionId),
  "copy-session": (target) => copySession(target.dataset.sessionId),
  "delete-session": (target) => deleteSession(target.dataset.sessionId),
  "fetch-models": () => fetchModels(),
  "choose-workspace-files": () => chooseWorkspaceFiles(),
  "clear-workspace-files": () => clearWorkspaceFiles(),
  "remove-workspace-file": (target) => removeWorkspaceFile(target.dataset.fileId),
  "toggle-model-picker": () => toggleModelPicker(),
  "select-model": (target) => selectModelFromPicker(target.dataset.model),
  "toggle-assistant-model-picker": () => toggleAssistantModelPicker(),
  "select-assistant-model": (target) => selectAssistantModelFromPicker(target.dataset.model),
  "save-novel": () => saveNovel(),
  "save-manuscript-version": () => saveManuscriptVersion(),
  "restore-manuscript-version": (target) => restoreManuscriptVersion(target.dataset.versionId),
  "delete-manuscript-version": (target) => deleteManuscriptVersion(target.dataset.versionId),
  "import-body-file": () => importBodyFile(),
  "export-body-file": () => exportBodyFile(),
  "sync-body-from-ai": () => syncBodyFromAssistant(),
  "generate-novel": (target) => generateNovelMaterial(target.dataset.novelTarget),
  "layout-preset": (target) => applyLayoutPreset(target.dataset.preset),
  "layout-custom-preset": (target) => applyCustomLayoutPreset(target.dataset.presetId),
  "save-layout-preset": () => saveLayoutPreset(),
  "delete-layout-preset": (target) => deleteLayoutPreset(target.dataset.presetId),
  "copy-layout": () => copyLayoutParams(),
  "reset-layout": () => resetLayoutParams(),
  "toggle-roundtable-menu": (target) => toggleRoundtableMenu(target.dataset.roundId),
  "copy-roundtable-message": (target) => copyRoundtableMessage(target.dataset.roundId),
  "send-roundtable-to-main": (target) => sendRoundtableMessageToMain(target.dataset.roundId),
  "delete-roundtable-message": (target) => deleteRoundtableMessage(target.dataset.roundId),
  "adopt-roundtable-message": (target) => adoptRoundtableMessage(target.dataset.roundId),
  "mark-roundtable-adopted": (target) => markRoundtableDecision(target.dataset.roundId, "adopted"),
  "mark-roundtable-ignored": (target) => markRoundtableDecision(target.dataset.roundId, "ignored"),
  "mark-roundtable-approved": (target) => markRoundtableDecision(target.dataset.roundId, "approved"),
  "mark-roundtable-revision": (target) => markRoundtableDecision(target.dataset.roundId, "revision"),
  "roundtable-write-adopted": () => writeFromAdoptedRoundtableMessages(),
  "undo-writer-sync": (target) => undoWriterManuscriptSync(target.dataset.roundId),
  "rewrite-writer-sync": (target) => rewriteWriterManuscriptSync(target.dataset.roundId),
  "locate-writer-segment": (target) => locateWriterSegment(target.dataset.roundId),
  "hide-writer-message": (target) => hideWriterMessageKeepText(target.dataset.roundId),
  "regen-roundtable-message": (target) => regenerateRoundtableMessage(target.dataset.roundId),
  "toggle-menu": (target) => {
    const nodeId = target.dataset.nodeId;
    activeRoundtableMessageId = null;
    activeMenuNodeId = activeMenuNodeId === nodeId ? null : nodeId;
    return render();
  },
  "edit-user": (target) => openEditor(target.dataset.nodeId),
  "edit-ai": (target) => openEditor(target.dataset.nodeId),
  "copy-message": (target) => copyText(getMessageContent(getNode(target.dataset.nodeId))),
  "delete-message": (target) => deleteMessage(target.dataset.nodeId),
  "resend-user": (target) => resendUser(target.dataset.nodeId),
  "regen-ai": (target) => regenerateAssistant(target.dataset.nodeId),
  "continue-ai": (target) => continueFromAssistant(target.dataset.nodeId),
  "prev-version": (target) => switchVersion(target.dataset.nodeId, -1),
  "next-version": (target) => switchVersion(target.dataset.nodeId, 1),
  "prev-branch": (target) => switchSibling(target.dataset.nodeId, -1),
  "next-branch": (target) => switchSibling(target.dataset.nodeId, 1),
});

function applyLayoutPreset(name) {
  const preset = layoutPresets[name];
  if (!preset) return;
  sessionSettings().layout = hydrateLayout(preset);
  render();
  resizeInput();
  showToast("排版预设已应用");
}

function applyCustomLayoutPreset(id) {
  const settings = sessionSettings();
  const preset = settings.layoutPresets.find((item) => item.id === id);
  if (!preset) return;
  settings.layout = hydrateLayout(preset.layout);
  render();
  resizeInput();
  showToast("排版预设已应用");
}

function saveLayoutPreset() {
  const settings = sessionSettings();
  const name = clean(els.layoutPresetName?.value) || `排版 ${settings.layoutPresets.length + 1}`;
  const record = {
    id: uid("layout"),
    name,
    layout: hydrateLayout(settings.layout),
    createdAt: Date.now(),
  };
  settings.layoutPresets = [record, ...settings.layoutPresets].slice(0, 12);
  if (els.layoutPresetName) els.layoutPresetName.value = "";
  render();
  showToast("已保存排版预设");
}

function deleteLayoutPreset(id) {
  const settings = sessionSettings();
  settings.layoutPresets = settings.layoutPresets.filter((item) => item.id !== id);
  render();
  showToast("已删除排版预设");
}

function resetLayoutParams() {
  sessionSettings().layout = createDefaultLayout();
  render();
  resizeInput();
  showToast("已恢复默认排版");
}

function copyLayoutParams() {
  copyText(JSON.stringify(sessionSettings().layout, null, 2));
}

bindCommandDelegation(document, renderMenu, () => activeMenuNodeId || activeRoundtableMessageId, (value) => {
  activeMenuNodeId = value;
  if (value === null) activeRoundtableMessageId = null;
}, (command, target, event) => {
  showCommandFeedback(target, command, event);
  handleCommand(command, target);
});

els.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  pulseElement(els.send);
  vibrateLight("send");
  if (isGenerating) {
    stopGeneration();
    return;
  }
  if (roundtableGenerating) {
    stopRoundtableGeneration();
    return;
  }
  const text = clean(els.input.value);
  if (!text) return;
  if (roundtableState().enabled) {
    els.input.value = "";
    resizeInput();
    renderContextBadge();
    await handleRoundtableUser(text);
    return;
  }
  try {
    validateApi();
    els.input.value = "";
    resizeInput();
    renderContextBadge();
    await appendUserMessage(text);
  } catch (error) {
    showToast(humanizeError(error, "发送失败"));
  }
});

function resizeInput() {
  els.input.style.height = "auto";
  const maxHeight = Math.max(44, sessionSettings().layout.composerMinHeight + 8);
  els.input.style.height = `${Math.min(maxHeight, els.input.scrollHeight)}px`;
  const composerHeight = Math.ceil(els.composer.getBoundingClientRect().height);
  const composerTop = Math.ceil(els.composer.getBoundingClientRect().top);
  const viewportHeight = Math.ceil(window.visualViewport?.height || window.innerHeight || 0);
  document.documentElement.style.setProperty("--composer-height", `${composerHeight}px`);
  document.documentElement.style.setProperty("--composer-top-gap", `${Math.max(composerHeight, viewportHeight - composerTop)}px`);
  syncRoundtablePaper();
}

function handleRoundtablePaperPointerDown(event) {
  if (!roundtableState().enabled || !els.roundtablePaperGrip) return;
  paperDrag.active = true;
  paperDrag.moved = false;
  paperDrag.pointerId = event.pointerId;
  paperDrag.startY = event.clientY;
  paperDrag.startReveal = roundtableState().paperReveal;
  els.roundtablePaperGrip.setPointerCapture?.(event.pointerId);
  els.body.classList.add("paper-dragging");
}

function handleRoundtablePaperPointerMove(event) {
  if (!paperDrag.active || event.pointerId !== paperDrag.pointerId) return;
  const metrics = getRoundtablePaperMetrics();
  const range = Math.max(1, metrics.maxHeight - metrics.minHeight);
  const delta = event.clientY - paperDrag.startY;
  if (Math.abs(delta) > 4) paperDrag.moved = true;
  setRoundtablePaperReveal(paperDrag.startReveal + delta / range, { silent: true });
  event.preventDefault();
}

function finishRoundtablePaperDrag(event) {
  if (!paperDrag.active) return;
  if (event && paperDrag.pointerId !== null && event.pointerId !== undefined && event.pointerId !== paperDrag.pointerId) return;
  if (els.roundtablePaperGrip && paperDrag.pointerId !== null) {
    try {
      els.roundtablePaperGrip.releasePointerCapture?.(paperDrag.pointerId);
    } catch {}
  }
  const releaseReveal = roundtableState().paperReveal;
  if (paperDrag.moved) paperGripSuppressClickUntil = Date.now() + 350;
  paperDrag.active = false;
  paperDrag.pointerId = null;
  paperDrag.startY = 0;
  paperDrag.moved = false;
  els.body.classList.remove("paper-dragging");
  if (releaseReveal < PAPER_DEEP_COLLAPSE_THRESHOLD) {
    setRoundtablePaperReveal(0, { silent: true });
  } else {
    syncRoundtablePaper();
  }
  paperDrag.startReveal = roundtableState().paperReveal;
  touchSession(activeSession());
  persistState(state);
}

els.input.addEventListener("input", () => {
  resizeInput();
  renderContextBadge();
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)));
  updateRoundtableMentionPicker();
});
els.input.addEventListener("focus", () => els.body.classList.add("composer-focused"));
els.input.addEventListener("blur", () => {
  els.body.classList.remove("composer-focused");
  window.setTimeout(() => {
    if (document.activeElement?.closest?.("#roundtableMentionPicker")) return;
    mentionPickerOpen = false;
    mentionPickerRange = null;
    renderRoundtableMentionPicker();
  }, 120);
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mentionPickerOpen) {
    mentionPickerOpen = false;
    mentionPickerRange = null;
    renderRoundtableMentionPicker();
    event.preventDefault();
    return;
  }
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    els.composer.requestSubmit();
  }
});

els.input.addEventListener("keyup", updateRoundtableMentionPicker);
els.input.addEventListener("click", updateRoundtableMentionPicker);

document.addEventListener("input", handleRoundtableContextOptionInput);
document.addEventListener("change", handleRoundtableContextOptionInput);

els.historySearch.addEventListener("input", renderSessions);

[
  ["input", els.systemPrompt, "systemPrompt"],
  ["input", els.contextCount, "contextCount"],
  ["input", els.maxTokens, "maxTokens"],
].forEach(([, element, key]) => {
  element.addEventListener("input", () => {
    sessionSettings()[key] = key === "contextCount" || key === "maxTokens" ? Number(element.value) || 0 : element.value;
    renderContextBadge();
    persistState(state);
  });
});

[
  ["input", els.baseUrl, "baseUrl"],
  ["input", els.apiKey, "apiKey"],
].forEach(([, element, key]) => {
  element.addEventListener("input", () => {
    apiSettings()[key] = element.value;
    persistState(state);
  });
});

els.modelInput.addEventListener("input", () => {
  setActiveModel(els.modelInput.value);
  renderModelPicker();
  renderContextBadge();
  persistState(state);
});

els.modelSelect.addEventListener("change", () => {
  setActiveModel(els.modelSelect.value);
  render();
});

document.addEventListener("click", (event) => {
  if (!modelPickerOpen) return;
  if (event.target.closest("#modelPickerPanel, #modelSelectButton")) return;
  modelPickerOpen = false;
  renderModelPicker();
});

document.addEventListener("click", (event) => {
  if (!assistantModelPickerOpen) return;
  if (event.target.closest("#assistantModelPicker, #assistantModelPickerButton, #assistantModelInput")) return;
  assistantModelPickerOpen = false;
  renderAssistantModelPicker();
});

function bindDialogBackdropClose(dialog) {
  dialog?.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    dialog.close();
  });
}

bindDialogBackdropClose(els.editDialog);
bindDialogBackdropClose(els.assistantConfigDialog);

window.addEventListener("popstate", () => {
  if (!panelManager.getActivePanel()) return;
  closePanels({ fromHistory: true });
});

els.temperature.addEventListener("input", () => {
  sessionSettings().temperature = Number(els.temperature.value);
  els.temperatureLabel.textContent = sessionSettings().temperature.toFixed(2);
  persistState(state);
});

els.unlimitedContext.addEventListener("change", () => {
  sessionSettings().unlimitedContext = els.unlimitedContext.checked;
  render();
});

els.stream.addEventListener("change", () => {
  const settings = sessionSettings();
  settings.stream = els.stream.checked;
  settings.streamTouched = true;
  persistState(state);
});

els.userNameInput?.addEventListener("input", updateSessionUserName);
els.chooseUserAvatar?.addEventListener("click", () => els.userAvatarFile?.click());
els.clearUserAvatar?.addEventListener("click", clearUserAvatar);
els.userAvatarFile?.addEventListener("change", handleUserAvatarSelected);
els.chooseSessionBackground?.addEventListener("click", () => els.sessionBackgroundFile?.click());
els.clearSessionBackground?.addEventListener("click", clearSessionBackground);
els.sessionBackgroundFile?.addEventListener("change", handleSessionBackgroundSelected);

els.layoutInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.layoutKey;
    sessionSettings().layout[key] = Number(input.value);
    applyLayout();
    renderSettings();
    resizeInput();
    persistState(state);
  });
});

els.novelFields.forEach((field) => {
  field.addEventListener("input", () => {
    sessionNovel()[field.dataset.novelKey] = field.value;
    renderContextBadge();
    renderNovelPanel();
    persistState(state);
  });
});

els.bodyImportFile?.addEventListener("change", handleBodyFileSelected);

els.saveEdit.addEventListener("click", () => saveEditor(false));
els.saveSendEdit.addEventListener("click", () => saveEditor(true));
els.assistantTemperatureInput?.addEventListener("input", () => {
  els.assistantTemperatureLabel.textContent = Number(els.assistantTemperatureInput.value).toFixed(2);
});
els.assistantModelInput?.addEventListener("focus", () => {
  if (els.assistantModelInput) els.assistantModelInput.removeAttribute("list");
});
els.assistantModelInput?.addEventListener("input", () => {
  if (els.assistantModelStatus) els.assistantModelStatus.textContent = clean(els.assistantModelInput.value) ? "手动输入" : "未选择";
  renderAssistantModelPicker();
});
els.assistantNameInput?.addEventListener("input", () => {
  if (!clean(els.assistantAvatarPreview?.dataset.avatarDataUrl)) {
    renderAvatarPreview(els.assistantAvatarPreview, "", clean(els.assistantNameInput.value) || "议");
  }
});
els.fetchAssistantModels?.addEventListener("click", fetchAssistantModels);
els.chooseAssistantAvatar?.addEventListener("click", () => els.assistantAvatarFile?.click());
els.clearAssistantAvatar?.addEventListener("click", clearAssistantAvatar);
els.assistantAvatarFile?.addEventListener("change", handleAssistantAvatarSelected);
els.importAssistant?.addEventListener("click", importAssistantConfig);
els.exportAssistant?.addEventListener("click", exportAssistantConfig);
els.assistantImportFile?.addEventListener("change", handleAssistantImportSelected);
els.activateAssistant?.addEventListener("click", activateAssistantIdentity);
els.clearAssistantActivation?.addEventListener("click", clearAssistantActivationProfile);
els.saveAssistantConfig?.addEventListener("click", saveAssistantConfig);
els.resetAssistantConfig?.addEventListener("click", resetAssistantConfig);
els.deleteAssistant?.addEventListener("click", deleteCustomRoundAssistant);

document.addEventListener("pointerdown", (event) => {
  const target = event.target.closest("button:not([data-command]), summary, input[type='checkbox'], input[type='range']");
  if (!target) return;
  pulseElement(target);
  if (target.tagName === "BUTTON" || target.tagName === "SUMMARY") addMotionRipple(target, event);
}, { passive: true });

els.roundtablePaperGrip?.addEventListener("pointerdown", handleRoundtablePaperPointerDown);
els.roundtablePaperGrip?.addEventListener("pointermove", handleRoundtablePaperPointerMove);
els.roundtablePaperGrip?.addEventListener("pointerup", finishRoundtablePaperDrag);
els.roundtablePaperGrip?.addEventListener("pointercancel", finishRoundtablePaperDrag);
els.roundtablePaperGrip?.addEventListener("click", (event) => event.preventDefault());
els.roundtablePaperViewport?.addEventListener("scroll", handleRoundtablePaperScroll, { passive: true });

window.addEventListener("resize", resizeInput);
window.visualViewport?.addEventListener("resize", resizeInput);

render();
resizeInput();
scrollBottom();
