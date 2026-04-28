const STORAGE_KEY = "tbird-chatbox-v1";
const BRIDGE_TIMEOUT = 160000;

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
  novelFields: Array.from(document.querySelectorAll("[data-novel-key]")),
  novelStats: $("#novelStats"),
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
  toast: $("#toast"),
};

let state = loadState();
let activeMenuNodeId = null;
let activePanel = null;
let editTarget = null;
let isGenerating = false;
let abortController = null;
let streamRequestId = null;
let generatingNodeId = null;
let materialGenerating = false;
let streamShouldFollow = true;
let toastTimer = null;
const bridgeCallbacks = new Map();
const bridgeStreamCallbacks = new Map();

function uid(prefix = "id") {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clean(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").trim();
}

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function estimateTokens(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  return Math.ceil(compact.length / 1.7);
}

function formatK(tokens) {
  if (tokens >= 1000) return `${Math.round(tokens / 100) / 10}K`;
  return `${tokens}`;
}

function humanizeError(error, fallback = "操作失败") {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return fallback;
  if (lower.includes("param incorrect") || lower.includes("invalid parameter") || lower.includes("invalid param")) {
    return "接口参数不兼容：当前模型网关不接受这组请求参数。我已改为兼容模式，请重试。";
  }
  if (lower.includes("api key is required")) return "请先在设置里填写 API Key";
  if (lower.includes("model is required")) return "请先选择或填写模型";
  if (lower.includes("messages are required")) return "请求内容为空，请先输入或保存资料";
  if (lower.includes("timeout")) return "请求超时，请检查网络或模型服务";
  if (lower.includes("failed to fetch")) return "网络请求失败，请检查 Base URL、网络或代理";
  if (lower.includes("unauthorized") || lower.includes("401")) return "认证失败，请检查 API Key";
  if (lower.includes("forbidden") || lower.includes("403")) return "模型服务拒绝访问，请检查权限或模型名";
  return raw;
}

function createSettings() {
  return {
    systemPrompt: "你是小说创作助手。回答可以自由，但要尊重已有对话上下文；如果用户要求正文创作，优先输出可直接进入小说的中文正文。",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
    models: ["gpt-4o-mini"],
    temperature: 0.8,
    contextCount: 12,
    unlimitedContext: false,
    maxTokens: 2048,
    stream: true,
    layout: createDefaultLayout(),
    layoutPresets: [],
  };
}

function createDefaultLayout() {
  return {
    composerMinHeight: 66,
    composerFontSize: 16,
    sendButtonSize: 32,
    toolButtonSize: 26,
    messageFontSize: 17,
    messageLineHeight: 150,
    assistantLeft: 12,
    messageSidePadding: 18,
    messageGap: 22,
    userBubblePadding: 5,
    metaFontSize: 12,
    footerGap: 8,
    moreButtonSize: 28,
  };
}

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
    messageGap: 18,
    userBubblePadding: 4,
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
    messageGap: 28,
    userBubblePadding: 8,
    metaFontSize: 13,
    footerGap: 10,
    moreButtonSize: 32,
  },
};

function createSession(title = "新会话") {
  const root = {
    id: "root",
    role: "root",
    parentId: null,
    children: [],
    activeChildId: null,
    createdAt: Date.now(),
  };
  return {
    id: uid("sess"),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    rootId: root.id,
    nodes: { [root.id]: root },
  };
}

function defaultState() {
  const session = createSession();
  return {
    activeSessionId: session.id,
    sessions: [session],
    settings: createSettings(),
    novel: createDefaultNovel(),
  };
}

function createDefaultNovel() {
  return {
    body: "",
    plotline: "",
    characters: "",
    world: "",
    outline: "",
    foreshadows: "",
  };
}

function hydrate(next) {
  const fallback = defaultState();
  next ||= fallback;
  next.settings = { ...createSettings(), ...(next.settings || {}) };
  next.settings.layout = hydrateLayout(next.settings.layout);
  next.settings.layoutPresets = Array.isArray(next.settings.layoutPresets) ? next.settings.layoutPresets : [];
  next.novel = { ...createDefaultNovel(), ...(next.novel || {}) };
  next.settings.models = Array.isArray(next.settings.models) && next.settings.models.length
    ? Array.from(new Set([next.settings.model, ...next.settings.models].filter(Boolean)))
    : [next.settings.model || "gpt-4o-mini"];
  next.sessions = Array.isArray(next.sessions) && next.sessions.length ? next.sessions : fallback.sessions;
  next.sessions.forEach((session) => {
    session.rootId ||= "root";
    session.nodes ||= {};
    session.nodes[session.rootId] ||= {
      id: session.rootId,
      role: "root",
      parentId: null,
      children: [],
      activeChildId: null,
      createdAt: Date.now(),
    };
    Object.values(session.nodes).forEach((node) => {
      node.children ||= [];
      node.activeChildId = node.children.includes(node.activeChildId) ? node.activeChildId : node.children[0] || null;
      if (node.role === "assistant") {
        node.versions ||= [];
        if (!node.versions.length) node.versions.push(createAssistantVersion(""));
        node.activeVersionId ||= node.versions[0].id;
      }
    });
  });
  if (!next.sessions.some((session) => session.id === next.activeSessionId)) {
    next.activeSessionId = next.sessions[0].id;
  }
  return next;
}

function hydrateLayout(layout) {
  const defaults = createDefaultLayout();
  const next = { ...defaults, ...(layout || {}) };
  Object.keys(defaults).forEach((key) => {
    const value = Number(next[key]);
    next[key] = Number.isFinite(value) ? value : defaults[key];
  });
  return next;
}

function loadState() {
  try {
    return hydrate(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function activeSession() {
  return state.sessions.find((session) => session.id === state.activeSessionId) || state.sessions[0];
}

function getNode(id, session = activeSession()) {
  return session.nodes[id];
}

function activePath(session = activeSession()) {
  const path = [];
  let node = getNode(session.rootId, session);
  while (node?.activeChildId) {
    const next = getNode(node.activeChildId, session);
    if (!next) break;
    path.push(next);
    node = next;
  }
  return path;
}

function getAssistantVersion(node) {
  if (!node || node.role !== "assistant") return null;
  return node.versions.find((version) => version.id === node.activeVersionId) || node.versions[0] || null;
}

function createAssistantVersion(content = "", usage = null) {
  return {
    id: uid("ver"),
    content,
    usage,
    createdAt: Date.now(),
  };
}

function createNode(role, parentId, content = "") {
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

function addChild(parent, child, session = activeSession()) {
  session.nodes[child.id] = child;
  parent.children.push(child.id);
  parent.activeChildId = child.id;
}

function titleForSession(session = activeSession()) {
  const firstUser = Object.values(session.nodes).find((node) => node.role === "user" && clean(node.content));
  return clean(session.title) && session.title !== "新会话"
    ? session.title
    : clean(firstUser?.content).slice(0, 18) || "新会话";
}

function touchSession(session = activeSession()) {
  session.title = titleForSession(session);
  session.updatedAt = Date.now();
}

function getMessageContent(node) {
  if (!node) return "";
  if (node.role === "assistant") return getAssistantVersion(node)?.content || "";
  return node.content || "";
}

function contextMessages(extraUserText = "", includeDraftAssistantId = null) {
  const path = activePath();
  const limit = state.settings.unlimitedContext ? Infinity : Math.max(0, Number(state.settings.contextCount) || 0);
  let selected = Number.isFinite(limit) ? path.slice(-limit) : path.slice();
  if (includeDraftAssistantId) selected = selected.filter((node) => node.id !== includeDraftAssistantId);
  const messages = [];
  if (clean(state.settings.systemPrompt)) {
    messages.push({ role: "system", content: state.settings.systemPrompt });
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
  const novel = state.novel || createDefaultNovel();
  const parts = [
    ["剧情线", novel.plotline],
    ["角色卡", novel.characters],
    ["世界观", novel.world],
    ["大纲", novel.outline],
    ["伏笔线", novel.foreshadows],
    ["正文库节选", clean(novel.body).slice(-6000)],
  ].filter(([, text]) => clean(text));
  if (!parts.length) return "";
  return [
    "以下是小说创作记忆。续写、改写、解释人物动机时必须优先参考这些资料，不要自顾自另起设定。",
    ...parts.map(([title, text]) => `【${title}】\n${clean(text)}`),
  ].join("\n\n");
}

function getNovelSourceText() {
  const novel = state.novel || createDefaultNovel();
  const chat = activePath()
    .slice(-12)
    .map((node) => `${node.role === "user" ? "用户" : "AI"}：${getMessageContent(node)}`)
    .join("\n\n");
  return [
    clean(novel.body) ? `【正文库】\n${clean(novel.body).slice(-12000)}` : "",
    clean(novel.plotline) ? `【已有剧情线】\n${clean(novel.plotline)}` : "",
    clean(novel.characters) ? `【已有角色卡】\n${clean(novel.characters)}` : "",
    clean(novel.world) ? `【已有世界观】\n${clean(novel.world)}` : "",
    clean(novel.outline) ? `【已有大纲】\n${clean(novel.outline)}` : "",
    clean(novel.foreshadows) ? `【已有伏笔线】\n${clean(novel.foreshadows)}` : "",
    clean(chat) ? `【最近对话】\n${chat}` : "",
  ].filter(Boolean).join("\n\n");
}

function contextInfo(extraUserText = "") {
  const messages = contextMessages(extraUserText);
  const text = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
  const nonSystem = messages.filter((message) => message.role !== "system").length;
  const limit = state.settings.unlimitedContext ? "∞" : state.settings.contextCount;
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
  activePanel = name;
  els.backdrop.hidden = false;
  els.historyPanel.hidden = name !== "history";
  els.settingsPanel.hidden = name !== "settings";
  els.novelPanel.hidden = name !== "novel";
  els.contextPanel.hidden = name !== "context";
  if (name === "context") renderContextPanel();
  if (name === "novel") renderNovelPanel();
}

function closePanels() {
  activePanel = null;
  els.backdrop.hidden = true;
  els.historyPanel.hidden = true;
  els.settingsPanel.hidden = true;
  els.novelPanel.hidden = true;
  els.contextPanel.hidden = true;
}

function applyLayout() {
  const layout = state.settings.layout;
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
  renderMessages();
  renderSessions();
  renderSettings();
  renderCustomLayoutPresets();
  renderNovelPanel();
  renderModelPicker();
  renderContextBadge();
  renderMenu();
  els.body.classList.toggle("is-generating", isGenerating);
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)));
  saveState();
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
  `;
  const assistantActions = `
    <button type="button" data-command="regen-ai" data-node-id="${node.id}">重新生成</button>
    <button type="button" data-command="edit-ai" data-node-id="${node.id}">编辑AI输出</button>
    <button type="button" data-command="continue-ai" data-node-id="${node.id}">继续</button>
    <button type="button" data-command="copy-message" data-node-id="${node.id}">复制</button>
  `;
  els.menu.innerHTML = node.role === "user" ? userActions : assistantActions;
  els.menu.hidden = false;
}

function renderSessions() {
  const query = clean(els.historySearch.value).toLowerCase();
  const sessions = state.sessions
    .slice()
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .filter((session) => !query || titleForSession(session).toLowerCase().includes(query));
  els.sessionList.innerHTML = sessions.map((session) => {
    const count = activePath(session).length;
    return `<article class="session-item ${session.id === state.activeSessionId ? "active" : ""}">
      <button class="session-main" type="button" data-command="switch-session" data-session-id="${session.id}">
        <strong>${escapeHtml(titleForSession(session))}</strong>
        <span>${count} 条 · ${formatTime(session.updatedAt)}</span>
      </button>
      <div class="session-actions">
        <button type="button" data-command="copy-session" data-session-id="${session.id}">复制</button>
        <button type="button" data-command="delete-session" data-session-id="${session.id}">删除</button>
      </div>
    </article>`;
  }).join("") || `<p class="muted">还没有历史会话。</p>`;
}

function renderSettings() {
  const s = state.settings;
  if (document.activeElement !== els.systemPrompt) els.systemPrompt.value = s.systemPrompt;
  if (document.activeElement !== els.baseUrl) els.baseUrl.value = s.baseUrl;
  if (document.activeElement !== els.apiKey) els.apiKey.value = s.apiKey;
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
  const presets = state.settings.layoutPresets || [];
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
  els.novelFields.forEach((field) => {
    const key = field.dataset.novelKey;
    if (document.activeElement !== field) field.value = state.novel[key] || "";
  });
  if (els.novelStats) {
    const novel = state.novel || {};
    const items = [
      `正文 ${clean(novel.body).length} 字`,
      `剧情线 ${clean(novel.plotline).length} 字`,
      `资料估算 ${formatK(estimateTokens(buildNovelMemory()))} token`,
    ];
    els.novelStats.innerHTML = items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }
}

function formatLayoutValue(key, value) {
  if (key === "messageLineHeight") return `${value}%`;
  return `${value}px`;
}

function renderModelPicker() {
  const models = Array.from(new Set([state.settings.model, ...state.settings.models].filter(Boolean)));
  els.modelSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  els.modelSelect.value = state.settings.model;
  els.modelDatalist.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
}

function renderContextBadge() {
  const info = contextInfo(clean(els.input.value));
  els.contextBadge.textContent = `${info.nonSystem}/${info.limit} · ${formatK(info.tokens)}`;
}

function renderContextPanel() {
  const info = contextInfo(clean(els.input.value));
  els.contextStats.innerHTML = [
    `上下文 ${info.nonSystem}/${info.limit} 条`,
    `估算 ${formatK(info.tokens)} token`,
    `模型 ${state.settings.model || "未设置"}`,
    `温度 ${Number(state.settings.temperature).toFixed(2)}`,
  ].map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  els.contextPreview.textContent = info.messages.map((message, index) => {
    return `#${index + 1} ${message.role}\n${message.content}`;
  }).join("\n\n---\n\n") || "本次没有可发送上下文。";
}

function setActiveModel(model) {
  const value = clean(model);
  if (!value) return;
  state.settings.model = value;
  state.settings.models = Array.from(new Set([value, ...state.settings.models]));
}

function openEditor(nodeId) {
  const node = getNode(nodeId);
  if (!node) return;
  editTarget = { nodeId, role: node.role };
  els.editTitle.textContent = node.role === "assistant" ? "编辑 AI 输出" : "编辑内容";
  els.editText.value = getMessageContent(node);
  els.saveSendEdit.style.display = node.role === "assistant" ? "" : "none";
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
    const version = getAssistantVersion(node);
    version.content = text;
    version.createdAt = Date.now();
    closeEditor();
    touchSession();
    render();
    if (sendAfterSave) await continueFromAssistant(node.id);
    else showToast("已直接修改 AI 输出");
    return;
  }
  await editUserBranch(node.id, text);
  closeEditor();
}

async function appendUserMessage(text) {
  const session = activeSession();
  const path = activePath(session);
  const parent = path[path.length - 1] || getNode(session.rootId, session);
  const user = createNode("user", parent.id, text);
  addChild(parent, user, session);
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  addChild(user, assistant, session);
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
  addChild(parent, user);
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  addChild(user, assistant);
  touchSession();
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
  addChild(assistant, next);
  touchSession();
  activeMenuNodeId = null;
  render();
  await generateIntoAssistant(next.id, "", next.versions[0].id, true);
}

function validateApi() {
  if (!clean(state.settings.apiKey)) throw new Error("请先在设置里填写 API Key");
  if (!clean(state.settings.model)) throw new Error("请先选择或填写模型");
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
  version.content = "";
  version.usage = null;
  render();
  scrollBottom();
  try {
    const result = state.settings.stream
      ? await callOpenAIStream((partial) => {
          version.content = partial;
          renderStreamingNode(nodeId, versionId);
        }, nodeId, continueMode)
      : await callOpenAI(nodeId, continueMode);
    version.content = result.content;
    version.usage = result.usage || null;
    version.createdAt = Date.now();
    touchSession();
  } catch (error) {
    if (error.name !== "AbortError") {
      const message = humanizeError(error, "生成失败");
      version.content = version.content || `请求失败：${message}`;
      showToast(message);
    }
  } finally {
    isGenerating = false;
    abortController = null;
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
  if (streamRequestId && bridgeStreamCallbacks.has(streamRequestId)) {
    bridgeStreamCallbacks.get(streamRequestId).reject(new DOMException("Aborted", "AbortError"));
    bridgeStreamCallbacks.delete(streamRequestId);
  }
  isGenerating = false;
  generatingNodeId = null;
  streamShouldFollow = false;
  showToast("已停止生成");
  render();
}

function requestPayload(assistantNodeId, stream = false) {
  const messages = contextMessages("", assistantNodeId);
  return {
    baseUrl: state.settings.baseUrl,
    apiKey: state.settings.apiKey,
    model: state.settings.model,
    messages,
    temperature: state.settings.temperature,
    max_tokens: Number(state.settings.maxTokens) || undefined,
    stream,
  };
}

async function callOpenAI(assistantNodeId) {
  const payload = requestPayload(assistantNodeId, false);
  const bridge = await callAndroidBridge("openAIChat", payload);
  const data = bridge || await fetchJson("/api/openai-chat", payload);
  if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "请求失败");
  const content = data.choices?.[0]?.message?.content || data.content || "";
  if (!content) throw new Error("模型返回为空");
  return { content, usage: data.usage || null };
}

async function callOpenAIText(messages) {
  validateApi();
  abortController = new AbortController();
  const payload = {
    baseUrl: state.settings.baseUrl,
    apiKey: state.settings.apiKey,
    model: state.settings.model,
    messages,
    minimal: true,
  };
  try {
    const bridge = await callAndroidBridge("openAIChat", payload);
    const data = bridge || await fetchJson("/api/openai-chat", payload);
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "请求失败");
    const content = data.choices?.[0]?.message?.content || data.content || "";
    if (!clean(content)) throw new Error("模型返回为空");
    return clean(content);
  } finally {
    abortController = null;
  }
}

async function callOpenAIStream(onChunk, assistantNodeId) {
  const payload = requestPayload(assistantNodeId, true);
  const bridgeResult = callAndroidBridgeStream("openAIChat", payload, onChunk);
  if (bridgeResult) return bridgeResult;
  const response = await fetch("/api/openai-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: abortController?.signal,
  });
  if (!response.ok) {
    const data = await safeJson(response);
    throw new Error(data?.error?.message || `请求失败 ${response.status}`);
  }
  return readOpenAIStream(response, onChunk);
}

async function fetchJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: abortController?.signal,
  });
  const data = await safeJson(response);
  if (!response.ok) throw new Error(data?.error?.message || `请求失败 ${response.status}`);
  return data;
}

async function safeJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: { message: text } };
  }
}

async function readOpenAIStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const dataText = line.slice(5).trim();
      if (!dataText || dataText === "[DONE]") continue;
      const data = JSON.parse(dataText);
      if (data.usage) usage = data.usage;
      const piece = data.choices?.[0]?.delta?.content || "";
      if (piece) {
        content += piece;
        onChunk(content);
      }
    }
  }
  if (!content) throw new Error("模型返回为空");
  return { content, usage };
}

function callAndroidBridge(methodName, payload) {
  const bridge = window.AndroidBridge;
  const asyncName = `${methodName}Async`;
  if (!bridge || typeof bridge[asyncName] !== "function") return null;
  const requestId = uid("bridge");
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      bridgeCallbacks.delete(requestId);
      reject(new Error("Android bridge timeout"));
    }, BRIDGE_TIMEOUT);
    bridgeCallbacks.set(requestId, {
      resolve: (text) => {
        window.clearTimeout(timeout);
        bridgeCallbacks.delete(requestId);
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

function callAndroidBridgeStream(methodName, payload, onChunk) {
  const bridge = window.AndroidBridge;
  const streamName = `${methodName}StreamAsync`;
  if (!bridge || typeof bridge[streamName] !== "function") return null;
  const requestId = uid("stream");
  streamRequestId = requestId;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      bridgeStreamCallbacks.delete(requestId);
      reject(new Error("Android bridge stream timeout"));
    }, BRIDGE_TIMEOUT);
    bridgeStreamCallbacks.set(requestId, {
      chunk: onChunk,
      done: (metaText) => {
        window.clearTimeout(timeout);
        bridgeStreamCallbacks.delete(requestId);
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
        bridgeStreamCallbacks.delete(requestId);
        reject(error);
      },
    });
    bridge[streamName](requestId, JSON.stringify(payload));
  });
}

window.__qinglanBridgeResolve = (requestId, text) => {
  bridgeCallbacks.get(requestId)?.resolve(text);
};

window.__qinglanBridgeStreamChunk = (requestId, text) => {
  bridgeStreamCallbacks.get(requestId)?.chunk(text || "");
};

window.__qinglanBridgeStreamDone = (requestId, text) => {
  bridgeStreamCallbacks.get(requestId)?.done(text);
};

window.__qinglanBridgeStreamError = (requestId, message) => {
  bridgeStreamCallbacks.get(requestId)?.reject(new Error(message || "Android bridge stream failed"));
};

async function fetchModels() {
  try {
    validateApi();
    els.modelStatus.textContent = "正在拉取...";
    const payload = { baseUrl: state.settings.baseUrl, apiKey: state.settings.apiKey };
    const bridge = await callAndroidBridge("openAIModels", payload);
    const data = bridge || await fetchJson("/api/openai-models", payload);
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "模型拉取失败");
    const models = (data.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("没有读取到模型");
    state.settings.models = Array.from(new Set([state.settings.model, ...models].filter(Boolean)));
    if (!state.settings.model) state.settings.model = models[0];
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
  closePanels();
  render();
}

function switchSession(sessionId) {
  if (isGenerating) return showToast("生成中不能切换会话");
  if (!state.sessions.some((session) => session.id === sessionId)) return;
  state.activeSessionId = sessionId;
  activeMenuNodeId = null;
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
  els.novelFields.forEach((field) => {
    state.novel[field.dataset.novelKey] = field.value;
  });
}

function saveNovel() {
  syncNovelFromFields();
  renderNovelPanel();
  renderContextBadge();
  saveState();
  showToast("小说资料已保存");
}

function importBodyFile() {
  els.bodyImportFile?.click();
}

async function handleBodyFileSelected() {
  const file = els.bodyImportFile?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    state.novel.body = clean(text);
    renderNovelPanel();
    renderContextBadge();
    saveState();
    showToast("正文 TXT 已导入");
  } catch (error) {
    showToast(humanizeError(error, "正文导入失败"));
  } finally {
    if (els.bodyImportFile) els.bodyImportFile.value = "";
  }
}

function exportBodyFile() {
  const text = clean(state.novel.body);
  if (!text) return showToast("正文库为空");
  downloadText(`TBird-正文-${Date.now()}.txt`, text);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
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
    state.novel[target] = text;
    renderNovelPanel();
    renderContextBadge();
    saveState();
    showToast(`${label}已填充`);
  } catch (error) {
    showToast(humanizeError(error, `${label}生成失败`));
  } finally {
    materialGenerating = false;
  }
}

function handleCommand(command, target) {
  const nodeId = target.dataset.nodeId;
  const sessionId = target.dataset.sessionId;
  if (command === "open-history") return showPanel("history");
  if (command === "open-settings") return showPanel("settings");
  if (command === "open-novel") return showPanel("novel");
  if (command === "open-context") return showPanel("context");
  if (command === "open-search") return showPanel("history");
  if (command === "close-panels") return closePanels();
  if (command === "new-session") return newSession();
  if (command === "switch-session") return switchSession(sessionId);
  if (command === "copy-session") return copySession(sessionId);
  if (command === "delete-session") return deleteSession(sessionId);
  if (command === "fetch-models") return fetchModels();
  if (command === "save-novel") return saveNovel();
  if (command === "import-body-file") return importBodyFile();
  if (command === "export-body-file") return exportBodyFile();
  if (command === "generate-novel") return generateNovelMaterial(target.dataset.novelTarget);
  if (command === "layout-preset") return applyLayoutPreset(target.dataset.preset);
  if (command === "layout-custom-preset") return applyCustomLayoutPreset(target.dataset.presetId);
  if (command === "save-layout-preset") return saveLayoutPreset();
  if (command === "delete-layout-preset") return deleteLayoutPreset(target.dataset.presetId);
  if (command === "copy-layout") return copyLayoutParams();
  if (command === "reset-layout") return resetLayoutParams();
  if (command === "toggle-menu") {
    activeMenuNodeId = activeMenuNodeId === nodeId ? null : nodeId;
    return render();
  }
  if (command === "edit-user" || command === "edit-ai") return openEditor(nodeId);
  if (command === "copy-message") return copyText(getMessageContent(getNode(nodeId)));
  if (command === "resend-user") return resendUser(nodeId);
  if (command === "regen-ai") return regenerateAssistant(nodeId);
  if (command === "continue-ai") return continueFromAssistant(nodeId);
  if (command === "prev-version") return switchVersion(nodeId, -1);
  if (command === "next-version") return switchVersion(nodeId, 1);
  if (command === "prev-branch") return switchSibling(nodeId, -1);
  if (command === "next-branch") return switchSibling(nodeId, 1);
}

function applyLayoutPreset(name) {
  const preset = layoutPresets[name];
  if (!preset) return;
  state.settings.layout = hydrateLayout(preset);
  render();
  resizeInput();
  showToast("排版预设已应用");
}

function applyCustomLayoutPreset(id) {
  const preset = state.settings.layoutPresets.find((item) => item.id === id);
  if (!preset) return;
  state.settings.layout = hydrateLayout(preset.layout);
  render();
  resizeInput();
  showToast("排版预设已应用");
}

function saveLayoutPreset() {
  const name = clean(els.layoutPresetName?.value) || `排版 ${state.settings.layoutPresets.length + 1}`;
  const record = {
    id: uid("layout"),
    name,
    layout: hydrateLayout(state.settings.layout),
    createdAt: Date.now(),
  };
  state.settings.layoutPresets = [record, ...state.settings.layoutPresets].slice(0, 12);
  if (els.layoutPresetName) els.layoutPresetName.value = "";
  render();
  showToast("已保存排版预设");
}

function deleteLayoutPreset(id) {
  state.settings.layoutPresets = state.settings.layoutPresets.filter((item) => item.id !== id);
  render();
  showToast("已删除排版预设");
}

function resetLayoutParams() {
  state.settings.layout = createDefaultLayout();
  render();
  resizeInput();
  showToast("已恢复默认排版");
}

function copyLayoutParams() {
  copyText(JSON.stringify(state.settings.layout, null, 2));
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-command]");
  if (!target) {
    if (activeMenuNodeId && !event.target.closest(".message-menu")) {
      activeMenuNodeId = null;
      renderMenu();
    }
    return;
  }
  event.preventDefault();
  handleCommand(target.dataset.command, target);
});

els.composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isGenerating) {
    stopGeneration();
    return;
  }
  const text = clean(els.input.value);
  if (!text) return;
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
  const maxHeight = Math.max(44, state.settings.layout.composerMinHeight + 8);
  els.input.style.height = `${Math.min(maxHeight, els.input.scrollHeight)}px`;
  const composerHeight = Math.ceil(els.composer.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--composer-height", `${composerHeight}px`);
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

els.historySearch.addEventListener("input", renderSessions);

[
  ["input", els.systemPrompt, "systemPrompt"],
  ["input", els.baseUrl, "baseUrl"],
  ["input", els.apiKey, "apiKey"],
  ["input", els.contextCount, "contextCount"],
  ["input", els.maxTokens, "maxTokens"],
].forEach(([, element, key]) => {
  element.addEventListener("input", () => {
    state.settings[key] = key === "contextCount" || key === "maxTokens" ? Number(element.value) || 0 : element.value;
    renderContextBadge();
    saveState();
  });
});

els.modelInput.addEventListener("input", () => {
  setActiveModel(els.modelInput.value);
  renderModelPicker();
  renderContextBadge();
  saveState();
});

els.modelSelect.addEventListener("change", () => {
  setActiveModel(els.modelSelect.value);
  render();
});

els.temperature.addEventListener("input", () => {
  state.settings.temperature = Number(els.temperature.value);
  els.temperatureLabel.textContent = state.settings.temperature.toFixed(2);
  saveState();
});

els.unlimitedContext.addEventListener("change", () => {
  state.settings.unlimitedContext = els.unlimitedContext.checked;
  render();
});

els.stream.addEventListener("change", () => {
  state.settings.stream = els.stream.checked;
  saveState();
});

els.layoutInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.layoutKey;
    state.settings.layout[key] = Number(input.value);
    applyLayout();
    renderSettings();
    resizeInput();
    saveState();
  });
});

els.novelFields.forEach((field) => {
  field.addEventListener("input", () => {
    state.novel[field.dataset.novelKey] = field.value;
    renderContextBadge();
    renderNovelPanel();
    saveState();
  });
});

els.bodyImportFile?.addEventListener("change", handleBodyFileSelected);

els.saveEdit.addEventListener("click", () => saveEditor(false));
els.saveSendEdit.addEventListener("click", () => saveEditor(true));

window.addEventListener("resize", resizeInput);

render();
resizeInput();
scrollBottom();
