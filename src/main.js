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

const CONTINUE_PROMPT = "继续完成上一条请求，直接输出正文，不要重复确认。";
const BRIDGE_TIMEOUT = 160000;
const DEFAULT_ROUNDTABLE_CONTEXT = {
  includeManuscript: true,
  includeNovel: true,
  includeMainChat: true,
  includeDiscussion: true,
  excerptMax: 520,
  discussionCount: 24,
  roundTopic: "",
};
const ROUND_ASSISTANTS = [
  {
    id: "setting",
    name: "设定师",
    role: "普通助手",
    prompt: "你是小说设定师。只讨论规则、世界观、设定一致性和伏笔可回收性。可以反驳别人，但要给出具体修改建议。",
  },
  {
    id: "plot",
    name: "剧情师",
    role: "普通助手",
    prompt: "你是小说剧情师。关注冲突推进、转折、节奏和章节目标。你可以指出剧情无力或转折太硬的地方。",
  },
  {
    id: "review",
    name: "审稿",
    role: "普通助手",
    prompt: "你是审稿助手。关注读者体验、逻辑漏洞、铺垫不足和情绪落点。请直接、具体、中文回答。",
  },
  {
    id: "style",
    name: "文风师",
    role: "普通助手",
    prompt: "你是文风师。关注语言质感、句式、画面、语气稳定性。不要重写大段正文，优先给修改方向。",
  },
  {
    id: "writer",
    name: "写手",
    role: "写手",
    prompt: "你是写手。根据用户和圆桌讨论继续写小说正文。只输出正文，不要解释，不要列提纲。",
  },
];
const ASSISTANT_TEMPLATES = [
  {
    id: "contrarian",
    name: "反对者",
    prompt: "你是圆桌里的反对者。你的职责是专门寻找方案中的软肋、套路、逻辑偷懒和情绪不成立之处。可以尖锐反驳，但必须给出可执行的替代方案。",
  },
  {
    id: "foreshadow",
    name: "伏笔管理员",
    prompt: "你是伏笔管理员。你只关注伏笔、回收、误导、信息差和长期结构。请指出哪些细节可以提前埋，哪些线索需要回收，哪些信息应该暂时隐藏。",
  },
  {
    id: "pacing",
    name: "节奏剪辑师",
    prompt: "你是节奏剪辑师。你关注场景进入、退出、转折密度、对白长度和读者疲劳。请直接指出哪里该删、哪里该放慢、哪里该加速。",
  },
  {
    id: "psychology",
    name: "角色心理师",
    prompt: "你是角色心理师。你关注人物动机、创伤、欲望、谎言和关系张力。请判断角色反应是否真实，并提出更有心理压力的写法。",
  },
  {
    id: "continuity",
    name: "连续性检查员",
    prompt: "你是连续性检查员。你关注设定前后矛盾、时间线、称呼、道具、能力边界和人物已知信息。请列出风险并给出修正建议。",
  },
];

const $ = (selector) => document.querySelector(selector);
const els = {
  body: document.body,
  title: $("#sessionTitle"),
  messages: $("#messageList"),
  menu: $("#messageMenu"),
  composer: $("#composer"),
  input: $("#chatInput"),
  send: $("#sendButton"),
  contextBadge: $("#contextBadge"),
  modelSelect: $("#modelSelect"),
  backdrop: $("#backdrop"),
  historyPanel: $("#historyPanel"),
  settingsPanel: $("#settingsPanel"),
  novelPanel: $("#novelPanel"),
  contextPanel: $("#contextPanel"),
  roundtablePanel: $("#roundtablePanel"),
  roundtableWorkspace: $("#roundtableWorkspace"),
  roundtableMembersPanel: $("#roundtableMembersPanel"),
  roundtableContextButton: $("#roundtableContextButton"),
  roundtableContextDock: $("#roundtableContextDock"),
  roundtablePaper: $("#roundtablePaper"),
  roundtablePaperViewport: $("#roundtablePaperViewport"),
  roundtablePaperGrip: $("#roundtablePaperGrip"),
  roundtablePaperGripLabel: $("#roundtablePaperGripLabel"),
  roundtablePaperJump: $("#roundtablePaperJump"),
  roundtableManuscript: $("#roundtableManuscript"),
  roundtablePaperStatus: $("#roundtablePaperStatus"),
  roundtableDiscussion: $("#roundtableDiscussion"),
  novelFields: Array.from(document.querySelectorAll("[data-novel-key]")),
  novelStats: $("#novelStats"),
  novelVersionList: $("#novelVersionList"),
  bodyImportFile: $("#bodyImportFile"),
  sessionList: $("#sessionList"),
  historySearch: $("#historySearch"),
  systemPrompt: $("#systemPromptInput"),
  baseUrl: $("#baseUrlInput"),
  apiKey: $("#apiKeyInput"),
  modelInput: $("#modelInput"),
  modelDatalist: $("#modelDatalist"),
  modelStatus: $("#modelStatus"),
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
  assistantTemplateSelect: $("#assistantTemplateSelect"),
  assistantModelInput: $("#assistantModelInput"),
  assistantTemperatureInput: $("#assistantTemperatureInput"),
  assistantTemperatureLabel: $("#assistantTemperatureLabel"),
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
let streamShouldFollow = true;
let toastTimer = null;
let paperScrollPersistTimer = null;
const paperDrag = {
  active: false,
  moved: false,
  pointerId: null,
  startY: 0,
  startReveal: 0.68,
};
const bridgeCallbacks = new Map();
const bridgeStreamCallbacks = new Map();
const panelManager = createPanelManager(els, {
  onShow: (name) => {
    if (name === "context") renderContextPanel();
    if (name === "novel") renderNovelPanel();
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

function sessionNovel(session = activeSession()) {
  session.novel = { ...createDefaultNovel(), ...(session.novel || {}) };
  session.novel.versions = Array.isArray(session.novel.versions)
    ? session.novel.versions.filter((version) => version && typeof version === "object" && clean(version.body))
    : [];
  return session.novel;
}

function roundtableState(session = activeSession()) {
  session.roundtable ||= {};
  const rt = session.roundtable;
  rt.enabled = Boolean(rt.enabled);
  rt.membersOpen = Boolean(rt.membersOpen);
  rt.contextOpen = Boolean(rt.contextOpen);
  rt.customAssistants = Array.isArray(rt.customAssistants)
    ? rt.customAssistants.map(normalizeCustomAssistant).filter(Boolean)
    : [];
  rt.selectedIds = Array.isArray(rt.selectedIds) && rt.selectedIds.length
    ? rt.selectedIds.filter((id) => {
        const assistant = getRoundAssistantBase(id, session);
        return assistant && assistant.id !== "writer";
      })
    : ["setting", "plot", "review"];
  rt.messages = Array.isArray(rt.messages) ? rt.messages : [];
  rt.assistantConfigs = rt.assistantConfigs && typeof rt.assistantConfigs === "object" ? rt.assistantConfigs : {};
  rt.roundProgress = rt.roundProgress && typeof rt.roundProgress === "object" ? rt.roundProgress : null;
  rt.contextOptions = normalizeRoundtableContextOptions(rt.contextOptions);
  rt.paperReveal = clamp(Number.isFinite(Number(rt.paperReveal)) ? Number(rt.paperReveal) : 0.68, 0, 1);
  rt.paperScrollTop = Math.max(0, Number(rt.paperScrollTop) || 0);
  rt.paperAtBottom = rt.paperAtBottom !== false;
  rt.paperTextLength = Math.max(0, Number(rt.paperTextLength) || 0);
  rt.paperHasNewProse = Boolean(rt.paperHasNewProse);
  return rt;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeRoundtableContextOptions(options = {}) {
  const source = options && typeof options === "object" ? options : {};
  return {
    includeManuscript: source.includeManuscript !== false,
    includeNovel: source.includeNovel !== false,
    includeMainChat: source.includeMainChat !== false,
    includeDiscussion: source.includeDiscussion !== false,
    excerptMax: clamp(Number(source.excerptMax) || DEFAULT_ROUNDTABLE_CONTEXT.excerptMax, 120, 2400),
    discussionCount: clamp(Number(source.discussionCount) || DEFAULT_ROUNDTABLE_CONTEXT.discussionCount, 0, 80),
    roundTopic: clean(source.roundTopic || ""),
  };
}

function normalizeCustomAssistant(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const id = clean(item.id) || uid("round_member");
  if (id === "writer" || ROUND_ASSISTANTS.some((assistant) => assistant.id === id)) return null;
  return {
    id,
    name: clean(item.name) || `助手${index + 1}`,
    role: clean(item.role) || "普通助手",
    prompt: clean(item.prompt) || "你是圆桌共创成员。请基于正文、小说资料和以上讨论，给出独立、具体、中文的创作意见。可以反驳其他成员，但要说明原因。",
  };
}

function getRoundAssistantBases(session = activeSession()) {
  const custom = Array.isArray(session?.roundtable?.customAssistants)
    ? session.roundtable.customAssistants.map(normalizeCustomAssistant).filter(Boolean)
    : [];
  return [...ROUND_ASSISTANTS, ...custom];
}

function getRoundAssistantBase(id, session = activeSession()) {
  return getRoundAssistantBases(session).find((assistant) => assistant.id === id) || null;
}

function getRoundAssistants() {
  return getRoundAssistantBases().map((assistant) => getRoundAssistant(assistant.id)).filter(Boolean);
}

function isCustomRoundAssistant(id) {
  return roundtableState().customAssistants.some((assistant) => assistant.id === id);
}

function getRoundAssistant(id) {
  const base = getRoundAssistantBase(id);
  if (!base) return null;
  const config = roundtableState().assistantConfigs[id] || {};
  return {
    ...base,
    ...config,
    id: base.id,
    role: base.role,
    name: clean(config.name) || base.name,
    prompt: clean(config.prompt) || base.prompt,
    model: clean(config.model),
    temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : sessionSettings().temperature,
  };
}

function getRoundAssistantConfig(id) {
  const assistant = getRoundAssistant(id);
  if (!assistant) return null;
  return {
    name: assistant.name,
    prompt: assistant.prompt,
    model: assistant.model || "",
    temperature: Number.isFinite(Number(assistant.temperature)) ? Number(assistant.temperature) : sessionSettings().temperature,
  };
}

function normalizeMentionName(value) {
  return clean(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function assistantAliases(assistant) {
  const base = getRoundAssistantBase(assistant.id) || assistant;
  const names = new Set([
    assistant.id,
    assistant.name,
    base.name,
  ]);
  if (assistant.id === "setting") ["设定", "设定师", "世界观"].forEach((name) => names.add(name));
  if (assistant.id === "plot") ["剧情", "剧情师", "编剧", "剧情大手"].forEach((name) => names.add(name));
  if (assistant.id === "review") ["审稿", "审稿人", "审核", "编辑"].forEach((name) => names.add(name));
  if (assistant.id === "style") ["文风", "文风师", "润色", "风格"].forEach((name) => names.add(name));
  if (assistant.id === "writer") ["写手", "writer", "作者", "正文"].forEach((name) => names.add(name));
  return [...names].map(normalizeMentionName).filter(Boolean);
}

function parseRoundtableMentions(text) {
  const source = clean(text);
  if (!source.includes("@")) return [];
  const normalized = normalizeMentionName(source);
  return getRoundAssistants()
    .filter((assistant) => assistantAliases(assistant).some((alias) => normalized.includes(`@${alias}`)));
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
  const messages = [];
  if (clean(settings.systemPrompt)) {
    messages.push({ role: "system", content: settings.systemPrompt });
  }
  const novelMemory = buildNovelMemory();
  if (novelMemory) {
    messages.push({ role: "system", content: novelMemory });
  }
  selected.forEach((node) => {
    if (node.role === "user") messages.push({ role: "user", content: node.content });
    if (node.role === "assistant") messages.push({ role: "assistant", content: getAssistantVersion(node)?.content || "" });
  });
  if (clean(extraUserText)) messages.push({ role: "user", content: extraUserText });
  return messages.filter((message) => clean(message.content));
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

function scrollBottom() {
  requestAnimationFrame(() => {
    els.messages.scrollTop = els.messages.scrollHeight;
  });
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 1800);
}

function showPanel(name) {
  panelManager.showPanel(name);
}

function closePanels() {
  panelManager.closePanels();
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

function render() {
  const session = activeSession();
  applyLayout();
  els.title.textContent = titleForSession(session);
  renderRoundtable();
  renderMessages();
  renderSessions();
  renderSettings();
  renderCustomLayoutPresets();
  renderNovelPanel();
  renderModelPicker();
  renderContextBadge();
  renderMenu();
  els.body.classList.toggle("is-generating", isGenerating);
  els.body.classList.toggle("roundtable-mode", roundtableState(session).enabled);
  els.body.classList.toggle("roundtable-busy", roundtableGenerating);
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)));
  persistState(state);
}

function renderRoundtable() {
  if (!els.roundtableWorkspace) return;
  const rt = roundtableState();
  els.roundtableWorkspace.hidden = !rt.enabled;
  els.messages.hidden = rt.enabled;
  if (rt.enabled) {
    els.input.placeholder = "在圆桌里发言；输入 @写手 可把讨论转成正文...";
  } else {
    els.input.placeholder = "在这里输入你的问题...";
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
    els.roundtableContextDock.hidden = !rt.enabled || !rt.contextOpen;
    els.roundtableContextDock.innerHTML = rt.enabled && rt.contextOpen ? renderRoundtableContextControls(rt) : "";
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
}

function renderRoundtableMembers(rt) {
  const order = new Map(rt.selectedIds.map((id, index) => [id, index + 1]));
  const members = getRoundAssistantBases()
    .map((base) => {
      const assistant = getRoundAssistant(base.id);
      const isWriter = assistant.id === "writer";
      const selected = isWriter ? "写" : order.get(assistant.id);
      const model = assistant.model || sessionSettings().model || "未选模型";
      return `
        <div class="roundtable-member-option ${selected ? "selected" : ""} ${isWriter ? "writer" : ""}">
          <button class="roundtable-member-main" type="button" data-command="${isWriter ? "roundtable-edit-assistant" : "roundtable-toggle-member"}" data-member-id="${assistant.id}">
            <span>${selected || ""}</span>
            <b>${escapeHtml(assistant.name)}</b>
            <small>${escapeHtml(assistant.role)} · ${escapeHtml(model)}</small>
          </button>
          <button class="roundtable-member-edit" type="button" data-command="roundtable-edit-assistant" data-member-id="${assistant.id}">改</button>
        </div>
      `;
    })
    .join("");
  return `${members}
    <button class="roundtable-member-add" type="button" data-command="roundtable-add-assistant">+ 添加助手</button>`;
}

function renderRoundtableContextControls(rt) {
  const options = normalizeRoundtableContextOptions(rt.contextOptions);
  const checked = (value) => value ? "checked" : "";
  return `
    <section class="roundtable-context-options" aria-label="圆桌上下文">
      <div class="roundtable-context-head">
        <b>本轮上下文</b>
        <span>控制助手能看到哪些材料</span>
      </div>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeManuscript" ${checked(options.includeManuscript)} />
        <span>正文小窗</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeNovel" ${checked(options.includeNovel)} />
        <span>小说资料</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeMainChat" ${checked(options.includeMainChat)} />
        <span>主线对话</span>
      </label>
      <label>
        <input type="checkbox" data-roundtable-context-key="includeDiscussion" ${checked(options.includeDiscussion)} />
        <span>圆桌记录</span>
      </label>
      <label class="roundtable-context-number">
        <span>正文截取</span>
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
  return `
    <div class="roundtable-empty">
      <strong>把正文放到桌上，再让群里开始聊。</strong>
      <span>你可以先说一句需求，或点“开始本轮”让设定师、剧情师、审稿依次发言。</span>
    </div>
  `;
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
  const profiles = {
    user: { avatar: "我", badge: "发起人", tone: "tone-user", name: "你" },
    setting: { avatar: "设", badge: "设定", tone: "tone-setting", name: "设定师" },
    plot: { avatar: "剧", badge: "剧情", tone: "tone-plot", name: "剧情师" },
    review: { avatar: "审", badge: "审稿", tone: "tone-review", name: "审稿" },
    style: { avatar: "风", badge: "文风", tone: "tone-style", name: "文风师" },
    writer: { avatar: "写", badge: "写手", tone: "tone-writer", name: "写手" },
  };
  const profile = profiles[message.speakerId];
  const fallbackName = clean(message.speakerName) || profile?.name || "成员";
  return {
    ...(profile || { avatar: fallbackName.slice(0, 1) || "聊", badge: "讨论", tone: "tone-review", name: fallbackName }),
    name: fallbackName,
  };
}

function renderRoundtableMessage(message) {
  const isUser = message.speakerId === "user";
  const isWriter = message.speakerId === "writer";
  const profile = getRoundtableSpeakerProfile(message);
  const time = formatTime(message.createdAt);
  const decision = renderRoundtableDecisionBadge(message);
  if (isWriter) {
    return `
      <article class="roundtable-writer-block ${profile.tone}">
        <div class="roundtable-writer-card" data-command="toggle-roundtable-menu" data-round-id="${message.id}">
          <div class="roundtable-writer-head">
            <div class="roundtable-avatar ${profile.tone}">${profile.avatar}</div>
            <div class="roundtable-writer-meta">
              <div class="roundtable-writer-title">
                <strong>${escapeHtml(profile.name)}</strong>
                <span class="roundtable-role-badge ${profile.tone}">${escapeHtml(profile.badge)}</span>
              </div>
              <time>${escapeHtml(time)}</time>
            </div>
          </div>
          ${decision}
          <div class="roundtable-writer-tip">已将这一段同步到上方正文区</div>
          <div class="roundtable-writer-snippet">${escapeHtml(message.content || "")}</div>
        </div>
      </article>
    `;
  }
  return `
    <article class="roundtable-line ${isUser ? "user" : ""} ${profile.tone}">
      <div class="roundtable-avatar ${profile.tone}">${profile.avatar}</div>
      <div class="roundtable-bubble-stack">
        <div class="roundtable-bubble-meta">
          <span class="roundtable-speaker">${escapeHtml(profile.name)}</span>
          <span class="roundtable-role-badge ${profile.tone}">${escapeHtml(profile.badge)}</span>
          ${decision}
          <time>${escapeHtml(time)}</time>
        </div>
        <div class="roundtable-speech" data-command="toggle-roundtable-menu" data-round-id="${message.id}">${escapeHtml(message.content || "")}</div>
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

function roundtableDateKey(value) {
  const date = new Date(value || Date.now());
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function getViewportHeight() {
  return Math.round(window.visualViewport?.height || window.innerHeight || 760);
}

function getRoundtablePaperMetrics() {
  const viewportHeight = getViewportHeight();
  const minHeight = clamp(Math.round(viewportHeight * 0.16), 108, 148);
  const maxHeight = clamp(Math.round(viewportHeight * 0.46), 228, 430);
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
  els.roundtablePaper.style.setProperty("--paper-body-height", `${metrics.currentHeight}px`);
  els.roundtablePaper.style.setProperty("--paper-progress", `${metrics.reveal.toFixed(3)}`);
  els.roundtablePaper.classList.toggle("paper-peek", metrics.reveal < 0.96);
  els.roundtablePaper.classList.toggle("paper-deep-collapsed", metrics.reveal < 0.24);
  if (els.roundtablePaperGripLabel) {
    els.roundtablePaperGripLabel.textContent = `${Math.round(metrics.reveal * 100)}%`;
  }
  if (els.roundtablePaperGrip) {
    els.roundtablePaperGrip.dataset.state = metrics.reveal < 0.32 ? "collapsed" : metrics.reveal > 0.8 ? "expanded" : "mid";
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
  const reveal = roundtableState().paperReveal;
  setRoundtablePaperReveal(reveal > 0.72 ? 0.24 : 0.88);
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
  return `<div class="avatar">${role === "user" ? "我" : "AI"}</div>`;
}

function renderMessage(node) {
  const content = getMessageContent(node);
  const version = getAssistantVersion(node);
  const usage = version?.usage?.total_tokens ? ` · ${formatK(version.usage.total_tokens)} tok` : "";
  const versionIndex = node.role === "assistant" ? Math.max(0, node.versions.findIndex((item) => item.id === node.activeVersionId)) + 1 : 1;
  const switcher = node.role === "assistant"
    ? `<div class="switcher">
        <button type="button" data-command="prev-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""}>‹</button>
        <span>${versionIndex}/${node.versions.length}</span>
        <button type="button" data-command="next-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""}>›</button>
      </div>`
    : renderBranchSwitcher(node);
  return `
    <article class="message-row ${node.role}" data-node-id="${node.id}">
      ${renderAvatar(node.role)}
      <div class="message-card" data-command="toggle-menu" data-node-id="${node.id}">
        <span class="message-content">${escapeHtml(content)}</span>${isGenerating && generatingNodeId === node.id ? '<span class="stream-caret"></span>' : ""}
        <div class="message-meta">word count: ${content.length}, time: ${formatTime(version?.createdAt || node.createdAt)}${usage}</div>
        <button class="message-more" type="button" data-command="toggle-menu" data-node-id="${node.id}">⋯</button>
      </div>
      ${switcher}
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
    <button type="button" data-command="send-main-to-roundtable" data-node-id="${node.id}">发到圆桌</button>
    <button type="button" data-command="copy-message" data-node-id="${node.id}">复制</button>
    <button type="button" data-command="delete-message" data-node-id="${node.id}">删除</button>
  `;
  const assistantActions = `
    <button type="button" data-command="regen-ai" data-node-id="${node.id}">重新生成</button>
    <button type="button" data-command="edit-ai" data-node-id="${node.id}">编辑AI输出</button>
    <button type="button" data-command="continue-ai" data-node-id="${node.id}">继续</button>
    <button type="button" data-command="send-main-to-roundtable" data-node-id="${node.id}">发到圆桌</button>
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
    ${isWriter ? `<button type="button" data-command="undo-writer-sync" data-round-id="${message.id}">撤回正文</button>` : ""}
    ${isWriter ? `<button type="button" data-command="rewrite-writer-sync" data-round-id="${message.id}">重写并替换</button>` : ""}
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

function renderSettings() {
  const s = sessionSettings();
  const api = apiSettings();
  if (document.activeElement !== els.systemPrompt) els.systemPrompt.value = s.systemPrompt;
  if (document.activeElement !== els.baseUrl) els.baseUrl.value = api.baseUrl;
  if (document.activeElement !== els.apiKey) els.apiKey.value = api.apiKey;
  if (document.activeElement !== els.modelInput) els.modelInput.value = s.model;
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

function formatLayoutValue(key, value) {
  if (key === "messageLineHeight") return `${value}%`;
  return `${value}px`;
}

function renderModelPicker() {
  const settings = sessionSettings();
  const models = Array.from(new Set([settings.model, ...apiSettings().models].filter(Boolean)));
  els.modelSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  els.modelSelect.value = settings.model;
  els.modelDatalist.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
  renderAssistantTemplates();
}

function renderContextBadge() {
  const info = contextInfo(clean(els.input.value));
  drawContextBadge(els, info, formatK);
}

function renderAssistantTemplates() {
  if (!els.assistantTemplateSelect) return;
  els.assistantTemplateSelect.innerHTML = [
    `<option value="">选择模板套用...</option>`,
    ...ASSISTANT_TEMPLATES.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`),
  ].join("");
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

function validateApi(settings = sessionSettings()) {
  if (!clean(apiSettings().apiKey)) throw new Error("请先在设置里填写 API Key");
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
  streamShouldFollow = shouldFollowBottom();
  activeMenuNodeId = nodeId;
  setAssistantVersionContent(node, version, "");
  version.usage = null;
  render();
  scrollBottom();
  try {
    const result = sessionSettings().stream
      ? await callOpenAIStream((partial) => {
          setAssistantVersionContent(node, version, partial);
          renderStreamingNode(nodeId, versionId);
        }, nodeId, continueMode)
      : await callOpenAI(nodeId, continueMode);
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
    streamShouldFollow = false;
    render();
    if (shouldFollowBottom()) scrollBottom();
  }
}

function renderStreamingNode(nodeId, versionId) {
  const node = getNode(nodeId);
  const version = node?.versions.find((item) => item.id === versionId);
  const card = els.messages.querySelector(`[data-node-id="${nodeId}"] .message-card`);
  if (!card || !version) {
    render();
    return;
  }
  const contentElement = card.querySelector(".message-content");
  if (!contentElement) return render();
  contentElement.textContent = version.content || "";
  if (!card.querySelector(".stream-caret")) {
    contentElement.insertAdjacentHTML("afterend", '<span class="stream-caret"></span>');
  }
  if (streamShouldFollow && shouldFollowBottom()) scrollBottom();
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
  streamShouldFollow = false;
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

async function callOpenAITextWithSettings(messages, settingsOverride) {
  validateApi(settingsOverride || sessionSettings());
  abortController = new AbortController();
  try {
    return await aiClient.generateText({
      api: apiSettings(),
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

function sendMainMessageToRoundtable(nodeId) {
  const node = getNode(nodeId);
  const content = clean(getMessageContent(node));
  if (!node || !content) return;
  const rt = roundtableState();
  rt.enabled = true;
  const speakerName = node.role === "user" ? "主线用户" : "主线AI";
  addRoundtableMessage("mainline", speakerName, content, {
    source: { type: "mainline", nodeId },
  });
  activeMenuNodeId = null;
  closePanels();
  render();
  resizeInput();
  showToast("已发送到圆桌讨论");
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
  if (["includeManuscript", "includeNovel", "includeMainChat", "includeDiscussion"].includes(key)) {
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
    name: `新助手${rt.customAssistants.length + 1}`,
    role: "普通助手",
    prompt: "你是圆桌共创成员。请基于正文、小说资料和以上讨论，给出独立、具体、中文的创作意见。可以反驳其他成员，但要说明原因。",
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
  els.assistantConfigTitle.textContent = `${assistant.name}设置`;
  els.assistantNameInput.value = config.name;
  els.assistantModelInput.value = config.model;
  els.assistantTemperatureInput.value = config.temperature;
  els.assistantTemperatureLabel.textContent = Number(config.temperature).toFixed(2);
  els.assistantPromptInput.value = config.prompt;
  if (els.assistantTemplateSelect) els.assistantTemplateSelect.value = "";
  if (els.deleteAssistant) {
    els.deleteAssistant.hidden = !isCustomRoundAssistant(id);
  }
  els.assistantConfigDialog.showModal();
  requestAnimationFrame(() => els.assistantPromptInput.focus());
}

function applyAssistantTemplate(templateId) {
  const template = ASSISTANT_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return;
  els.assistantNameInput.value = template.name;
  els.assistantPromptInput.value = template.prompt;
}

function currentAssistantFormConfig() {
  return {
    name: clean(els.assistantNameInput.value),
    model: clean(els.assistantModelInput.value),
    temperature: Number(els.assistantTemperatureInput.value),
    prompt: clean(els.assistantPromptInput.value),
  };
}

function exportAssistantConfig() {
  if (!assistantConfigTargetId) return;
  const config = currentAssistantFormConfig();
  if (!config.name && !config.prompt) return showToast("助手配置为空");
  const payload = {
    type: "roundtable-assistant",
    version: 1,
    exportedAt: Date.now(),
    config,
  };
  downloadText(`Roundtable-助手-${config.name || assistantConfigTargetId}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  showToast("助手配置已导出");
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
    if (!name || !prompt) return showToast("助手配置 JSON 缺少 name/prompt");
    els.assistantNameInput.value = name;
    els.assistantModelInput.value = clean(config.model);
    const temperature = Number(config.temperature);
    els.assistantTemperatureInput.value = Number.isFinite(temperature) ? clamp(temperature, 0, 2) : sessionSettings().temperature;
    els.assistantTemperatureLabel.textContent = Number(els.assistantTemperatureInput.value).toFixed(2);
    els.assistantPromptInput.value = prompt;
    showToast("助手配置已导入，保存后生效");
  } catch (error) {
    showToast(humanizeError(error, "助手配置导入失败"));
  } finally {
    if (els.assistantImportFile) els.assistantImportFile.value = "";
  }
}

function closeAssistantConfig() {
  assistantConfigTargetId = null;
  if (els.assistantConfigDialog?.open) els.assistantConfigDialog.close();
}

function saveAssistantConfig() {
  const id = assistantConfigTargetId;
  const base = getRoundAssistantBase(id);
  if (!base) return;
  const rt = roundtableState();
  const model = clean(els.assistantModelInput.value);
  rt.assistantConfigs[id] = {
    name: clean(els.assistantNameInput.value) || base.name,
    model,
    temperature: Number(els.assistantTemperatureInput.value),
    prompt: clean(els.assistantPromptInput.value) || base.prompt,
  };
  if (model) {
    const api = apiSettings();
    api.models = Array.from(new Set([model, ...api.models]));
  }
  closeAssistantConfig();
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("助手设置已保存");
}

function resetAssistantConfig() {
  const id = assistantConfigTargetId;
  if (!getRoundAssistantBase(id)) return;
  delete roundtableState().assistantConfigs[id];
  closeAssistantConfig();
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已恢复默认助手设置");
}

function deleteCustomRoundAssistant() {
  const id = assistantConfigTargetId;
  if (!id || !isCustomRoundAssistant(id)) return;
  const rt = roundtableState();
  rt.customAssistants = rt.customAssistants.filter((assistant) => assistant.id !== id);
  rt.selectedIds = rt.selectedIds.filter((selectedId) => selectedId !== id);
  delete rt.assistantConfigs[id];
  closeAssistantConfig();
  touchSession(activeSession());
  render();
  persistState(state);
  showToast("已删除自定义助手");
}

function addRoundtableMessage(speakerId, speakerName, content, extra = {}) {
  const rt = roundtableState();
  const shouldFollowPaper = speakerId === "writer" && els.roundtablePaperViewport
    ? els.roundtablePaperViewport.scrollHeight - els.roundtablePaperViewport.scrollTop - els.roundtablePaperViewport.clientHeight < 72
    : false;
  const message = {
    id: uid("round"),
    speakerId,
    speakerName,
    content: clean(content),
    createdAt: Date.now(),
    ...extra,
  };
  rt.messages.push(message);
  rt.messages = rt.messages.slice(-80);
  touchSession(activeSession());
  render();
  if (speakerId === "writer" && shouldFollowPaper) {
    scrollRoundtablePaperBottom();
  }
  scrollRoundtableBottom();
  return message;
}

function getRoundtableMessage(id) {
  return roundtableState().messages.find((message) => message.id === id) || null;
}

function toggleRoundtableMenu(id) {
  activeMenuNodeId = null;
  activeRoundtableMessageId = activeRoundtableMessageId === id ? null : id;
  renderMenu();
}

function deleteRoundtableMessage(id) {
  if (roundtableGenerating || isGenerating) return showToast("生成中不能删除圆桌消息");
  const rt = roundtableState();
  const before = rt.messages.length;
  rt.messages = rt.messages.filter((message) => message.id !== id);
  if (rt.messages.length === before) return;
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
  if (!message || message.speakerId === "user") return;
  message.decisionStatus = message.decisionStatus === status ? "" : status;
  message.decidedAt = message.decisionStatus ? Date.now() : null;
  activeRoundtableMessageId = null;
  touchSession(activeSession());
  render();
  persistState(state);
  const labels = { adopted: "已标记采纳", ignored: "已标记忽略", approved: "已标记通过", revision: "已标记需修改" };
  showToast(labels[status] || "已更新标记");
}

function createWriterSyncSegment(previousBody, text) {
  const previous = clean(previousBody);
  const content = clean(text);
  const separator = previous ? "\n\n" : "";
  const segment = `${separator}${content}`;
  return {
    body: `${previous}${segment}`,
    segment,
    start: previous.length,
    end: previous.length + segment.length,
    content,
  };
}

function syncWriterMessageToNovel(message, text) {
  const segment = createWriterSyncSegment(sessionNovel().body, text);
  sessionNovel().body = segment.body;
  recordManuscriptVersion("写手续写");
  message.manuscriptSync = {
    active: true,
    start: segment.start,
    end: segment.end,
    segment: segment.segment,
    content: segment.content,
    updatedAt: Date.now(),
  };
}

function replaceSyncedWriterSegment(message, nextText) {
  const novel = sessionNovel();
  const body = novel.body || "";
  const sync = message?.manuscriptSync;
  const content = clean(nextText);
  if (!content) return false;
  if (sync?.active && Number.isFinite(sync.start) && Number.isFinite(sync.end)) {
    const currentSegment = body.slice(sync.start, sync.end);
    if (currentSegment === sync.segment) {
      const replacement = `${sync.start > 0 ? "\n\n" : ""}${content}`;
      novel.body = `${body.slice(0, sync.start)}${replacement}${body.slice(sync.end)}`;
      recordManuscriptVersion("写手替换");
      message.manuscriptSync = {
        active: true,
        start: sync.start,
        end: sync.start + replacement.length,
        segment: replacement,
        content,
        updatedAt: Date.now(),
      };
      return true;
    }
  }
  const oldContent = clean(sync?.content || message?.content);
  const trimmedBody = clean(body);
  if (!oldContent || !trimmedBody.endsWith(oldContent)) return false;
  const previousBody = clean(trimmedBody.slice(0, -oldContent.length));
  const fallback = createWriterSyncSegment(previousBody, content);
  novel.body = fallback.body;
  recordManuscriptVersion("写手替换");
  message.manuscriptSync = {
    active: true,
    start: fallback.start,
    end: fallback.end,
    segment: fallback.segment,
    content: fallback.content,
    updatedAt: Date.now(),
  };
  return true;
}

function removeSyncedWriterSegment(message) {
  const novel = sessionNovel();
  const body = novel.body || "";
  const sync = message?.manuscriptSync;
  if (sync?.active && Number.isFinite(sync.start) && Number.isFinite(sync.end)) {
    const currentSegment = body.slice(sync.start, sync.end);
    if (currentSegment === sync.segment) {
      novel.body = clean(`${body.slice(0, sync.start)}${body.slice(sync.end)}`);
      recordManuscriptVersion("撤回写手正文");
      message.manuscriptSync = { ...sync, active: false, removedAt: Date.now() };
      return true;
    }
  }
  const content = clean(sync?.content || message?.content);
  const trimmedBody = clean(body);
  if (content && trimmedBody.endsWith(content)) {
    novel.body = clean(trimmedBody.slice(0, -content.length));
    recordManuscriptVersion("撤回写手正文");
    message.manuscriptSync = {
      ...(sync || {}),
      active: false,
      content,
      removedAt: Date.now(),
    };
    return true;
  }
  return false;
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
  const adopted = roundtableState().messages
    .filter((message) => message.decisionStatus === "adopted" && clean(message.content))
    .slice(-12);
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
    validateApi();
    const writer = getRoundAssistant("writer");
    const text = await callRoundtableAssistant(writer, `请重写下面这段正文。保留创作意图，但改善表达、节奏和画面。只输出重写后的正文：\n${message.content}`);
    if (roundtableShouldStop) return;
    const next = clean(text);
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
  if (!assistant) return showToast("找不到这个助手");
  roundtableGenerating = true;
  activeRoundtableMessageId = null;
  render();
  try {
    validateApi();
    const text = await callRoundtableAssistant(assistant, `请重新回答你上一条圆桌发言。上一条内容是：\n${message.content}`);
    message.content = clean(text);
    message.createdAt = Date.now();
    message.speakerName = assistant.name;
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

function scrollRoundtableBottom() {
  requestAnimationFrame(() => {
    if (els.roundtableWorkspace) {
      els.roundtableWorkspace.scrollTop = els.roundtableWorkspace.scrollHeight;
    }
  });
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

async function handleRoundtableUser(text) {
  addRoundtableMessage("user", "我", text);
  const mentions = parseRoundtableMentions(text);
  if (!mentions.length) return;
  const writer = mentions.find((assistant) => assistant.id === "writer");
  if (writer) return generateRoundtableWriter(text);
  await generateMentionedRoundtableAssistants(mentions, text);
}

async function generateMentionedRoundtableAssistants(assistants, userText) {
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  const targets = assistants.filter((assistant) => assistant.id !== "writer");
  if (!targets.length) return;
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    validateApi();
    for (const assistant of targets) {
      if (roundtableShouldStop) break;
      showToast(`${assistant.name}正在回应`);
      const text = await callRoundtableAssistant(assistant, `用户刚刚点名你发言：${userText}`);
      if (roundtableShouldStop) break;
      addRoundtableMessage(assistant.id, assistant.name, text);
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
  }
}

async function startRoundtableRound() {
  const rt = roundtableState();
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  if (!rt.selectedIds.length) return showToast("先在成员里选择至少一个参与者");
  rt.roundProgress = { ids: [...rt.selectedIds], nextIndex: 0, topic: clean(rt.contextOptions?.roundTopic), updatedAt: Date.now() };
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
    validateApi();
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
      const text = await callRoundtableAssistant(assistant, topic ? `请围绕本轮主题发表意见：${topic}` : "请根据当前正文和以上圆桌讨论发表你的意见。");
      if (roundtableShouldStop) break;
      addRoundtableMessage(assistant.id, assistant.name, text);
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
    validateApi();
    const writer = getRoundAssistant("writer");
    const text = await callRoundtableAssistant(writer, userText || "请根据圆桌讨论继续写正文。");
    if (roundtableShouldStop) return;
    const message = addRoundtableMessage("writer", writer.name || "写手", text);
    syncWriterMessageToNovel(message, text);
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

async function callRoundtableAssistant(assistant, instruction) {
  const messages = buildRoundtableMessages(assistant, instruction);
  const settings = {
    ...sessionSettings(),
    model: assistant.model || sessionSettings().model,
    temperature: Number.isFinite(Number(assistant.temperature)) ? Number(assistant.temperature) : sessionSettings().temperature,
  };
  return callOpenAITextWithSettings(messages, settings);
}

function buildRoundtableMessages(assistant, instruction) {
  const rt = roundtableState();
  const options = normalizeRoundtableContextOptions(rt.contextOptions);
  const participants = getRoundAssistants()
    .map((current) => `${current.name}：${current.role}`)
    .join("；");
  const discussion = options.includeDiscussion ? rt.messages
    .slice(-options.discussionCount)
    .map((message) => `${message.speakerName}：${message.content}`)
    .join("\n") : "";
  const source = [
    `【当前模式】圆桌小说共创。参与者包括：${participants}`,
    "【发言规则】必须知道是谁说的话，不要把不同成员的意见串成同一个人。可自然赞同或反驳其他成员。",
    options.roundTopic ? `【本轮主题】${options.roundTopic}` : "",
    `【你的身份】${assistant.name}。${assistant.prompt}`,
    options.includeManuscript ? `【当前正文小窗】\n${getRoundtablePromptExcerpt(options.excerptMax)}` : "",
    options.includeNovel ? `【小说资料】\n${buildNovelMemory() || "暂无小说资料。"}` : "",
    options.includeMainChat ? `【最近主线对话】\n${getNovelSourceText() || "暂无主线对话。"}` : "",
    options.includeDiscussion ? `【圆桌讨论记录】\n${discussion || "暂无讨论。"}` : "",
    `【本轮任务】${instruction}`,
  ].filter(Boolean).join("\n\n");
  return [{ role: "user", content: source }];
}

const handleCommand = createCommandRegistry({
  "open-history": () => showPanel("history"),
  "open-settings": () => showPanel("settings"),
  "open-novel": () => showPanel("novel"),
  "open-context": () => showPanel("context"),
  "open-roundtable": () => toggleRoundtable(),
  "toggle-roundtable": () => toggleRoundtable(),
  "toggle-roundtable-members": () => toggleRoundtableMembers(),
  "toggle-roundtable-context": () => toggleRoundtableContextDock(),
  "roundtable-add-assistant": () => createCustomRoundAssistant(),
  "roundtable-toggle-member": (target) => toggleRoundtableMember(target.dataset.memberId),
  "roundtable-edit-assistant": (target) => openAssistantConfig(target.dataset.memberId),
  "roundtable-start": () => startRoundtableRound(),
  "roundtable-resume": () => resumeRoundtableRound(),
  "roundtable-stop": () => stopRoundtableGeneration(),
  "jump-roundtable-paper": () => jumpRoundtablePaperLatest(),
  "open-search": () => showPanel("history"),
  "roundtable-preview": () => toggleRoundtable(),
  "close-panels": () => closePanels(),
  "new-session": () => newSession(),
  "switch-session": (target) => switchSession(target.dataset.sessionId),
  "copy-session": (target) => copySession(target.dataset.sessionId),
  "delete-session": (target) => deleteSession(target.dataset.sessionId),
  "fetch-models": () => fetchModels(),
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
  "send-main-to-roundtable": (target) => sendMainMessageToRoundtable(target.dataset.nodeId),
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
}, (command, target) => handleCommand(command, target));

els.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
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
  document.documentElement.style.setProperty("--composer-height", `${composerHeight}px`);
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
  event.preventDefault();
}

function handleRoundtablePaperPointerMove(event) {
  if (!paperDrag.active || event.pointerId !== paperDrag.pointerId) return;
  const metrics = getRoundtablePaperMetrics();
  const range = Math.max(1, metrics.maxHeight - metrics.minHeight);
  const delta = paperDrag.startY - event.clientY;
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
  const wasMoved = paperDrag.moved;
  paperDrag.active = false;
  paperDrag.pointerId = null;
  paperDrag.startY = 0;
  paperDrag.startReveal = roundtableState().paperReveal;
  paperDrag.moved = false;
  els.body.classList.remove("paper-dragging");
  touchSession(activeSession());
  persistState(state);
  if (!wasMoved) toggleRoundtablePaperReveal();
}

els.input.addEventListener("input", () => {
  resizeInput();
  renderContextBadge();
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)));
});

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    els.composer.requestSubmit();
  }
});

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
  sessionSettings().stream = els.stream.checked;
  persistState(state);
});

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
els.assistantTemplateSelect?.addEventListener("change", () => applyAssistantTemplate(els.assistantTemplateSelect.value));
els.importAssistant?.addEventListener("click", importAssistantConfig);
els.exportAssistant?.addEventListener("click", exportAssistantConfig);
els.assistantImportFile?.addEventListener("change", handleAssistantImportSelected);
els.saveAssistantConfig?.addEventListener("click", saveAssistantConfig);
els.resetAssistantConfig?.addEventListener("click", resetAssistantConfig);
els.deleteAssistant?.addEventListener("click", deleteCustomRoundAssistant);

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
