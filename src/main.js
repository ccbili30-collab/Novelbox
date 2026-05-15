import { uid } from "./utils/id.js";
import { clean, escapeHtml } from "./utils/text.js";
import { renderMarkdown } from "./utils/markdown.js";
import { formatTime } from "./utils/time.js";
import { estimateTokens, formatK } from "./utils/tokens.js";
import { humanizeError } from "./utils/errors.js";
import { createAssistantController } from "./app/assistant-controller.js";
import { createCommandRegistry } from "./app/command-registry.js";
import { createCreatorController } from "./app/creator-controller.js";
import { createImportExportController } from "./app/import-export.js";
import { createRoundtableController } from "./app/roundtable-controller.js";
import { createWorkspaceController } from "./app/workspace-controller.js";
import { createWriterController } from "./app/writer-controller.js";
import { createDefaultLayout, hydrateLayout } from "./domain/layout/layout-model.js";
import { createDefaultNovel } from "./domain/novel/novel-model.js";
import {
  buildNovelMemory as buildNovelMemoryFromSession,
  buildNovelSourceText,
} from "./domain/novel/novel-context-builder.js";
import { buildNovelStats } from "./domain/novel/novel-stats.js";
import { hydrateSessionSettings } from "./domain/settings/settings-model.js";
import { createApiProvider, hydrateApiSettings, hydrateModelDefaults } from "./domain/settings/api-settings.js";
import {
  applyGlobalModelConfigToAssistantConfig,
  applyGlobalModelConfigToCreator,
  applyGlobalModelConfigToSession,
  globalModelConfigFromApi,
} from "./domain/settings/global-model-config.js";
import {
  createCreatorIdentity,
  creatorToAssistant,
  hydrateCreatorIdentity,
} from "./domain/creator/creator-model.js";
import {
  DEFAULT_ROUNDTABLE_CONTEXT,
  GENERATIVE_AGENT_MEMORY_LIMIT,
  SEALED_ROUNDTABLE_CREATORS,
  createRandomTraitPrompt,
  createRoundAssistantConfigView,
  getSealedRoundtableCreatorBase,
  getRoundAssistantBaseFromState,
  getRoundAssistantBasesFromState,
  getRoundAssistantAliases,
  hydrateRoundtableState,
  isCustomRoundAssistantInState,
  isSealedRoundtableCreatorId,
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
  createRoundtableExcerpt,
  isSociallyActivatedAssistant,
} from "./domain/roundtable/roundtable-context-builder.js";
import {
  findMentionedRoundtableAssistants,
  moveMentionedAssistantsAfter,
  getRoundtableRoleLabel,
  getRoundtableRoleState,
} from "./domain/roundtable/roundtable-flow.js";
import {
  appendCreatorParticipationRecord,
  appendCouncilParticipationRecord,
  createMemoryFromParticipationRecord,
  getCreatorParticipationRecords,
  getCouncilParticipationRecords,
} from "./domain/roundtable/council-participation-memory.js";
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
  isWriterProseMessage,
  locateWriterSyncStart,
  removeWriterSyncedSegment,
  replaceWriterSyncedSegment,
} from "./domain/roundtable/roundtable-writer-sync.js";
import { retrieveCreatorMemories } from "./domain/creator/creator-memory-retrieval.js";
import { createSession } from "./domain/session/session-model.js";
import {
  getNode as getSessionNode,
  activePath as getActivePath,
  activatePathToNode as activateSessionPathToNode,
  getAssistantVersion,
  getAssistantVersionById,
  setAssistantVersionContent,
  createNode,
  addChild as appendChild,
  titleForSession,
  touchSession,
} from "./domain/session/session-tree.js";
import {
  branchPathHashForNode,
  isMemoryOnActiveBranch,
  pruneAbandonedBranchMemories,
} from "./domain/session/branch-signature.js";
import {
  appendCreatorMemoryEntry,
} from "./domain/creator/creator-memory-model.js";
import { createMemoryEntriesFromMessage } from "./domain/creator/creator-memory-writer.js";
import { createAiClient } from "./services/api/ai-client.js";
import { createBridgeClient, registerBridgeHooks } from "./services/bridge/bridge-client.js";
import { hydrate, loadState, saveState as persistStateNow } from "./state/persistence.js";
import { createFrameScheduler, createIdleDebouncer } from "./utils/scheduler.js";
import { showSnackbar, showError } from "./ui/components/snackbar.js";
import { showConfirm, showAlert, showPrompt } from "./ui/components/dialog.js";
import { initThemeEngine, setThemeMode, setSeedColor, getThemeMode, getSeedColor } from "./ui/components/theme-engine.js";
import { bindScrollAwareBar } from "./ui/components/scroll-aware-bars.js";
import { bindKeyboardHelpShortcut, openKeyboardHelp } from "./ui/components/keyboard-help.js";
import { checkAndAnnounceUpgrade, VERSION as APP_VERSION } from "./ui/components/whats-new.js";
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
const LOCAL_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/x-icon", "image/vnd.microsoft.icon"]);
const CHAT_IMAGE_MAX_BYTES = Math.min(LOCAL_IMAGE_MAX_BYTES, 1.5 * 1024 * 1024);
const CHAT_IMAGE_LIMIT = 4;
const CHAT_ATTACHMENT_LIMIT = 6;
const CHAT_TEXT_FILE_MAX_BYTES = 1024 * 1024;
const CHAT_TEXT_EXCERPT_LIMIT = 12000;
const CHAT_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "json", "csv", "log", "yaml", "yml"]);
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
  chatImageFile: $("#chatImageFile"),
  chatAttachmentList: $("#chatAttachmentList"),
  send: $("#sendButton"),
  contextBadge: $("#contextBadge"),
  modelSelect: $("#modelSelect"),
  backdrop: $("#backdrop"),
  historyPanel: $("#historyPanel"),
  settingsPanel: $("#settingsPanel"),
  settingsPanelTitle: $("#settingsPanelTitle"),
  settingsPanelSubtitle: $("#settingsPanelSubtitle"),
  settingsBack: $("#settingsBackButton"),
  settingsViews: Array.from(document.querySelectorAll("[data-settings-view]")),
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
  providerSelect: $("#providerSelect"),
  providerSwitcher: $("#providerSwitcher"),
  providerName: $("#providerNameInput"),
  baseUrl: $("#baseUrlInput"),
  apiKey: $("#apiKeyInput"),
  modelInput: $("#modelInput"),
  modelDatalist: $("#modelDatalist"),
  modelStatus: $("#modelStatus"),
  settingsModelPickerButton: $("#settingsModelPickerButton"),
  settingsModelPicker: $("#settingsModelPicker"),
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
  contextTokenBudget: $("#contextTokenBudgetInput"),
  unlimitedContext: $("#unlimitedContextInput"),
  maxTokens: $("#maxTokensInput"),
  stream: $("#streamInput"),
  layoutInputs: Array.from(document.querySelectorAll("input[data-layout-key]")),
  layoutValues: Array.from(document.querySelectorAll("[data-layout-value]")),
  contextStats: $("#contextStats"),
  contextPreview: $("#contextPreview"),
  workspacePathInput: $("#workspacePathInput"),
  workspaceFileInput: $("#workspaceFileInput"),
  workspaceStats: $("#workspaceStats"),
  workspaceFileGroups: $("#workspaceFileGroups"),
  layoutPresetName: $("#layoutPresetName"),
  customLayoutPresets: $("#customLayoutPresets"),
  creatorsList: $("#creatorsList"),
  editDialog: $("#editDialog"),
  editTitle: $("#editTitle"),
  editText: $("#editText"),
  saveEdit: $("#saveEditButton"),
  saveSendEdit: $("#saveSendEditButton"),
  assistantImportFile: $("#assistantImportFile"),
  sessionImportFile: $("#sessionImportFile"),
  creatorImportFile: $("#creatorImportFile"),
  globalBackupImportFile: $("#globalBackupImportFile"),
  assistantConfigDialog: $("#assistantConfigDialog"),
  assistantConfigTitle: $("#assistantConfigTitle"),
  assistantSourceLabel: $("#assistantSourceLabel"),
  assistantNameInput: $("#assistantNameInput"),
  assistantModelFold: $("#assistantModelFold"),
  assistantProviderSelect: $("#assistantProviderSelect"),
  assistantApiOverrideEnabledInput: $("#assistantApiOverrideEnabledInput"),
  assistantApiOverrideFold: $("#assistantApiOverrideFold"),
  assistantBaseUrlInput: $("#assistantBaseUrlInput"),
  assistantApiKeyInput: $("#assistantApiKeyInput"),
  assistantModelInput: $("#assistantModelInput"),
  fetchAssistantModels: $("#fetchAssistantModelsButton"),
  assistantModelStatus: $("#assistantModelStatus"),
  assistantNetworkEnabledInput: $("#assistantNetworkEnabledInput"),
  assistantMaxTokensInput: $("#assistantMaxTokensInput"),
  assistantContextTokenBudgetInput: $("#assistantContextTokenBudgetInput"),
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
  assistantActivationFold: $("#assistantActivationFold"),
  sealedActivationBar: $("#sealedActivationBar"),
  assistantActivationStatus: $("#assistantActivationStatus"),
  assistantActivationProfileInput: $("#assistantActivationProfileInput"),
  assistantParticipationFold: $("#assistantParticipationFold"),
  assistantParticipationList: $("#assistantParticipationList"),
  assistantPrivateChatList: $("#assistantPrivateChatList"),
  assistantPrivateFold: $("#assistantPrivateFold"),
  assistantPrivateChatInput: $("#assistantPrivateChatInput"),
  sendAssistantPrivateChat: $("#sendAssistantPrivateChatButton"),
  activateAssistant: $("#activateAssistantButton"),
  clearAssistantActivation: $("#clearAssistantActivationButton"),
  assistantAvatarFile: $("#assistantAvatarFile"),
  assistantAvatarPreview: $("#assistantAvatarPreview"),
  chooseAssistantAvatar: $("#chooseAssistantAvatarButton"),
  clearAssistantAvatar: $("#clearAssistantAvatarButton"),
  assistantMaterialsFold: $("#assistantMaterialsFold"),
  assistantPromptFold: $("#assistantPromptFold"),
  sealedPromptBar: $("#sealedPromptBar"),
  assistantPromptInput: $("#assistantPromptInput"),
  sealedCreatorOverlay: $("#sealedCreatorOverlay"),
  sealedCreatorList: $("#sealedCreatorList"),
  closeSealedCreatorOverlay: $("#closeSealedCreatorOverlayButton"),
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
let assistantConfigMode = "member";
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
let assistantImportMode = "single";
let pendingCustomAssistantDraftId = null;
let sealedCreatorTapCount = 0;
let sealedCreatorTapTimer = null;
let sealedCreatorOverlayOpen = false;
let sealedCreatorHistoryOpen = false;
let closingSealedCreatorFromButton = false;
let keepRoundtableMembersOnDialogBack = false;
let modelPickerOpen = false;
let settingsModelPickerOpen = false;
let assistantModelPickerOpen = false;
let activeSettingsPage = "home";
let activeCreatorDetailId = null;
let activeCreatorRecordId = null;
let activeCreatorMemoryId = null;
const creatorMemoryLookupPreviews = new Map();
let panelHistoryOpen = false;
let transientHistoryOpen = false;
let dialogHistoryOpen = false;
let closingDialogFromHistory = false;
let toastTimer = null;
let toastMotionTimer = null;
let paperScrollPersistTimer = null;
let pendingChatAttachments = [];
let paperGripSuppressClickUntil = 0;
const paperDrag = {
  active: false,
  moved: false,
  pointerId: null,
  startY: 0,
  startReveal: 0.68,
};
const roundtableGesture = {
  pinchActive: false,
  pinchTriggered: false,
  pinchStartDistance: 0,
  paperLastTapAt: 0,
  paperTouchStartX: 0,
  paperTouchStartY: 0,
};
const bridgeCallbacks = new Map();
const bridgeStreamCallbacks = new Map();
const streamDomTimers = new Map();
const panelManager = createPanelManager(els, {
  onShow: (name) => {
    els.body.dataset.activePanel = name;
    if (name === "settings") renderSettingsPage();
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
const assistantController = createAssistantController({
  clean,
  uid,
  sessionSettings,
  roundtableState,
  getCouncilParticipationRecords: (assistantId, options) => getCouncilParticipationRecords(state.councilParticipationRecords, assistantId, options),
  formatTime,
});
const workspaceController = createWorkspaceController({
  getEls: () => els,
  activeSession,
  clean,
  escapeHtml,
  formatBytes,
  formatTime,
  touchSession,
  persistState: () => persistState(state),
  showToast,
  humanizeError,
  uid,
});
const writerController = createWriterController({
  activeSession,
  activePath,
  sessionNovel,
  sessionSettings,
  getMessageContent,
  getCreatorIdentity,
  getPrimaryCreatorId,
  getPrimaryCreatorRuntimeConfig,
  callCompressionModel,
  getRoundAssistant,
  addRoundtableMessage,
  callRoundtableAssistant,
  cleanRoundtableAssistantOutput,
  renderStreamingRoundtableMessage,
  cancelStreamDomUpdate,
  updateRoundtableMessageContent,
  syncWriterMessageToNovel,
  touchSession,
  persistState: () => persistState(state),
  render,
  showToast,
  humanizeError,
  clean,
  simpleHash,
});
const roundtableController = createRoundtableController({
  getState: () => state,
  activeSession,
  activePath,
  roundtableState,
  sessionNovel,
  sessionSettings,
  apiSettings,
  apiForProvider,
  getRoundAssistantFromSession,
  getRoundAssistantBase,
  getPrimaryCreatorId,
  getRoundAssistantBases,
  getCreatorIdentity,
  getMessageContent,
  getMainSystemPrompt,
  buildNovelMemoryFromSession,
  getCreatorMemorySnippets,
  getRoundtableMentionableAssistants,
  getRoundtableManuscript,
  getNovelSourceText,
  getAssistantContextTokenThreshold,
  getRoundAssistant,
  moveRoundtableMentionsAfter,
  parseRoundtableMentions,
  buildAssistantMentionInstruction,
  addAssistantRoundtableReply,
  cleanRoundtableAssistantOutput,
  uniqueRoundAssistantName,
  saveCreatorIdentity,
  normalizeAssistantPrivateMessages: assistantController.normalizePrivateMessages,
  rememberCreatorRoundtableJoin,
  isSealedRoundtableCreatorId,
  assistantConfigHasSavedIdentity,
  callCompressionModel,
  ensureAutoCompressNovelMemory,
  callOpenAITextStreamWithSettings,
  callOpenAITextWithSettings,
  streamAssistantRoundtableReply,
  addRoundtableFailureMessage,
  setRoundtableActiveSpeaker,
  getRoundtableActiveSpeaker: () => roundtableActiveSpeakerId,
  syncPrimaryCreatorIntoRoundtable,
  refreshWriterStyleCacheWithAi,
  closePanels,
  render,
  resizeInput,
  touchSession,
  persistState: () => persistState(state),
  showToast,
  pushTransientHistory,
  getTransientHistoryOpen: () => transientHistoryOpen,
  setTransientHistoryOpen: (value) => {
    transientHistoryOpen = Boolean(value);
  },
  resetActiveMenus: () => {
    activeMenuNodeId = null;
    activeRoundtableMessageId = null;
  },
  clean,
  titleForSession,
  uid,
  humanizeError,
});
const importExportController = createImportExportController({
  getEls: () => els,
  getState: () => state,
  replaceState: (nextState) => {
    state = nextState;
    activeMenuNodeId = null;
    activeRoundtableMessageId = null;
    activeCreatorDetailId = null;
    activeCreatorRecordId = null;
    activeCreatorMemoryId = null;
    creatorMemoryLookupPreviews.clear();
  },
  hydrateState: hydrate,
  activeSession,
  activePath,
  sessionNovel,
  sessionAppearance,
  sessionSettings,
  roundtableState,
  writerState,
  getPrimaryCreatorId,
  getCreatorIdentity,
  saveCreatorIdentity,
  titleForSession,
  touchSession,
  getMessageContent,
  clean,
  uid,
  downloadText,
  closePanels,
  render,
  persistState: () => persistState(state),
  showToast,
  humanizeError,
});
const creatorController = createCreatorController({
  getState: () => state,
  getCreatorIdentity,
  getPrimaryCreatorId,
  creatorsState,
  saveCreatorIdentity,
  ensureSessionCreator,
  roundtableState,
  switchSession,
  closePanels,
  render,
  persistState: () => persistState(state),
  touchSession,
  clean,
  showToast,
  askDeleteChoice: askThreeWayDelete,
});

const settingsPageMeta = {
  home: { title: "设置", subtitle: "选择要调整的模块" },
  model: { title: "模型配置", subtitle: "默认 API、主线模型和生成参数" },
  appearance: { title: "本会话外观", subtitle: "只影响当前会话" },
  layout: { title: "排版调试", subtitle: "数值微调" },
  creators: { title: "创作者们", subtitle: "身份、记忆和所在圆桌" },
};

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

function globalModelDefaults() {
  const api = apiSettings();
  api.modelDefaults = hydrateModelDefaults(api.modelDefaults, {
    model: api.models?.[0],
    contextTokenBudget: api.contextTokenBudget,
  });
  return api.modelDefaults;
}

function activeApiProvider(api = apiSettings()) {
  return api.providers.find((provider) => provider.id === api.currentProviderId) || api.providers[0];
}

function syncApiFromProvider(api = apiSettings()) {
  const provider = activeApiProvider(api);
  if (!provider) return api;
  api.baseUrl = provider.baseUrl;
  api.apiKey = provider.apiKey;
  api.models = Array.from(new Set((provider.models || []).filter(Boolean)));
  return api;
}

function apiForProvider(providerId) {
  const api = apiSettings();
  const provider = api.providers.find((item) => item.id === providerId) || activeApiProvider(api);
  return {
    ...api,
    currentProviderId: provider?.id || api.currentProviderId,
    baseUrl: provider?.baseUrl || api.baseUrl,
    apiKey: provider?.apiKey || api.apiKey,
    models: provider?.models || api.models,
  };
}

function apiForAssistantConfig(config = {}) {
  const providerApi = apiForProvider(config.providerId);
  return {
    ...providerApi,
    baseUrl: providerApi.baseUrl,
    apiKey: providerApi.apiKey,
  };
}

function creatorsState() {
  state.creators = state.creators && typeof state.creators === "object" ? state.creators : {};
  return state.creators;
}

function getCreatorIdentity(id) {
  const creators = creatorsState();
  const creator = creators[id];
  return creator ? hydrateCreatorIdentity(creator, {
    modelConfig: {
      providerId: apiSettings().currentProviderId,
      baseUrl: apiSettings().baseUrl,
      model: sessionSettings().model,
      contextTokenBudget: apiSettings().contextTokenBudget,
    },
  }) : null;
}

function ensureSessionCreator(session = activeSession()) {
  const creators = creatorsState();
  if (session.creatorId && creators[session.creatorId]) return creators[session.creatorId];
  const settings = sessionSettings(session);
  const api = apiSettings();
  const creator = createCreatorIdentity({
    name: clean(settings.model) || "主创",
    prompt: clean(settings.systemPrompt),
    modelConfig: {
      providerId: api.currentProviderId,
      baseUrl: api.baseUrl,
      model: settings.model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      contextTokenBudget: api.contextTokenBudget,
    },
    privateSessionId: session.id,
  });
  creators[creator.id] = creator;
  session.creatorId = creator.id;
  return creator;
}

function saveCreatorIdentity(creator) {
  if (!creator?.id) return null;
  creatorsState()[creator.id] = hydrateCreatorIdentity(creator);
  return creatorsState()[creator.id];
}

function saveCreatorMemoryEntries(creatorId, entries = []) {
  const creator = getCreatorIdentity(creatorId);
  if (!creator || !creator.memory?.autoEnabled || !entries.length) return creator;
  let memory = creator.memory;
  entries.forEach((entry) => {
    memory = appendCreatorMemoryEntry(memory, entry, { creatorId });
  });
  return saveCreatorIdentity({ ...creator, memory, updatedAt: Date.now() });
}

function rememberCreatorMessageNode(node, options = {}) {
  const session = options.session || activeSession();
  const creatorId = clean(options.creatorId) || getPrimaryCreatorId(session);
  if (!node || !creatorId) return null;
  const entries = createMemoryEntriesFromMessage({
    creatorId,
    role: node.role,
    content: getMessageContent(node),
    sourceSessionId: session.id,
    sourceNodeId: node.id,
    branchPathHash: branchPathHashForNode(session, node.id),
    scope: options.scope || "session",
    durable: Boolean(options.durable),
    createdAt: node.createdAt,
  });
  return saveCreatorMemoryEntries(creatorId, entries);
}

function pruneCreatorMemoriesForActiveBranch(session = activeSession()) {
  const creatorId = getPrimaryCreatorId(session);
  const creator = getCreatorIdentity(creatorId);
  if (!creator?.memory?.entries?.length) return;
  const memory = pruneAbandonedBranchMemories(creator.memory, session);
  if (memory !== creator.memory) saveCreatorIdentity({ ...creator, memory, updatedAt: Date.now() });
}

function getCreatorMemoryRootId(creatorId, session = activeSession()) {
  const id = clean(creatorId);
  if (!id) return "";
  const sessions = [
    session,
    ...state.sessions.filter((item) => item && item.id !== session?.id),
  ].filter(Boolean);
  for (const item of sessions) {
    const config = roundtableState(item).assistantConfigs?.[id];
    const sourceId = clean(config?.importedFrom?.sourceCreatorId || config?.importedFrom?.memberId);
    if (sourceId && sourceId !== id && getCreatorIdentity(sourceId)) return sourceId;
  }
  if (getCreatorIdentity(id)) return id;
  return id;
}

function getCreatorMemoryAliasIds(creatorId) {
  const rootId = getCreatorMemoryRootId(creatorId);
  const aliases = new Set([rootId]);
  state.sessions.forEach((session) => {
    Object.entries(roundtableState(session).assistantConfigs || {}).forEach(([configId, config]) => {
      const sourceId = clean(config?.importedFrom?.sourceCreatorId || config?.importedFrom?.memberId);
      if (sourceId === rootId) aliases.add(clean(configId));
    });
  });
  return Array.from(aliases).filter(Boolean);
}

function creatorMemoryKey(memory) {
  return [
    clean(memory?.source),
    clean(memory?.sourceSessionId),
    clean(memory?.sourceCreatorId),
    clean(memory?.text).slice(0, 120),
  ].join("::");
}

function migrateImportedPrimaryCloneCreators() {
  const creators = creatorsState();
  let changed = false;
  state.sessions.forEach((session) => {
    const rt = roundtableState(session);
    Object.entries(rt.assistantConfigs || {}).forEach(([cloneId, config]) => {
      if (!config?.importedFrom?.clone) return;
      const sourceCreatorId = clean(config.importedFrom.sourceCreatorId || config.importedFrom.memberId);
      if (!sourceCreatorId || sourceCreatorId === cloneId || !creators[sourceCreatorId]) return;
      const sourceCreator = hydrateCreatorIdentity(creators[sourceCreatorId]);
      const cloneCreator = creators[cloneId] ? hydrateCreatorIdentity(creators[cloneId]) : null;
      const sourceMemories = normalizeAssistantMemories(sourceCreator.memory?.compressedSnapshots);
      const known = new Set(sourceMemories.map(creatorMemoryKey));
      const cloneMemories = normalizeAssistantMemories(cloneCreator?.memory?.compressedSnapshots);
      cloneMemories.forEach((memory) => {
        const key = creatorMemoryKey(memory);
        if (known.has(key)) return;
        known.add(key);
        sourceMemories.push({
          ...memory,
          sourceCreatorId,
        });
      });
      saveCreatorIdentity({
        ...sourceCreator,
        memory: {
          ...(sourceCreator.memory || {}),
          compressedSnapshots: sourceMemories,
        },
        updatedAt: Date.now(),
      });
      const existingSourceConfig = rt.assistantConfigs[sourceCreatorId] || {};
      rt.assistantConfigs[sourceCreatorId] = {
        ...config,
        ...existingSourceConfig,
        name: clean(sourceCreator.name) || clean(config.name),
        memories: normalizeAssistantMemories(existingSourceConfig.memories),
        importedFrom: {
          ...config.importedFrom,
          sourceCreatorId,
          clone: true,
        },
      };
      delete rt.assistantConfigs[cloneId];
      const primaryId = getPrimaryCreatorId(session);
      rt.selectedIds = (rt.selectedIds || [])
        .map((id) => id === cloneId ? sourceCreatorId : id)
        .filter((id, index, list) => id && id !== primaryId && list.indexOf(id) === index);
      rt.speakerOrderIds = (rt.speakerOrderIds || [])
        .map((id) => id === cloneId ? sourceCreatorId : id)
        .filter((id, index, list) => id && id !== primaryId && list.indexOf(id) === index);
      rt.messages = (rt.messages || []).map((message) => (
        message?.speakerId === cloneId
          ? { ...message, speakerId: sourceCreatorId, speakerName: clean(sourceCreator.name) || message.speakerName }
          : message
      ));
      state.creatorParticipationRecords = (state.creatorParticipationRecords || []).map((record) => (
        record?.creatorId === cloneId
          ? { ...record, creatorId: sourceCreatorId, displayName: clean(sourceCreator.name) || record.displayName }
          : record
      ));
      state.councilParticipationRecords = (state.councilParticipationRecords || []).map((record) => (
        record?.councilId === cloneId
          ? { ...record, councilId: sourceCreatorId, speakerName: clean(sourceCreator.name) || record.speakerName }
          : record
      ));
      const cloneOwnsSession = state.sessions.some((item) => item.creatorId === cloneId);
      if (!cloneOwnsSession) delete creators[cloneId];
      changed = true;
    });
  });
  return changed;
}

function syncSealedCreatorTemplatePrompts() {
  const creators = creatorsState();
  let changed = false;
  Object.values(creators).forEach((creator) => {
    const templateId = clean(creator?.sourceTemplateId);
    if (!templateId) return;
    const base = getSealedRoundtableCreatorBase(templateId);
    if (!base) return;
    const nextPrompt = clean(base.prompt);
    if (!nextPrompt || clean(creator.prompt) === nextPrompt) return;
    creators[creator.id] = hydrateCreatorIdentity({
      ...creator,
      prompt: nextPrompt,
      sealedTemplateCode: base.id === "sealed-t" ? "T" : base.id === "sealed-b" ? "B" : clean(creator.sealedTemplateCode),
      updatedAt: Date.now(),
    });
    changed = true;
  });
  return changed;
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
  return workspaceController.sessionWorkspace(session);
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
  const creator = getCreatorIdentity(id);
  if (creator) {
    const isPrimary = id === getPrimaryCreatorId(session);
    return {
      id: creator.id,
      name: creator.name || (isPrimary ? "主创" : "议员"),
      role: isPrimary ? "主创" : "议员",
      prompt: creator.prompt || "",
      avatarUrl: creator.avatarDataUrl || "",
    };
  }
  return getRoundAssistantBaseFromState(id, session?.roundtable);
}

function getRoundAssistants() {
  return getRoundAssistantBases().map((assistant) => getRoundAssistant(assistant.id)).filter(Boolean);
}

function isCustomRoundAssistant(id) {
  return isCustomRoundAssistantInState(id, roundtableState());
}

function getRoundAssistant(id) {
  const creator = getCreatorIdentity(id);
  if (creator) {
    const api = apiForProvider(creator.modelConfig?.providerId);
    const rt = roundtableState();
    const config = rt.assistantConfigs?.[id] || {};
    const assistant = creatorToAssistant(creator, api, sessionSettings(), normalizeRoundtableContextOptions({
      ...rt.contextOptions,
      ...(config.contextOptions || {}),
    }));
    if (assistant) {
      assistant.networkEnabled = Boolean(config.networkEnabled);
      assistant.activationProfile = clean(config.activationProfile) || assistant.activationProfile;
      assistant.memories = [
        ...normalizeAssistantMemories(assistant.memories),
        ...normalizeAssistantMemories(config.memories),
      ];
    }
    if (assistant && id !== getPrimaryCreatorId()) assistant.role = "议员";
    return assistant;
  }
  const base = getRoundAssistantBase(id);
  const rt = roundtableState();
  const config = rt.assistantConfigs[id] || {};
  const assistant = resolveRoundAssistant({
    base,
    config,
    api: apiForAssistantConfig(config),
    sessionSettings: sessionSettings(),
    roundtableContextOptions: rt.contextOptions,
  });
  if (assistant?.id === "writer") return applyWriterInheritance(assistant);
  return assistant;
}

function getRoundAssistantFromSession(session, id) {
  const creator = getCreatorIdentity(id);
  if (creator) {
    const api = apiForProvider(creator.modelConfig?.providerId);
    const rt = roundtableState(session);
    const config = rt.assistantConfigs?.[id] || {};
    const assistant = creatorToAssistant(creator, api, sessionSettings(session), normalizeRoundtableContextOptions({
      ...rt.contextOptions,
      ...(config.contextOptions || {}),
    }));
    if (assistant) {
      assistant.networkEnabled = Boolean(config.networkEnabled);
      assistant.activationProfile = clean(config.activationProfile) || assistant.activationProfile;
      assistant.memories = [
        ...normalizeAssistantMemories(assistant.memories),
        ...normalizeAssistantMemories(config.memories),
      ];
    }
    if (assistant && id !== getPrimaryCreatorId(session)) assistant.role = "议员";
    return assistant;
  }
  const rt = roundtableState(session);
  const base = getRoundAssistantBase(id, session);
  const config = rt.assistantConfigs[id] || {};
  return resolveRoundAssistant({
    base,
    config,
    api: apiForAssistantConfig(config),
    sessionSettings: sessionSettings(session),
    roundtableContextOptions: rt.contextOptions,
  });
}

function getRoundAssistantConfig(id) {
  const assistant = getRoundAssistant(id);
  return createRoundAssistantConfigView(assistant, sessionSettings().temperature);
}

function isLegacyDefaultCreatorName(name) {
  return ["戏剧型主创", "规则型主创", "人物型主创", "怀疑型主创", "表达型主创", "主创"].includes(clean(name));
}

function getCreatorFallbackName() {
  return clean(sessionSettings().model) || "主创";
}

function isAutoPrimaryCreatorName(creator, options = {}) {
  const name = clean(typeof creator === "string" ? creator : creator?.name);
  if (!name || isLegacyDefaultCreatorName(name)) return true;
  const autoNames = [
    clean(sessionSettings(options.session || activeSession()).model),
    clean(creator?.modelConfig?.model),
    clean(options.previousModel),
    clean(options.nextModel),
    ...SEALED_ROUNDTABLE_CREATORS.flatMap((base) => [base.name, base.sealedTemplateCode, base.id]),
    ...(options.extraNames || []),
  ].map(clean).filter(Boolean);
  return autoNames.includes(name);
}

function assistantAliases(assistant) {
  const base = getRoundAssistantBase(assistant.id) || assistant;
  return getRoundAssistantAliases(assistant, base);
}

function cleanRoundtableAssistantOutput(assistant, content) {
  return stripRoundtableSpeakerPrefix(content, assistant?.name, assistant ? assistantAliases(assistant) : []);
}

function simpleHash(text) {
  const source = clean(text);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function writerState(session = activeSession()) {
  return writerController.writerState(session);
}

function getWriterStyleSource(session = activeSession()) {
  return writerController.getWriterStyleSource(session);
}

function refreshWriterStyleCache(options = {}) {
  return writerController.refreshWriterStyleCache(options);
}

async function refreshWriterStyleCacheWithAi(options = {}) {
  return writerController.refreshWriterStyleCacheWithAi(options);
}

function applyWriterInheritance(writer) {
  return writerController.applyWriterInheritance(writer);
}

function rememberCouncilParticipation(assistant, message, instruction = "") {
  if (!assistant || assistant.id === "writer" || !message || !clean(message.content)) return;
  const memoryCreatorId = getCreatorMemoryRootId(assistant.id);
  const result = appendCouncilParticipationRecord(state.councilParticipationRecords, {
    councilId: assistant.id,
    sessionId: activeSession()?.id,
    roundtableMessageId: message.id,
    topic: clean(roundtableState().contextOptions?.roundTopic || instruction),
    speakerName: assistant.name,
    content: message.content,
    roleState: getRoundtableRoleState(roundtableState().selectedIds, assistant.id) || "participant",
  });
  state.councilParticipationRecords = result.records;
  const creatorResult = appendCreatorParticipationRecord(state.creatorParticipationRecords, {
    creatorId: memoryCreatorId,
    sessionId: activeSession()?.id,
    roundtableMessageId: message.id,
    topic: clean(roundtableState().contextOptions?.roundTopic || instruction),
    displayName: assistant.name,
    summary: message.content,
    content: message.content,
    roleState: getRoundtableRoleState(roundtableState().selectedIds, assistant.id) || "participant",
  });
  state.creatorParticipationRecords = creatorResult.records;
  const distilled = createMemoryFromParticipationRecord(creatorResult.record, {
    sourceRoundtableId: activeSession()?.id,
  });
  if (distilled) saveCreatorMemoryEntries(memoryCreatorId, [distilled]);
}

function rememberCreatorRoundtableJoin(creatorId, details = {}) {
  const session = activeSession();
  const memoryCreatorId = getCreatorMemoryRootId(creatorId, session);
  const creator = getCreatorIdentity(memoryCreatorId);
  if (!session || !creator || memoryCreatorId === getPrimaryCreatorId(session)) return null;
  const topic = clean(roundtableState(session).contextOptions?.roundTopic) || "入席记录";
  const summary = clean(details.summary) || "已入席当前圆桌";
  const content = clean(details.privateContent) || "你被邀请来到了一个圆桌会议";
  const result = appendCreatorParticipationRecord(state.creatorParticipationRecords, {
    creatorId: memoryCreatorId,
    sessionId: session.id,
    displayName: creator.name,
    topic,
    summary,
    content,
    roleState: "participant",
  });
  state.creatorParticipationRecords = result.records;
  return result.record;
}

function getRoundtableMentionableAssistants(options = {}) {
  const rt = roundtableState();
  const allowWriter = options.allowWriter !== false;
  const primary = getRoundAssistant(getPrimaryCreatorId());
  const assistants = new Map([
    ...(primary ? [primary] : []),
    ...getRoundAssistants(),
    ...(rt.selectedIds || []).map((id) => getRoundAssistant(id)).filter(Boolean),
  ].map((assistant) => [assistant.id, assistant]));
  const primaryItem = primary
    ? [{
      ...primary,
      role: "主创",
      roundtableRoleState: "host",
    }]
    : [];
  const selected = (rt.selectedIds || [])
    .map((id) => assistants.get(id))
    .filter(Boolean)
    .map((assistant) => ({
      ...assistant,
      roundtableRoleState: getRoundtableRoleState(rt.selectedIds, assistant.id),
    }));
  const writer = assistants.get("writer");
  const items = [...primaryItem, ...selected];
  return allowWriter && writer ? [...items, writer] : items;
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
  const mentionMap = new Map();
  getRoundtableMentionableAssistants().forEach((assistant) => {
    assistantAliases(assistant).forEach((alias) => {
      if (!mentionMap.has(alias)) mentionMap.set(alias, assistant);
    });
  });
  return renderMarkdown(text, {
    renderPlainText(source, { escapeHtml: escape }) {
      const pattern = /@([A-Za-z0-9_\-\u4e00-\u9fff]+)/g;
      let html = "";
      let lastIndex = 0;
      let match;
      while ((match = pattern.exec(source))) {
        html += escape(source.slice(lastIndex, match.index));
        const raw = match[0];
        const alias = normalizeMentionName(match[1]);
        const target = mentionMap.get(alias);
        if (!target) {
          html += `<span class="roundtable-mention unknown">${escape(raw)}</span>`;
        } else {
          const profile = getRoundtableSpeakerProfile({ speakerId: target.id, speakerName: target.name });
          html += `<span class="roundtable-mention ${profile.tone}" data-mention-id="${escape(target.id)}">${escape(raw)}</span>`;
        }
        lastIndex = match.index + raw.length;
      }
      html += escape(source.slice(lastIndex));
      return html;
    },
  });
}

function renderAssistantMarkdown(text) {
  return renderMarkdown(text);
}

function renderChatContent(node, content, isStreamingThisNode) {
  if (!content && !isStreamingThisNode) return "";
  if (node.role === "assistant") {
    return `<div class="message-content message-markdown">${renderAssistantMarkdown(content)}</div>`;
  }
  return `<span class="message-content">${escapeHtml(content)}</span>`;
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

function activateBranchToNode(nodeId, session = activeSession()) {
  const changed = activateSessionPathToNode(session, nodeId);
  if (changed) pruneCreatorMemoriesForActiveBranch(session);
  return changed;
}

function getMessageContent(node) {
  if (!node) return "";
  if (node.role === "assistant") return getAssistantVersion(node)?.content || "";
  return node.content || "";
}

function normalizeChatAttachments(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter((item) => item?.dataUrl || clean(item?.textExcerpt) || clean(item?.name))
    .slice(0, CHAT_ATTACHMENT_LIMIT)
    .map((item) => ({
      id: item.id || uid("att"),
      kind: clean(item.kind) || (item.dataUrl ? "image" : clean(item.textExcerpt) ? "text" : "file"),
      name: clean(item.name) || (item.dataUrl ? "image" : "file"),
      type: clean(item.type),
      size: Number(item.size) || 0,
      dataUrl: clean(item.dataUrl),
      textExcerpt: clean(item.textExcerpt).slice(0, CHAT_TEXT_EXCERPT_LIMIT),
      readable: Boolean(item.readable || clean(item.textExcerpt)),
    }));
}

function chatAttachmentLabel(attachments = []) {
  const items = normalizeChatAttachments(attachments);
  if (!items.length) return "";
  const imageCount = items.filter((item) => item.kind === "image").length;
  const fileCount = items.length - imageCount;
  return [
    imageCount ? `${imageCount} 张图片` : "",
    fileCount ? `${fileCount} 个文件` : "",
  ].filter(Boolean).join("，").replace(/^(.+)$/, "[$1]");
}

function renderMessagePlainContent(node) {
  return [getMessageContent(node), chatAttachmentLabel(node?.attachments)].filter(Boolean).join("\n");
}

function buildUserRequestContent(text, attachments = []) {
  const items = normalizeChatAttachments(attachments);
  const fileText = buildChatAttachmentPrompt(items);
  const requestText = [clean(text), fileText].filter(Boolean).join("\n\n");
  const images = items.filter((item) => item.kind === "image" && item.dataUrl);
  if (!images.length) return requestText || text;
  const content = [{ type: "text", text: requestText || "请结合附件继续。" }];
  images.forEach((image) => {
    content.push({ type: "image_url", image_url: { url: image.dataUrl } });
  });
  return content;
}

function buildChatAttachmentPrompt(attachments = []) {
  const files = normalizeChatAttachments(attachments).filter((item) => item.kind !== "image");
  if (!files.length) return "";
  return [
    "【用户本轮附件】",
    ...files.map((file, index) => {
      const title = `${index + 1}. ${file.name}${file.size ? `（${formatBytes(file.size)}）` : ""}`;
      if (file.textExcerpt) return `${title}\n${file.textExcerpt}`;
      return `${title}\n（此文件已附加为索引，但当前版本暂未读取全文；请使用 TXT/MD/JSON/CSV/YAML/LOG 这类基础文本文件。）`;
    }),
  ].join("\n\n");
}

function buildChatImagePrompt(attachments = []) {
  const images = normalizeChatAttachments(attachments).filter((item) => item.kind === "image");
  if (!images.length) return "";
  return `【用户本轮图片】\n${images.map((image, index) => `${index + 1}. ${image.name}${image.size ? `（${formatBytes(image.size)}）` : ""}`).join("\n")}`;
}

function buildUserTextWithAttachments(text, attachments = []) {
  return [
    clean(text),
    buildChatAttachmentPrompt(attachments),
    buildChatImagePrompt(attachments),
  ].filter(Boolean).join("\n\n");
}

function buildRoundtableInstructionPayload(text, attachments = []) {
  const items = normalizeChatAttachments(attachments);
  return {
    text: buildUserTextWithAttachments(text, items),
    attachments: items.filter((item) => item.kind === "image" && item.dataUrl),
  };
}

function messageContentText(content) {
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part?.type === "text") return part.text || "";
      if (part?.type === "image_url") return "[图片]";
      return "";
    }).filter(Boolean).join("\n");
  }
  return clean(content);
}

function messageHasContent(message) {
  return Boolean(messageContentText(message?.content));
}

function messagesToPlainText(messages = []) {
  return messages.map((message) => `${message.role}: ${messageContentText(message.content)}`).join("\n\n");
}

function buildWorkspaceMemory(session = activeSession()) {
  return workspaceController.buildWorkspaceMemory(session);
}

function memoryQueryLooksNeeded(text = "") {
  const source = clean(text);
  if (!source) return false;
  return /记得|记忆|以前|之前|上次|刚才|延续|继续|接着|参会|圆桌|在哪|说过|提过|忘|回忆|历史|旧会话|原会话/.test(source);
}

function memoryQueryTokens(text = "") {
  const source = clean(text).toLowerCase();
  const tokens = new Set();
  (source.match(/[a-z0-9_\-]{2,}/g) || []).forEach((token) => tokens.add(token));
  (source.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach((segment) => {
    if (segment.length <= 12) tokens.add(segment);
    for (let index = 0; index < Math.min(segment.length - 1, 24); index += 1) {
      tokens.add(segment.slice(index, index + 2));
    }
  });
  return Array.from(tokens).slice(0, 48);
}

function scoreMemoryText(text = "", tokens = [], sessionId = "") {
  const source = clean(text).toLowerCase();
  if (!source) return 0;
  let score = 0;
  tokens.forEach((token) => {
    if (token && source.includes(token)) score += Math.min(8, token.length);
  });
  if (sessionId && source.includes(sessionId.toLowerCase())) score += 2;
  return score;
}

function buildLinkedSourceSessionMemoryText(sourceSession, sourceCreatorId = "") {
  if (!sourceSession) return "";
  const sourceCreator = getCreatorIdentity(sourceCreatorId || getPrimaryCreatorId(sourceSession));
  const novel = sessionNovel(sourceSession);
  const recentChat = activePath(sourceSession)
    .filter((node) => ["user", "assistant"].includes(node.role))
    .slice(-18)
    .map((node) => `${node.role === "user" ? "用户" : sourceCreator?.name || "来源主创"}：${getMessageContent(node)}`)
    .filter((line) => clean(line))
    .join("\n")
    .slice(-2600);
  return [
    `来源会话：${titleForSession(sourceSession)}`,
    sourceCreator ? `来源主创：${sourceCreator.name || "主创"}` : "",
    clean(sourceCreator?.memory?.displayName) ? `来源记忆库：${clean(sourceCreator.memory.displayName)}` : "",
    buildNovelMemoryFromSession(novel) ? `【来源小说资料】\n${buildNovelMemoryFromSession(novel)}` : "",
    recentChat ? `【来源最近有效对话】\n${recentChat}` : "",
  ].filter(Boolean).join("\n\n");
}

function getLinkedSourceMemoryItems(creator) {
  const snapshots = Array.isArray(creator?.memory?.compressedSnapshots)
    ? creator.memory.compressedSnapshots
    : [];
  const links = new Map();
  snapshots.forEach((item) => {
    const sourceSessionId = clean(item?.sourceSessionId);
    if (!sourceSessionId) return;
    links.set(sourceSessionId, clean(item?.sourceCreatorId));
  });
  return Array.from(links.entries())
    .map(([sourceSessionId, sourceCreatorId]) => {
      const sourceSession = state.sessions.find((session) => session.id === sourceSessionId);
      const text = buildLinkedSourceSessionMemoryText(sourceSession, sourceCreatorId);
      return text ? {
        type: "来源会话实时记忆",
        text,
        createdAt: Number(sourceSession?.updatedAt) || Date.now(),
        sourceSessionId,
      } : null;
    })
    .filter(Boolean);
}

function getCreatorMemorySnippets(creatorId, query = "", options = {}) {
  const memoryCreatorId = getCreatorMemoryRootId(creatorId);
  const creator = getCreatorIdentity(memoryCreatorId);
  if (!creator) return [];
  const limit = Math.max(1, Number(options.limit) || 8);
  const includeRecent = Boolean(options.includeRecent);
  const shouldQuery = includeRecent || memoryQueryLooksNeeded(query);
  if (!shouldQuery) return [];
  const tokens = memoryQueryTokens(query);
  const currentSessionId = clean(options.sessionId || activeSession()?.id);
  const entryItems = retrieveCreatorMemories(creator.memory, query, {
    includeRecent,
    limit: Math.max(limit, 24),
    sessionId: currentSessionId,
    roundtableId: clean(options.roundtableId),
    isActiveMemory: (entry) => !entry.sourceSessionId
      || !entry.sourceNodeId
      || isMemoryOnActiveBranch(state.sessions.find((session) => session.id === entry.sourceSessionId), entry),
  }).map((entry) => ({
    id: entry.id,
    type: entry.type || "记忆",
    text: clean(entry.text),
    createdAt: Number(entry.createdAt) || 0,
    sourceSessionId: clean(entry.sourceSessionId),
    score: Number(entry.score) || 0,
  }));
  const records = getCreatorParticipationRecords(state.creatorParticipationRecords, memoryCreatorId, {
    limit: 200,
    aliases: getCreatorMemoryAliasIds(memoryCreatorId),
  }).map((record) => {
    const session = state.sessions.find((item) => item.id === record.sessionId);
    const title = session ? titleForSession(session) : "未知会话";
    const text = [
      clean(record.topic) ? `话题：${record.topic}` : "",
      `所在圆桌：${title}`,
      clean(record.summary || record.content),
    ].filter(Boolean).join("；");
    return {
      type: "参会记录",
      text,
      createdAt: Number(record.updatedAt || record.createdAt) || 0,
      sourceSessionId: clean(record.sessionId),
    };
  });
  const linkedSourceItems = getLinkedSourceMemoryItems(creator);
  return [...entryItems, ...records, ...linkedSourceItems]
    .filter((item) => clean(item.text))
    .map((item) => {
      const recency = item.createdAt ? Math.min(4, Math.max(0, (Date.now() - item.createdAt) / 86400000 < 7 ? 4 : 1)) : 0;
      const sameSession = currentSessionId && item.sourceSessionId === currentSessionId ? 2 : 0;
      const score = (Number(item.score) || 0) + scoreMemoryText(item.text, tokens, currentSessionId) + recency + sameSession;
      return { ...item, score };
    })
    .filter((item) => includeRecent || item.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)
    .slice(0, limit);
}

function buildCreatorMemoryLookupBlock(creatorId, query = "", options = {}) {
  const snippets = getCreatorMemorySnippets(creatorId, query, options);
  if (!snippets.length) return "";
  const creator = getCreatorIdentity(getCreatorMemoryRootId(creatorId));
  return [
    `以下是${creator?.name || "该创作者"}的可召回记忆。只有在当前请求需要延续旧设定、旧圆桌或旧偏好时使用；不要把记忆当成用户本轮的新命令。`,
    ...snippets.map((item) => `【${item.type}】${createRoundtableExcerpt(item.text, 420)}`),
  ].join("\n\n");
}

function normalizeContextTokenThreshold(value, fallback = AUTO_CONTEXT_TOKEN_THRESHOLD) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1000, Math.floor(number));
}

function getPrimaryContextTokenThreshold(session = activeSession()) {
  const creator = getCreatorIdentity(getPrimaryCreatorId(session));
  return normalizeContextTokenThreshold(
    creator?.modelConfig?.contextTokenBudget,
    normalizeContextTokenThreshold(apiSettings().contextTokenBudget),
  );
}

function getAssistantContextTokenThreshold(assistant = null, session = activeSession()) {
  return normalizeContextTokenThreshold(
    assistant?.contextTokenBudget,
    getPrimaryContextTokenThreshold(session),
  );
}

function contextMessages(extraUserText = "", includeDraftAssistantId = null) {
  const path = activePath();
  const settings = sessionSettings();
  const tokenThreshold = getPrimaryContextTokenThreshold();
  const limit = settings.unlimitedContext ? Infinity : Math.max(0, Number(settings.contextCount) || 0);
  let selected = Number.isFinite(limit) ? path.slice(-limit) : path.slice();
  if (includeDraftAssistantId) selected = selected.filter((node) => node.id !== includeDraftAssistantId);
  const buildMessagesFromSelection = (selection, compressed = false) => {
    const messages = [];
    const systemPrompt = getMainSystemPrompt();
    if (clean(systemPrompt)) {
      messages.push({ role: "system", content: systemPrompt });
    }
    const novelMemory = buildNovelMemory();
    if (novelMemory) {
      messages.push({ role: "system", content: novelMemory });
    }
    const workspaceMemory = buildWorkspaceMemory();
    if (workspaceMemory) {
      messages.push({ role: "system", content: workspaceMemory });
    }
    const creatorMemory = buildCreatorMemoryLookupBlock(getPrimaryCreatorId(), extraUserText, {
      limit: 6,
      sessionId: activeSession()?.id,
      includeRecent: true,
    });
    if (creatorMemory) {
      messages.push({ role: "system", content: creatorMemory });
    }
    if (compressed) {
      messages.push({
        role: "system",
        content: "当前对话过长，已自动改用小说资料和最近对话继续。剧情线、角色卡、世界观、大纲、伏笔线是压缩后的长期记忆，请优先依据它们保持连续性。",
      });
    }
    selection.forEach((node) => {
      if (node.role === "user") messages.push({ role: "user", content: buildUserRequestContent(node.content, node.attachments) });
      if (node.role === "assistant") messages.push({ role: "assistant", content: getAssistantVersion(node)?.content || "" });
    });
    if (clean(extraUserText)) messages.push({ role: "user", content: extraUserText });
    return messages;
  };
  let messages = buildMessagesFromSelection(selected);
  const estimated = estimateTokens(messagesToPlainText(messages));
  const novelMemory = buildNovelMemory();
  if (estimated > tokenThreshold && novelMemory && selected.length > COMPRESSED_CONTEXT_TAIL_COUNT) {
    selected = selected.slice(-COMPRESSED_CONTEXT_TAIL_COUNT);
    messages = buildMessagesFromSelection(selected, true);
  }
  return messages.filter(messageHasContent);
}

function getAutoContextCompressedInfo(extraUserText = "") {
  const full = contextMessages(extraUserText);
  const text = messagesToPlainText(full);
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
    getMainSystemPrompt(),
    buildNovelMemory(),
    buildWorkspaceMemory(),
    ...selected.map(renderMessagePlainContent),
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
    activePath().map(renderMessagePlainContent).join("\n\n"),
  ].join("\n\n").length;
}

async function ensureAutoCompressNovelMemory(extraUserText = "", includeDraftAssistantId = null) {
  syncNovelFromFields();
  const fullTokens = estimateFullContextTokens(extraUserText, includeDraftAssistantId);
  const tokenThreshold = getPrimaryContextTokenThreshold();
  if (fullTokens <= tokenThreshold) return false;
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
  const runtime = roundtableGenerating
    ? { api: apiSettings(), settings: sessionSettings() }
    : getPrimaryCreatorRuntimeConfig();
  const text = await aiClient.generateText({
    api: runtime.api,
    settings: {
      ...runtime.settings,
      temperature: 0.25,
      maxTokens: Math.max(1600, Number(runtime.settings.maxTokens) || 0),
    },
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
  return [
    buildNovelSourceText(novel, chat),
    buildWorkspaceMemory(),
  ].filter(Boolean).join("\n\n");
}

function contextInfo(extraUserText = "") {
  const messages = contextMessages(extraUserText);
  const text = messagesToPlainText(messages);
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

// 127 call-sites use showToast(). Rather than rip them out, we route
// through the new MD3 snackbar (FIFO queue, ARIA-live, M3 motion). The
// legacy #toast element is kept as a graceful fallback if the snackbar
// host isn't mounted yet (e.g. very early bootstrap or test envs).
function showToast(message) {
  if (message == null) return;
  try {
    showSnackbar(String(message), { short: true });
    return;
  } catch (_) { /* fall through to legacy DOM */ }
  if (!els.toast) return;
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

function askThreeWayDelete({ title = "确认删除", message = "", confirmLabel = "确定", keepLabel = "保留", cancelLabel = "取消" } = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "delete-choice-dialog";
    dialog.innerHTML = `
      <form method="dialog" class="delete-choice-card">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(message)}</p>
        <div class="delete-choice-actions">
          <button value="cancel" type="submit">${escapeHtml(cancelLabel)}</button>
          <button value="confirm" type="submit" class="danger-button">${escapeHtml(confirmLabel)}</button>
          <button value="keep" type="submit" class="primary-button">${escapeHtml(keepLabel)}</button>
        </div>
      </form>
    `;
    const cleanup = () => {
      const value = dialog.returnValue || "cancel";
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener("close", cleanup, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
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
  const opensBubbleMenu = command === "toggle-menu" || command === "toggle-roundtable-menu";
  if (opensBubbleMenu) {
    return;
  }
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

function openSettingsPanel() {
  activeSettingsPage = "home";
  settingsModelPickerOpen = false;
  showPanel("settings");
  renderSettingsPage();
}

function closePanels(options = {}) {
  const hadPanel = Boolean(panelManager.getActivePanel());
  activeSettingsPage = "home";
  settingsModelPickerOpen = false;
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

function pushTransientHistory() {
  if (history.state?.tbirdTransientOpen) {
    transientHistoryOpen = true;
    return;
  }
  try {
    history.pushState({ ...(history.state || {}), tbirdTransientOpen: true }, "");
    transientHistoryOpen = true;
  } catch {
    transientHistoryOpen = false;
  }
}

function pushDialogHistory() {
  if (history.state?.tbirdDialogOpen) {
    dialogHistoryOpen = true;
    return;
  }
  try {
    history.pushState({ ...(history.state || {}), tbirdDialogOpen: true }, "");
    dialogHistoryOpen = true;
  } catch {
    dialogHistoryOpen = false;
  }
}

function getOpenDialog() {
  return [els.assistantConfigDialog, els.editDialog].find((dialog) => dialog?.open) || null;
}

function closeOpenDialog(options = {}) {
  const dialog = getOpenDialog();
  if (!dialog) return false;
  closingDialogFromHistory = Boolean(options.fromHistory);
  dialog.close();
  return true;
}

function handleDialogClosed() {
  if (closingDialogFromHistory) {
    dialogHistoryOpen = false;
    closingDialogFromHistory = false;
    return;
  }
  if (dialogHistoryOpen && history.state?.tbirdDialogOpen) {
    if (roundtableState().membersOpen) {
      keepRoundtableMembersOnDialogBack = true;
    }
    dialogHistoryOpen = false;
    history.back();
    return;
  }
  dialogHistoryOpen = false;
}

function closeRoundtableMembers(options = {}) {
  roundtableController.closeRoundtableMembers(options);
}

function ensureWorkspaceUi() {
  workspaceController.ensureWorkspaceUi();
}

function ensureModelPickerUi() {
  if (!els.modelSelect) return;
  els.modelSelect.hidden = true;
  if (!els.modelSelectButton) {
    const button = document.createElement("button");
    button.id = "modelSelectButton";
    button.className = "model-select-button";
    button.type = "button";
    button.dataset.command = "open-model-config";
    button.setAttribute("aria-label", "模型配置");
    els.modelSelect.before(button);
    els.modelSelectButton = button;
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

// Persist is debounced via requestIdleCallback so dozens of state writes
// during streaming or rapid composer typing collapse to a single localStorage
// write per idle frame. See src/utils/scheduler.js.
const persistDebouncer = createIdleDebouncer(
  (s) => { try { persistStateNow(s); } catch (_) { /* quota errors silenced */ } },
  { timeout: 400 }
);
function persistState(s) { persistDebouncer.schedule(s); }
function persistStateImmediate(s) { persistDebouncer.cancel(); persistStateNow(s); }

// render() coalesces multiple synchronous schedule() calls within the same
// task into a single rAF tick. Callers anywhere may call render() freely;
// the body in renderNow() runs at most once per frame.
const renderScheduler = createFrameScheduler(() => renderNow());
function render() { renderScheduler.schedule(); }
function renderImmediate() { renderScheduler.flush(); renderNow(); }

// Cheap visibility guards used inside renderNow to skip work for panels
// that are currently closed. Avoids re-serialising entire sub-trees on
// every keystroke when the user can't even see them, which the user
// experienced as "every tap flashes" + lag.
function isPanelOpen(el) { return Boolean(el) && !el.hidden && !el.hasAttribute("inert"); }

function renderNow() {
  const session = activeSession();
  ensureSessionCreator(session);
  const rt = roundtableState(session);
  ensureWorkspaceUi();
  ensureModelPickerUi();
  applyLayout();
  applySessionAppearance();
  const nextTitle = rt.enabled ? `圆桌 · ${titleForSession(session)}` : titleForSession(session);
  if (els.title.textContent !== nextTitle) els.title.textContent = nextTitle;
  renderRoundtable();
  renderMessages();
  if (isPanelOpen(els.historyPanel))   renderSessions();
  if (isPanelOpen(els.settingsPanel))  renderSettings();
  if (isPanelOpen(els.settingsPanel))  renderCustomLayoutPresets();
  if (isPanelOpen(els.novelPanel))     renderNovelPanel();
  if (isPanelOpen(els.workspacePanel)) renderWorkspacePanel();
  renderModelPicker();
  renderContextBadge();
  renderMenu();
  // Toggle classList only when the value actually changes — calling
  // toggle(name, value) when value already matches still triggers a
  // style invalidation + ::before transition restart.
  setBodyClass("is-generating", isGenerating);
  setBodyClass("roundtable-mode", rt.enabled);
  setBodyClass("roundtable-busy", roundtableGenerating);
  setBodyClass("is-ready", Boolean(clean(els.input.value)) || pendingChatAttachments.length > 0);
  persistState(state);
}

function setBodyClass(name, on) {
  const has = els.body.classList.contains(name);
  if (Boolean(on) === has) return;
  els.body.classList.toggle(name, Boolean(on));
}

function renderRoundtable() {
  if (!els.roundtableWorkspace) return;
  const rt = roundtableState();
  if (rt.enabled && els.roundtableMembersPanel && els.composer && els.roundtableMembersPanel.parentElement !== els.composer) {
    els.composer.insertBefore(els.roundtableMembersPanel, els.composer.firstChild);
  }
  els.roundtableWorkspace.hidden = !rt.enabled;
  els.messages.hidden = rt.enabled;
  if (rt.enabled) modelPickerOpen = false;
  if (rt.enabled) {
    els.input.placeholder = "圆桌发言...";
  } else {
    els.input.placeholder = "在这里输入你的问题...";
  }
  if (els.composerToolButton) {
    const sealedLocked = Boolean(clean(getCreatorIdentity(getPrimaryCreatorId())?.sourceTemplateId));
    const creator = getRoundAssistant(getPrimaryCreatorId());
    const creatorName = clean(creator?.name) || "主创";
    els.composerToolButton.hidden = false;
    els.composerToolButton.textContent = rt.enabled ? "参会人" : (sealedLocked ? creatorName.slice(0, 1) : "主");
    els.composerToolButton.setAttribute("aria-label", rt.enabled ? "参会人" : `${creatorName}设置`);
    els.composerToolButton.setAttribute("title", rt.enabled ? "参会人" : `${creatorName}设置`);
    els.composerToolButton.classList.toggle("is-roundtable-members", rt.enabled);
    els.composerToolButton.classList.toggle("is-writer-settings", !rt.enabled);
    els.composerToolButton.classList.toggle("is-sealed-creator", !rt.enabled && sealedLocked);
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
        const order = assistant.id === getPrimaryCreatorId() ? "主" : assistant.id === "writer" ? "写" : String((rt.selectedIds || []).indexOf(assistant.id) + 1 || "");
        return `
          <button class="roundtable-mention-choice ${profile.tone}" type="button" data-command="insert-roundtable-mention" data-member-id="${escapeHtml(assistant.id)}">
            <span class="roundtable-mention-choice-index">${escapeHtml(order)}</span>
            <b>${escapeHtml(assistant.name)}</b>
            <small>${escapeHtml(assistant.role)}</small>
          </button>
        `;
      }).join("")}`
    : `<div class="roundtable-mention-empty">没有可 @ 的成员</div>`;
}

function renderRoundtableMembers(rt) {
  const selectedIds = Array.isArray(rt.selectedIds) ? rt.selectedIds : [];
  const speakerOrderIds = getRoundtableSpeakerOrderIds(rt);
  const order = new Map(speakerOrderIds.map((id, index) => [id, index + 1]));
  const primaryId = getPrimaryCreatorId();
  const primary = getRoundAssistant(primaryId);
  const primaryModel = primary?.model || sessionSettings().model || "未选模型";
  const primaryCreator = getCreatorIdentity(primaryId);
  const primaryTemplate = clean(primaryCreator?.sealedTemplateCode) || getCreatorSourceTemplateId(primaryId);
  const primaryEnabled = rt.primaryInRound !== false;
  const primarySeat = primary ? `
    <div class="roundtable-member-option primary fixed ${roundtableActiveSpeakerId === primary.id ? "speaking" : ""}">
      <button class="roundtable-member-main" type="button" data-command="roundtable-toggle-primary-speaking" data-member-id="${escapeHtml(primary.id)}">
        <span>${primaryEnabled ? escapeHtml(order.get(primary.id) || "主") : "休"}</span>
        <b>${escapeHtml(primary.name || "主创")}</b>
        <small>${primaryEnabled ? "本轮发言" : "本轮旁听"} · ${escapeHtml(primaryModel)}${primaryTemplate ? ` · ${escapeHtml(primaryTemplate)}` : ""}</small>
      </button>
      <div class="roundtable-member-actions">
        <button type="button" data-command="roundtable-edit-assistant" data-member-id="${escapeHtml(primary.id)}">改</button>
      </div>
    </div>
  ` : "";
  const selectedCreatorBases = (rt.selectedIds || [])
    .map((id) => getCreatorIdentity(id))
    .filter((creator) => creator && creator.id !== primaryId)
    .map((creator) => ({
      id: creator.id,
      name: creator.name || "主创",
      role: "议员",
      prompt: creator.prompt || "",
      avatarUrl: creator.avatarDataUrl || "",
    }));
  const baseItems = [
    ...getRoundAssistantBases()
    .filter((base) => base.id !== "writer" && base.id !== "plot" && !isSealedRoundtableCreatorId(base.id))
    .filter((base) => !selectedCreatorBases.some((creator) => creator.id === base.id)),
    ...selectedCreatorBases,
  ];
  const members = baseItems
    .map((base) => {
      const assistant = getRoundAssistant(base.id);
      const rawConfig = rt.assistantConfigs?.[assistant.id] || {};
      const selected = order.get(assistant.id);
      const model = assistant.model || sessionSettings().model || "未选模型";
      const roleLabel = getRoundtableRoleLabel(getRoundtableRoleState(rt.selectedIds, assistant.id), assistant.role);
      const sourceTitle = clean(rawConfig.importedFrom?.sessionTitle);
      const sourceLabel = sourceTitle ? ` · 来自${sourceTitle}` : "";
      const speaking = roundtableActiveSpeakerId === assistant.id;
      return `
        <div class="roundtable-member-option ${selected ? "selected" : ""} ${speaking ? "speaking" : ""}">
          <button class="roundtable-member-main" type="button" data-command="roundtable-toggle-member" data-member-id="${assistant.id}">
            <span>${selected || ""}</span>
            <b>${escapeHtml(assistant.name)}</b>
            <small>${escapeHtml(roleLabel)} · ${escapeHtml(model)}${escapeHtml(sourceLabel)}</small>
          </button>
          <div class="roundtable-member-actions">
            <button type="button" data-command="roundtable-edit-assistant" data-member-id="${escapeHtml(assistant.id)}">改</button>
          </div>
        </div>
      `;
    })
    .join("");
  return `<div class="roundtable-member-sheet-title"><span>参会人设置</span><small>主创 + ${selectedIds.length} 位议员</small></div>
    ${primarySeat}
    ${members}
    <button class="roundtable-material-toggle ${rt.materialsOpen ? "active" : ""}" type="button" data-command="toggle-roundtable-materials">材料</button>
    ${rt.materialsOpen ? renderRoundtableContextControls(rt) : ""}
    <div class="roundtable-member-tools">
      <button class="roundtable-member-add" type="button" data-command="roundtable-add-assistant">+ 添加议员</button>
      <button class="roundtable-member-add ${rt.sessionImportOpen ? "active" : ""}" type="button" data-command="toggle-roundtable-session-import">从会话拉人</button>
    </div>
    ${rt.sessionImportOpen ? renderRoundtableSessionImport() : ""}`;
}

function getRoundtableSpeakerOrderIds(rt = roundtableState()) {
  const primaryId = getPrimaryCreatorId();
  const selectedIds = Array.isArray(rt.selectedIds) ? rt.selectedIds : [];
  const activeIds = [
    ...(rt.primaryInRound === false ? [] : [primaryId]),
    ...selectedIds,
  ].filter(Boolean);
  const storedIds = Array.isArray(rt.speakerOrderIds) ? rt.speakerOrderIds : [];
  return [
    ...storedIds.filter((id) => activeIds.includes(id)),
    ...activeIds.filter((id) => !storedIds.includes(id)),
  ];
}

function assistantConfigHasSavedIdentity(config = {}) {
  if (!config || typeof config !== "object") return false;
  return Boolean(
    clean(config.name)
    || clean(config.prompt)
    || clean(config.model)
    || clean(config.providerId)
    || clean(config.activationProfile)
    || clean(config.avatarDataUrl)
    || normalizeAssistantMemories(config.memories).length
    || assistantController.normalizePrivateMessages(config.privateMessages).length
  );
}

function getRoundtableSessionImportCandidates() {
  return roundtableController.getSessionImportCandidates();
}

function isSessionMemberAlreadyImported(sessionId, memberId) {
  return roundtableController.isSessionMemberAlreadyImported(sessionId, memberId);
}

function renderRoundtableSessionImport() {
  const candidates = getRoundtableSessionImportCandidates();
  if (!candidates.length) {
    return `<section class="roundtable-session-import"><p class="muted">其他会话里还没有可拉入的议员。</p></section>`;
  }
  return `<section class="roundtable-session-import">
    ${candidates.slice(0, 18).map(({ session, assistant, isCustom, isPrimary }) => {
      const imported = isSessionMemberAlreadyImported(session.id, assistant.id);
      const pending = roundtableController.isImportPending(session.id, assistant.id);
      return `
      <article class="roundtable-import-candidate ${pending ? "pending" : ""}">
        <div>
          <b>${escapeHtml(assistant.name)}</b>
          <small>${escapeHtml(titleForSession(session))} · ${escapeHtml(isPrimary ? "会话主创" : isCustom ? "自定义议员" : "会话身份")}${pending ? " · 正在压缩记忆" : ""}</small>
        </div>
        <button type="button" data-command="roundtable-import-session-member" data-session-id="${escapeHtml(session.id)}" data-member-id="${escapeHtml(assistant.id)}" ${imported || pending ? "disabled" : ""}>
          ${pending ? `<span class="mini-spinner" aria-hidden="true"></span>入席中` : imported ? "已在席" : isPrimary ? "克隆入席" : "拉入"}
        </button>
      </article>
    `;
    }).join("")}
  </section>`;
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
    skeptic: { avatar: "疑", badge: "质疑", tone: "tone-skeptic", name: "怀疑型主创" },
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
  const sealedBClass = isSealedBTemplateCreator(memberId) ? " sealed-b-roundtable-avatar" : "";
  const attrs = memberId && memberId !== "user"
    ? ` type="button" data-command="roundtable-edit-assistant" data-member-id="${escapeHtml(memberId)}" title="打开${escapeHtml(profile.name)}设置" aria-label="打开${escapeHtml(profile.name)}设置"`
    : "";
  return attrs
    ? `<button class="roundtable-avatar ${profile.tone}${sealedBClass} avatar-button" ${attrs}>${content}</button>`
    : `<div class="roundtable-avatar ${profile.tone}${sealedBClass}">${content}</div>`;
}

function renderRoundtableMessage(message) {
  const isUser = message.speakerId === "user";
  const isWriter = isWriterProseMessage(message);
  const profile = getRoundtableSpeakerProfile(message);
  const time = formatTime(message.createdAt);
  const decision = renderRoundtableDecisionBadge(message);
  const mentionBadge = renderRoundtableMentionBadge(message);
  const failedClass = message.failed ? " failed" : "";
  const streamingClass = message.streaming ? " streaming" : "";
  if (isWriter) {
    const writerTip = message.streaming
      ? "正在写入正文..."
      : message.manuscriptSync?.active
        ? "已将这一段同步到上方正文区"
        : "这一段尚未同步到正文区";
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
          <div class="roundtable-writer-tip">${escapeHtml(writerTip)}</div>
          <div class="roundtable-writer-snippet roundtable-markdown">${renderRoundtableRichText(message.content || "")}${message.streaming ? '<span class="stream-caret"></span>' : ""}</div>
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
        <div class="roundtable-speech roundtable-markdown" data-command="toggle-roundtable-menu" data-round-id="${message.id}">${renderRoundtableRichText(message.content || "")}${message.streaming ? '<span class="stream-caret"></span>' : ""}</div>
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
  const lastWriter = [...rt.messages].reverse().find((message) => isWriterProseMessage(message) && clean(message.content));
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
    text: "正文尚未开始。",
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
  const ws = writerState();
  const writerLabel = ws.inheritingStyle
    ? "写手正在继承文风"
    : ws.styleCache
      ? "写手已继承文风"
      : "写手待继承";
  return `${source.source} · ${length} 字 · ${writerLabel} · ${getRoundtableRevealLabel()} · ${formatTime(source.updatedAt)}`;
}

function getRoundtablePromptExcerpt(max = roundtableState().contextOptions.excerptMax) {
  const value = normalizePaperText(getRoundtablePaperSource().text);
  return value.length > max ? `...${value.slice(-max)}` : value;
}

function renderPaperTextBlock(text) {
  const value = normalizePaperText(text);
  return value ? `<p>${escapeHtml(value)}</p>` : "";
}

function renderRoundtablePaperManuscript(text) {
  const sourceText = getRoundtablePaperSource().text || "";
  const sourceBody = sessionNovel().body || "";
  const segments = getWriterManuscriptSegments()
    .filter((segment) => segment.stillLinked && segment.start >= 0 && segment.end > segment.start)
    .sort((a, b) => a.start - b.start);
  if (!segments.length || clean(sourceText) !== clean(sourceBody)) {
    return renderPaperTextBlock(text);
  }
  let cursor = 0;
  const parts = [];
  segments.forEach((segment, index) => {
    const before = sourceBody.slice(cursor, segment.start);
    if (clean(before)) parts.push(renderPaperTextBlock(before));
    parts.push(`
      <article class="paper-segment-card">
        <div class="paper-segment-meta">
          <span>写手正文 ${index + 1}</span>
          <time>${escapeHtml(formatTime(segment.message.createdAt))}</time>
        </div>
        <p>${escapeHtml(segment.content)}</p>
      </article>
    `);
    cursor = Math.max(cursor, segment.end);
  });
  const after = sourceBody.slice(cursor);
  if (clean(after)) parts.push(renderPaperTextBlock(after));
  return parts.join("");
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
  const previousText = els.roundtableManuscript.dataset.paperText || "";
  const wasNearBottom = isRoundtablePaperNearBottom() || rt.paperAtBottom;
  if (previousText !== nextText) {
    const grew = nextText.length > Math.max(previousText.length, rt.paperTextLength || 0);
    els.roundtableManuscript.innerHTML = renderRoundtablePaperManuscript(nextText);
    els.roundtableManuscript.dataset.paperText = nextText;
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
    if (els.messages.childElementCount) els.messages.replaceChildren();
    return;
  }
  const nextIds = new Set(path.map((node) => node.id));
  const existing = new Map(
    Array.from(els.messages.querySelectorAll(".chat-row[data-node-id]"))
      .map((row) => [row.dataset.nodeId, row])
  );
  path.forEach((node, index) => {
    const signature = getMessageRenderSignature(node);
    let row = existing.get(node.id);
    if (!row || row.dataset.renderSignature !== signature) {
      const nextRow = createMessageElement(node);
      nextRow.dataset.renderSignature = signature;
      if (row) {
        row.replaceWith(nextRow);
      }
      row = nextRow;
    }
    const current = els.messages.children[index];
    if (current !== row) {
      els.messages.insertBefore(row, current || null);
    }
  });
  Array.from(els.messages.querySelectorAll(".chat-row[data-node-id]")).forEach((row) => {
    if (!nextIds.has(row.dataset.nodeId)) row.remove();
  });
}

function createMessageElement(node) {
  const template = document.createElement("template");
  template.innerHTML = renderMessage(node).trim();
  return template.content.firstElementChild;
}

function getMessageRenderSignature(node) {
  const content = getMessageContent(node);
  const version = getAssistantVersion(node);
  const parent = getNode(node.parentId);
  const attachments = normalizeChatAttachments(node.attachments);
  return [
    node.id,
    node.role,
    node.activeVersionId || "",
    node.versions?.length || 0,
    version?.createdAt || node.createdAt || 0,
    version?.usage?.total_tokens || 0,
    content,
    attachments.map((item) => `${item.id}:${item.name}:${item.dataUrl?.length || 0}`).join("|"),
    parent?.activeChildId || "",
    parent?.children?.length || 0,
    isGenerating && generatingNodeId === node.id ? "streaming" : "",
  ].join("::");
}

function renderGenerationChrome() {
  renderMenu();
  renderContextBadge();
  els.body.classList.toggle("is-generating", isGenerating);
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)) || pendingChatAttachments.length > 0);
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
  const creator = getRoundAssistant(getPrimaryCreatorId());
  const name = clean(creator?.name) || "AI";
  const avatar = clean(creator?.avatarDataUrl)
    ? `<img src="${escapeHtml(creator.avatarDataUrl)}" alt="${escapeHtml(name)}" />`
    : escapeHtml(name.slice(0, 1) || "AI");
  return `<div class="avatar assistant-avatar">${avatar}</div>`;
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
  const creator = getRoundAssistant(getPrimaryCreatorId());
  const name = clean(creator?.name) || "AI";
  const avatar = clean(creator?.avatarDataUrl)
    ? `<img src="${escapeHtml(creator.avatarDataUrl)}" alt="${escapeHtml(name)}" />`
    : escapeHtml(name.slice(0, 1) || "AI");
  const sealedClass = getCreatorSourceTemplateId(creator?.id) ? " sealed-chat-avatar" : "";
  const sealedBClass = isSealedBTemplateCreator(creator?.id) ? " sealed-b-chat-avatar" : "";
  return `<div class="chat-avatar assistant-chat-avatar${sealedClass}${sealedBClass}" title="${escapeHtml(name)}">${avatar}</div>`;
}

function renderChatAttachments(attachments = [], options = {}) {
  const items = normalizeChatAttachments(attachments);
  if (!items.length) return "";
  const removable = Boolean(options.removable);
  return `<div class="chat-attachments${removable ? " is-pending" : ""}">${items.map((item) => `
    <figure class="chat-attachment ${item.kind === "image" ? "is-image" : "is-file"}">
      ${item.kind === "image"
        ? `<img src="${escapeHtml(item.dataUrl)}" alt="${escapeHtml(item.name)}" />`
        : `<span class="chat-attachment-file-icon">${item.textExcerpt ? "文" : "档"}</span>`}
      <figcaption>${escapeHtml(item.name)}</figcaption>
      ${removable ? `<button type="button" data-command="remove-chat-image" data-attachment-id="${escapeHtml(item.id)}" aria-label="移除附件">×</button>` : ""}
    </figure>
  `).join("")}</div>`;
}

function renderMessage(node) {
  const content = getMessageContent(node);
  const attachments = normalizeChatAttachments(node.attachments);
  const version = getAssistantVersion(node);
  const usage = version?.usage?.total_tokens ? ` · ${formatK(version.usage.total_tokens)} tok` : "";
  const meta = `${content.length}字 · ${formatTime(version?.createdAt || node.createdAt)}${usage}`;
  const isUser = node.role === "user";
  const versionIndex = node.role === "assistant" ? Math.max(0, node.versions.findIndex((item) => item.id === node.activeVersionId)) + 1 : 1;
  const failedClass = node.role === "assistant" && /^请求失败[:：]/.test(clean(content)) ? " failed" : "";
  const versionSwitcher = node.role === "assistant" && node.versions.length > 1
    ? `<div class="switcher" role="group" aria-label="版本切换">
        <button type="button" class="switcher__btn" data-command="prev-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""} aria-label="上一版本"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_left</span></button>
        <span class="switcher__index">${versionIndex}/${node.versions.length}</span>
        <button type="button" class="switcher__btn" data-command="next-version" data-node-id="${node.id}" ${node.versions.length < 2 ? "disabled" : ""} aria-label="下一版本"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_right</span></button>
      </div>`
    : "";
  const branchSwitcher = renderBranchSwitcher(node);
  const switcher = [versionSwitcher, branchSwitcher].filter(Boolean).join("");
  const isStreamingThisNode = isGenerating && generatingNodeId === node.id;
  const loadingContent = isStreamingThisNode && !content;
  const bubbleContent = [
    attachments.length ? renderChatAttachments(attachments) : "",
    loadingContent
      ? `<span class="message-content message-loading-dots" aria-label="正在生成"><i></i><i></i><i></i></span>`
      : renderChatContent(node, content, isStreamingThisNode),
    isStreamingThisNode ? '<span class="stream-caret"></span>' : "",
  ].join("");
  return `
    <article class="chat-row ${isUser ? "is-user" : "is-assistant"}${failedClass}" data-node-id="${node.id}">
      ${renderChatAvatar(node.role)}
      <div class="chat-main">
        <div class="chat-bubble" data-command="toggle-menu" data-node-id="${node.id}">${bubbleContent}</div>
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
  return `<div class="switcher switcher--branch" role="group" aria-label="分支切换">
    <button type="button" class="switcher__btn" data-command="prev-branch" data-node-id="${node.id}" aria-label="上一分支"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_left</span></button>
    <span class="switcher__index">${index}/${parent.children.length}</span>
    <button type="button" class="switcher__btn" data-command="next-branch" data-node-id="${node.id}" aria-label="下一分支"><span class="md-icon md-icon--sz-20" aria-hidden="true">chevron_right</span></button>
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
  const isWriter = isWriterProseMessage(message);
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

function renderSettingsPage() {
  const meta = settingsPageMeta[activeSettingsPage] || settingsPageMeta.home;
  if (els.settingsPanel) els.settingsPanel.dataset.settingsPage = activeSettingsPage;
  if (els.settingsPanelTitle) els.settingsPanelTitle.textContent = meta.title;
  if (els.settingsPanelSubtitle) els.settingsPanelSubtitle.textContent = meta.subtitle;
  if (els.settingsBack) els.settingsBack.hidden = activeSettingsPage === "home";
  els.settingsViews.forEach((view) => {
    view.hidden = view.dataset.settingsView !== activeSettingsPage;
  });
}

function renderProviderSwitcher(api = apiSettings()) {
  if (!els.providerSwitcher) return;
  els.providerSwitcher.innerHTML = api.providers.map((provider) => `
    <button class="${provider.id === api.currentProviderId ? "selected" : ""}" type="button" data-command="select-provider" data-provider-id="${escapeHtml(provider.id)}">
      <span>${escapeHtml(provider.name || "未命名提供方")}</span>
    </button>
  `).join("");
}

function openSettingsPage(page) {
  if (!settingsPageMeta[page]) return;
  activeSettingsPage = page;
  if (page !== "creators") {
    activeCreatorDetailId = null;
    activeCreatorRecordId = null;
    activeCreatorMemoryId = null;
  }
  settingsModelPickerOpen = false;
  renderSettingsPage();
}

function stepLayoutValue(key, delta) {
  const input = els.layoutInputs.find((item) => item.dataset.layoutKey === key);
  if (!input) return;
  const step = Number(input.step) || 1;
  const next = readLayoutInputValue(input, sessionSettings().layout[key]) + step * delta;
  input.value = next;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function renderSettings() {
  const api = apiSettings();
  const defaults = globalModelDefaults();
  const s = sessionSettings();
  const provider = activeApiProvider(api);
  const appearance = sessionAppearance();
  if (els.systemPrompt && document.activeElement !== els.systemPrompt) els.systemPrompt.value = "";
  if (els.providerSelect) {
    els.providerSelect.innerHTML = api.providers
      .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
      .join("");
    els.providerSelect.value = api.currentProviderId;
  }
  renderProviderSwitcher(api);
  if (els.providerName && document.activeElement !== els.providerName) els.providerName.value = provider?.name || "";
  if (document.activeElement !== els.baseUrl) els.baseUrl.value = api.baseUrl;
  if (document.activeElement !== els.apiKey) els.apiKey.value = api.apiKey;
  if (document.activeElement !== els.modelInput) els.modelInput.value = defaults.model;
  if (els.contextTokenBudget && document.activeElement !== els.contextTokenBudget) {
    els.contextTokenBudget.value = Number(api.contextTokenBudget) || 200000;
  }
  if (els.userNameInput && document.activeElement !== els.userNameInput) els.userNameInput.value = clean(appearance.userName) || "我";
  renderAvatarPreview(els.userAvatarPreview, appearance.userAvatarDataUrl, clean(appearance.userName) || "我");
  renderBackgroundPreview(els.sessionBackgroundPreview, appearance.backgroundDataUrl);
  if (document.activeElement !== els.contextCount) els.contextCount.value = defaults.contextCount;
  if (document.activeElement !== els.maxTokens) els.maxTokens.value = defaults.maxTokens;
  els.temperature.value = defaults.temperature;
  els.temperatureLabel.textContent = Number(defaults.temperature).toFixed(2);
  els.unlimitedContext.checked = defaults.unlimitedContext;
  els.stream.checked = defaults.stream;
  els.layoutInputs.forEach((input) => {
    const key = input.dataset.layoutKey;
    if (document.activeElement !== input) input.value = s.layout[key];
  });
  els.layoutValues.forEach((value) => {
    const key = value.dataset.layoutValue;
    value.textContent = formatLayoutValue(key, s.layout[key]);
  });
  renderSettingsModelPicker();
  renderCreatorsPage();
  renderSettingsPage();
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

function getCreatorUsageSummary(creatorId) {
  const primarySessions = state.sessions.filter((session) => session.creatorId === creatorId);
  const roundtableSessions = state.sessions.filter((session) => (
    session.creatorId !== creatorId
    && Array.isArray(session.roundtable?.selectedIds)
    && session.roundtable.selectedIds.includes(creatorId)
  ));
  const records = [
    ...getCreatorParticipationRecords(state.creatorParticipationRecords, creatorId, { limit: 500 }),
    ...(state.councilParticipationRecords?.filter((record) => record?.councilId === creatorId) || []),
  ];
  return {
    primarySessions,
    roundtableSessions,
    records,
  };
}

function openCreatorDetail(creatorId) {
  if (!getCreatorIdentity(creatorId)) return;
  activeCreatorDetailId = creatorId;
  activeCreatorRecordId = null;
  activeCreatorMemoryId = null;
  if (els.assistantConfigDialog?.open) closeAssistantConfig();
  activeSettingsPage = "creators";
  if (panelManager.getActivePanel() !== "settings") showPanel("settings");
  renderSettingsPage();
  renderCreatorsPage();
}

function closeCreatorDetail() {
  if (activeCreatorRecordId || activeCreatorMemoryId) {
    activeCreatorRecordId = null;
    activeCreatorMemoryId = null;
    renderCreatorsPage();
    return;
  }
  activeCreatorDetailId = null;
  renderCreatorsPage();
}

function queryCreatorMemory(creatorId) {
  const creator = getCreatorIdentity(creatorId);
  if (!creator) return;
  const query = window.prompt("输入要查询的记忆关键词或问题", "");
  if (query === null) return;
  const snippets = getCreatorMemorySnippets(creatorId, query, {
    includeRecent: true,
    limit: 12,
    sessionId: activeSession()?.id,
  });
  creatorMemoryLookupPreviews.set(creatorId, {
    query: clean(query) || "最近记忆",
    snippets,
    updatedAt: Date.now(),
  });
  activeCreatorDetailId = creatorId;
  renderCreatorsPage();
  showToast(snippets.length ? `召回 ${snippets.length} 条记忆` : "没有召回到相关记忆");
}

function clearCreatorMemoryLookup(creatorId) {
  creatorMemoryLookupPreviews.delete(creatorId);
  renderCreatorsPage();
}

function renderCreatorMemorySnapshotItem(creatorId, item, options = {}) {
  const canDelete = options.canDelete !== false;
  const canOpen = options.canOpen !== false;
  return `
    <article class="creator-memory-snapshot">
      <time>${escapeHtml(formatTime(item.createdAt))}</time>
      <p>${escapeHtml(clean(item.text).slice(0, Number(options.maxLength) || 260))}</p>
      <div class="creator-inline-actions">
        ${canOpen ? `<button type="button" data-command="open-creator-memory-detail" data-creator-id="${escapeHtml(creatorId)}" data-memory-id="${escapeHtml(item.id)}">查看</button>` : ""}
        ${canDelete ? `<button type="button" data-command="delete-creator-memory-snapshot" data-creator-id="${escapeHtml(creatorId)}" data-memory-id="${escapeHtml(item.id)}">删除这条记忆</button>` : ""}
      </div>
    </article>
  `;
}

function renderCreatorRecordItem(record, options = {}) {
  const session = state.sessions.find((item) => item.id === record.sessionId);
  const canDelete = options.canDelete !== false;
  const canOpen = options.canOpen !== false;
  return `
    <article class="creator-memory-snapshot">
      <time>${escapeHtml(formatTime(record.updatedAt || record.createdAt))}</time>
      <p>${escapeHtml(`${session ? titleForSession(session) : "未知圆桌"}｜${clean(record.topic) || "无主题"}｜${formatTime(record.createdAt)}`)}</p>
      <div class="creator-inline-actions">
        ${canOpen ? `<button type="button" data-command="open-creator-record-detail" data-record-id="${escapeHtml(record.id)}">查看</button>` : ""}
        ${canDelete ? `<button type="button" data-command="delete-creator-record" data-record-id="${escapeHtml(record.id)}">删除这条记录</button>` : ""}
      </div>
    </article>
  `;
}

function openCreatorRecordDetail(recordId) {
  const id = clean(recordId);
  const record = (state.creatorParticipationRecords || []).find((item) => item?.id === id && !item.deleted);
  if (!record) return;
  activeCreatorDetailId = record.creatorId;
  activeCreatorRecordId = id;
  activeCreatorMemoryId = null;
  activeSettingsPage = "creators";
  if (panelManager.getActivePanel() !== "settings") showPanel("settings");
  renderCreatorsPage();
}

function openCreatorMemoryDetail(creatorId, memoryId) {
  const creator = getCreatorIdentity(creatorId);
  const id = clean(memoryId);
  const item = normalizeAssistantMemories(creator?.memory?.compressedSnapshots).find((memory) => memory.id === id);
  if (!creator || !item) return;
  activeCreatorDetailId = creator.id;
  activeCreatorMemoryId = id;
  activeCreatorRecordId = null;
  activeSettingsPage = "creators";
  if (panelManager.getActivePanel() !== "settings") showPanel("settings");
  renderCreatorsPage();
}

function renderCreatorLookupPreview(creatorId) {
  const preview = creatorMemoryLookupPreviews.get(creatorId);
  if (!preview) return "";
  const rows = preview.snippets?.length
    ? preview.snippets.map((item) => `
      <article class="creator-memory-snapshot lookup">
        <time>${escapeHtml(item.type)} · ${escapeHtml(formatTime(item.createdAt))}</time>
        <p>${escapeHtml(clean(item.text).slice(0, 360))}</p>
      </article>
    `).join("")
    : `<p class="muted">没有召回到相关记忆。</p>`;
  return `
    <section class="creator-detail-section">
      <div class="creator-detail-section-head">
        <strong>记忆召回预览</strong>
        <button type="button" data-command="clear-creator-memory-lookup" data-creator-id="${escapeHtml(creatorId)}">清除预览</button>
      </div>
      <p class="muted">查询：${escapeHtml(preview.query || "最近记忆")} · ${escapeHtml(formatTime(preview.updatedAt))}</p>
      ${rows}
    </section>
  `;
}

function renderCreatorDetailPage(creator) {
  const currentCreatorId = getPrimaryCreatorId();
  const usage = getCreatorUsageSummary(creator.id);
  const isCurrent = creator.id === currentCreatorId;
  const avatar = clean(creator.avatarDataUrl)
    ? `<img src="${escapeHtml(creator.avatarDataUrl)}" alt="${escapeHtml(creator.name || "创作者")}" />`
    : escapeHtml((creator.name || "创").slice(0, 1));
  const model = clean(creator.modelConfig?.model) || sessionSettings().model || "未选模型";
  const provider = clean(creator.modelConfig?.providerId) || apiSettings().currentProviderId || "默认提供方";
  const memorySnapshots = normalizeAssistantMemories(creator.memory?.compressedSnapshots).reverse();
  const creatorRecords = getCreatorParticipationRecords(state.creatorParticipationRecords, creator.id, { limit: 80 }).reverse();
  const activeMemory = activeCreatorMemoryId
    ? memorySnapshots.find((item) => item.id === activeCreatorMemoryId)
    : null;
  if (activeMemory) {
    return `
      <div class="creator-detail-page">
        <div class="creator-detail-head">
          <button type="button" data-command="back-creators-list">← ${escapeHtml(creator.name || "创作者")}</button>
          <span>记忆库</span>
        </div>
        <section class="creator-detail-section long-record">
          <div class="creator-detail-section-head">
            <strong>${escapeHtml(clean(creator.memory?.displayName) || `${creator.name || "创作者"}记忆`)}</strong>
            <button type="button" data-command="delete-creator-memory-snapshot" data-creator-id="${escapeHtml(creator.id)}" data-memory-id="${escapeHtml(activeMemory.id)}">删除这条记忆</button>
          </div>
          <time>${escapeHtml(formatTime(activeMemory.createdAt))}</time>
          <pre>${escapeHtml(clean(activeMemory.text) || "空记忆")}</pre>
        </section>
      </div>
    `;
  }
  const activeRecord = activeCreatorRecordId
    ? creatorRecords.find((record) => record.id === activeCreatorRecordId)
    : null;
  if (activeRecord) {
    const session = state.sessions.find((item) => item.id === activeRecord.sessionId);
    return `
      <div class="creator-detail-page">
        <div class="creator-detail-head">
          <button type="button" data-command="back-creators-list">← ${escapeHtml(creator.name || "创作者")}</button>
          <span>参会记录</span>
        </div>
        <section class="creator-detail-section long-record">
          <div class="creator-detail-section-head">
            <strong>${escapeHtml(session ? titleForSession(session) : "未知圆桌")}</strong>
            <button type="button" data-command="delete-creator-record" data-record-id="${escapeHtml(activeRecord.id)}">删除这条记录</button>
          </div>
          <p class="muted">${escapeHtml(clean(activeRecord.topic) || "无主题")} · ${escapeHtml(formatTime(activeRecord.createdAt))}</p>
          <pre>${escapeHtml(clean(activeRecord.content || activeRecord.summary) || "空记录")}</pre>
        </section>
      </div>
    `;
  }
  const sessionRows = usage.primarySessions.length
    ? usage.primarySessions.map((session) => `
      <div class="creator-subitem">
        <span>${escapeHtml(titleForSession(session))}</span>
        <button type="button" data-command="switch-session" data-session-id="${escapeHtml(session.id)}">打开</button>
      </div>
    `).join("")
    : `<p class="muted">还没有主会话。</p>`;
  const roundtableRows = usage.roundtableSessions.length
    ? usage.roundtableSessions.map((session) => `
      <div class="creator-subitem">
        <span>${escapeHtml(titleForSession(session))}</span>
        <button type="button" data-command="open-creator-roundtable" data-session-id="${escapeHtml(session.id)}">打开</button>
        <button type="button" data-command="remove-creator-from-roundtable" data-session-id="${escapeHtml(session.id)}" data-creator-id="${escapeHtml(creator.id)}">移除</button>
      </div>
    `).join("")
    : `<p class="muted">还没有加入其他圆桌。</p>`;
  return `
    <div class="creator-detail-page">
      <div class="creator-detail-head">
        <button type="button" data-command="back-creators-list">← 创作者们</button>
        <span>${escapeHtml(isCurrent ? "当前主创" : usage.primarySessions.length ? "主创" : "议员")}</span>
      </div>
      <section class="creator-detail-hero">
        <span class="creator-card-avatar large">${avatar}</span>
        <div>
          <h3>${escapeHtml(creator.name || "未命名创作者")}</h3>
          <p>${escapeHtml(provider)} · ${escapeHtml(model)} · 上下文 ${escapeHtml(String(Number(creator.modelConfig?.contextTokenBudget) || apiSettings().contextTokenBudget || 200000))}</p>
          <p>${escapeHtml(clean(creator.memory?.displayName) || `${creator.name || "创作者"}记忆`)} · ${memorySnapshots.length} 条压缩记忆 · ${creatorRecords.length} 条参会记录</p>
        </div>
      </section>
      <div class="creator-card-actions detail-actions">
        <button type="button" data-command="open-creator-config" data-creator-id="${escapeHtml(creator.id)}">设置</button>
        <button type="button" data-command="open-creator-private-session" data-creator-id="${escapeHtml(creator.id)}">${isCurrent ? "打开会话" : "私聊"}</button>
        <button type="button" data-command="query-creator-memory" data-creator-id="${escapeHtml(creator.id)}">查询记忆</button>
        <button type="button" data-command="export-creator-package" data-creator-id="${escapeHtml(creator.id)}">导出</button>
        <button type="button" data-command="clear-creator-records" data-creator-id="${escapeHtml(creator.id)}">清记录</button>
        <button type="button" data-command="delete-creator-identity" data-creator-id="${escapeHtml(creator.id)}" ${isCurrent ? "disabled" : ""}>删除</button>
      </div>
      ${renderCreatorLookupPreview(creator.id)}
      <section class="creator-detail-section">
        <div class="creator-detail-section-head">
          <strong>压缩记忆</strong>
          <button type="button" data-command="rename-creator-memory" data-creator-id="${escapeHtml(creator.id)}">记忆库改名</button>
        </div>
        ${memorySnapshots.length ? memorySnapshots.map((item) => renderCreatorMemorySnapshotItem(creator.id, item, { maxLength: 420 })).join("") : `<p class="muted">还没有压缩记忆。</p>`}
      </section>
      <section class="creator-detail-section">
        <div class="creator-detail-section-head">
          <strong>参会记录</strong>
          <button type="button" data-command="query-creator-memory" data-creator-id="${escapeHtml(creator.id)}">按问题召回</button>
        </div>
        ${creatorRecords.length ? creatorRecords.map((record) => renderCreatorRecordItem(record, { maxLength: 360 })).join("") : `<p class="muted">还没有参会记录。</p>`}
      </section>
      <section class="creator-detail-section">
        <strong>主会话</strong>
        ${sessionRows}
      </section>
      <section class="creator-detail-section">
        <strong>所在圆桌</strong>
        ${roundtableRows}
      </section>
    </div>
  `;
}

function renderCreatorsPage() {
  if (!els.creatorsList) return;
  const currentCreatorId = getPrimaryCreatorId();
  if (activeCreatorDetailId) {
    const detailCreator = getCreatorIdentity(activeCreatorDetailId);
    if (detailCreator) {
      els.creatorsList.innerHTML = renderCreatorDetailPage(hydrateCreatorIdentity(detailCreator));
      return;
    }
    activeCreatorDetailId = null;
  }
  const creators = Object.values(creatorsState())
    .map((creator) => hydrateCreatorIdentity(creator))
    .sort((a, b) => {
      if (a.id === currentCreatorId) return -1;
      if (b.id === currentCreatorId) return 1;
      return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
    });
  els.creatorsList.innerHTML = creators.length
    ? creators.map((creator) => {
        const usage = getCreatorUsageSummary(creator.id);
        const isCurrent = creator.id === currentCreatorId;
        const avatar = clean(creator.avatarDataUrl)
          ? `<img src="${escapeHtml(creator.avatarDataUrl)}" alt="${escapeHtml(creator.name || "创作者")}" />`
          : escapeHtml((creator.name || "创").slice(0, 1));
        const model = clean(creator.modelConfig?.model) || sessionSettings().model || "未选模型";
        const templateCode = clean(creator.sealedTemplateCode);
        const badges = [
          isCurrent ? "当前主创" : usage.primarySessions.length ? "主创" : "议员",
          templateCode ? `封装 ${templateCode}` : "",
        ].filter(Boolean);
        const memorySnapshots = normalizeAssistantMemories(creator.memory?.compressedSnapshots);
        const memoryPreview = memorySnapshots.length
          ? memorySnapshots.slice(-3).reverse().map((item) => `
            ${renderCreatorMemorySnapshotItem(creator.id, item, { maxLength: 180 })}
          `).join("")
          : `<p class="muted">还没有压缩记忆。</p>`;
        const creatorRecords = getCreatorParticipationRecords(state.creatorParticipationRecords, creator.id, { limit: 6 }).reverse();
        const recordPreview = creatorRecords.length
          ? creatorRecords.map((record) => renderCreatorRecordItem(record, { maxLength: 150 })).join("")
          : `<p class="muted">还没有参会记录。</p>`;
        const roundtableRows = usage.roundtableSessions.length
          ? usage.roundtableSessions.slice(0, 8).map((session) => `
            <div class="creator-subitem">
              <span>${escapeHtml(titleForSession(session))}</span>
              <button type="button" data-command="open-creator-roundtable" data-session-id="${escapeHtml(session.id)}">打开</button>
              <button type="button" data-command="remove-creator-from-roundtable" data-session-id="${escapeHtml(session.id)}" data-creator-id="${escapeHtml(creator.id)}">移除</button>
            </div>
          `).join("")
          : `<p class="muted">还没有加入其他圆桌。</p>`;
        const sessionRows = usage.primarySessions.length
          ? usage.primarySessions.slice(0, 6).map((session) => `
            <div class="creator-subitem">
              <span>${escapeHtml(titleForSession(session))}</span>
              <button type="button" data-command="switch-session" data-session-id="${escapeHtml(session.id)}">打开</button>
            </div>
          `).join("")
          : `<p class="muted">还没有主会话。</p>`;
        return `
          <article class="creator-card ${isCurrent ? "current" : ""}">
            <button class="creator-card-main" type="button" data-command="open-creator-detail" data-creator-id="${escapeHtml(creator.id)}">
              <span class="creator-card-avatar">${avatar}</span>
              <span class="creator-card-copy">
                <b>${escapeHtml(creator.name || "未命名创作者")}</b>
                <small>${escapeHtml(badges.join(" · "))} · ${escapeHtml(model)}</small>
                <em>${usage.primarySessions.length} 个主会话 · ${usage.roundtableSessions.length} 个圆桌 · ${usage.records.length} 条参会记录</em>
              </span>
            </button>
            <div class="creator-card-actions">
              <button type="button" data-command="open-creator-detail" data-creator-id="${escapeHtml(creator.id)}">详情</button>
              <button type="button" data-command="open-creator-private-session" data-creator-id="${escapeHtml(creator.id)}">${isCurrent ? "打开会话" : "私聊"}</button>
              <button type="button" data-command="query-creator-memory" data-creator-id="${escapeHtml(creator.id)}">查记忆</button>
              <button type="button" data-command="export-creator-package" data-creator-id="${escapeHtml(creator.id)}">导出</button>
              <button type="button" data-command="clear-creator-records" data-creator-id="${escapeHtml(creator.id)}">清记录</button>
              <button type="button" data-command="open-creator-config" data-creator-id="${escapeHtml(creator.id)}">设置</button>
              <button type="button" data-command="delete-creator-identity" data-creator-id="${escapeHtml(creator.id)}" ${isCurrent ? "disabled" : ""}>删除</button>
            </div>
          </article>
        `;
      }).join("")
    : `<p class="muted">还没有创作者。</p>`;
}

function renameCreatorMemory(creatorId) {
  creatorController.renameCreatorMemory(creatorId);
}

function openCreatorRoundtable(sessionId) {
  creatorController.openCreatorRoundtable(sessionId);
}

function removeCreatorFromRoundtable(sessionId, creatorId) {
  creatorController.removeCreatorFromRoundtable(sessionId, creatorId);
}

function clearCreatorRecords(creatorId) {
  creatorController.clearCreatorRecords(creatorId);
}

function deleteCreatorRecord(recordId) {
  if (activeCreatorRecordId === clean(recordId)) activeCreatorRecordId = null;
  creatorController.deleteCreatorRecord(recordId);
}

function deleteCreatorMemorySnapshot(creatorId, memoryId) {
  if (activeCreatorMemoryId === clean(memoryId)) activeCreatorMemoryId = null;
  creatorController.deleteCreatorMemorySnapshot(creatorId, memoryId);
}

function deleteCreatorIdentity(creatorId) {
  creatorController.deleteCreatorIdentity(creatorId);
}

function openCreatorPrivateSession(creatorId) {
  creatorController.openCreatorPrivateSession(creatorId);
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

function renderWorkspacePanel() {
  workspaceController.renderWorkspacePanel();
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

function readLayoutInputValue(input, fallback) {
  const raw = Number(input.value);
  if (!Number.isFinite(raw)) return fallback;
  const min = Number(input.min);
  const max = Number(input.max);
  return clamp(raw, Number.isFinite(min) ? min : -Infinity, Number.isFinite(max) ? max : Infinity);
}

function renderModelPicker() {
  ensureModelPickerUi();
  ensureAssistantModelPickerUi();
  const settings = sessionSettings();
  const api = apiSettings();
  const activeProvider = activeApiProvider(api);
  const models = Array.from(new Set([settings.model, ...(activeProvider?.models || []), ...api.models].filter(Boolean)));
  els.modelSelect.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("");
  els.modelSelect.value = settings.model;
  if (els.modelSelectButton) {
    const runtime = getPrimaryCreatorRuntimeConfig();
    const creator = runtime.creator;
    const creatorName = clean(creator?.name) || "主创";
    const creatorModel = clean(runtime.settings.model) || settings.model || "选择模型";
    const creatorAvatar = clean(creator?.avatarDataUrl)
      ? `<img src="${escapeHtml(creator.avatarDataUrl)}" alt="${escapeHtml(creatorName)}" />`
      : escapeHtml(creatorName.slice(0, 1));
    els.modelSelectButton.innerHTML = `
      <span class="model-select-avatar ${isSealedBTemplateCreator(creator?.id) ? "is-sealed-b" : ""}">${creatorAvatar}</span>
      <span class="model-select-copy">
        <b>${escapeHtml(creatorName)}</b>
        <small>${escapeHtml(creatorModel)}</small>
      </span>
    `;
    els.modelSelectButton.classList.remove("active");
    els.modelSelectButton.setAttribute("aria-expanded", "false");
    els.modelSelectButton.setAttribute("title", `${creatorName} · ${creatorModel}`);
  }
  if (els.modelPickerPanel) {
    els.modelPickerPanel.hidden = !modelPickerOpen;
    els.modelPickerPanel.innerHTML = `
      <div class="model-picker-head">
        <strong>${escapeHtml(activeProvider?.name || "模型配置")}</strong>
        <button type="button" data-model-picker-close aria-label="关闭模型列表">×</button>
      </div>
      <div class="model-provider-strip" aria-label="选择供应商">
        ${api.providers.map((provider) => `
          <button class="${provider.id === api.currentProviderId ? "selected" : ""}" type="button" data-model-provider-option="${escapeHtml(provider.id)}">
            ${escapeHtml(provider.name || "未命名")}
          </button>
        `).join("")}
      </div>
      <div class="model-picker-list">
        ${models.map((model) => `
          <button class="${model === settings.model ? "selected" : ""}" type="button" data-model-option="${escapeHtml(model)}">
            <span>${escapeHtml(model)}</span>
            ${model === settings.model ? "<b>当前</b>" : ""}
          </button>
        `).join("")}
      </div>
    `;
  }
  els.modelDatalist.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
  renderSettingsModelPicker(models);
  renderAssistantModelPicker();
}

function handleComposerModelPickerClick(event) {
  const closeButton = event.target.closest("[data-model-picker-close]");
  if (closeButton) {
    event.preventDefault();
    event.stopPropagation();
    toggleModelPicker(false);
    return;
  }
  const providerOption = event.target.closest("[data-model-provider-option]");
  if (providerOption) {
    event.preventDefault();
    event.stopPropagation();
    switchApiProvider(providerOption.dataset.modelProviderOption);
    modelPickerOpen = true;
    renderModelPicker();
    return;
  }
  const option = event.target.closest("[data-model-option]");
  if (!option) return;
  event.preventDefault();
  event.stopPropagation();
  selectModelFromPicker(option.dataset.modelOption);
}

function captureComposerModelPickerClick(event) {
  if (!modelPickerOpen) return;
  const target = event.target;
  const closeButton = target.closest?.("[data-model-picker-close]");
  const providerOption = target.closest?.("[data-model-provider-option]");
  const option = target.closest?.("[data-model-option]");
  if (!closeButton && !providerOption && !option) return;
  event.preventDefault();
  event.stopPropagation();
  if (closeButton) {
    toggleModelPicker(false);
    return;
  }
  if (providerOption) {
    switchApiProvider(providerOption.dataset.modelProviderOption);
    modelPickerOpen = true;
    renderModelPicker();
    return;
  }
  selectModelFromPicker(option.dataset.modelOption);
}

function renderSettingsModelPicker(models = null) {
  if (!els.settingsModelPicker || !els.settingsModelPickerButton) return;
  const settings = globalModelDefaults();
  const list = models || Array.from(new Set([settings.model, ...apiSettings().models].filter(Boolean)));
  els.settingsModelPickerButton.classList.toggle("active", settingsModelPickerOpen);
  els.settingsModelPickerButton.setAttribute("aria-expanded", String(settingsModelPickerOpen));
  els.settingsModelPicker.hidden = !settingsModelPickerOpen;
  els.settingsModelPicker.innerHTML = list.length
    ? list.map((model) => `
        <button class="${model === settings.model ? "selected" : ""}" type="button" data-command="select-settings-model" data-model="${escapeHtml(model)}">
          <span>${escapeHtml(model)}</span>
          ${model === settings.model ? "<b>当前</b>" : ""}
        </button>
      `).join("")
    : `<p class="muted">还没有模型。先拉取模型列表，或直接手动输入。</p>`;
}

function renderAssistantModelPicker(models = null) {
  ensureAssistantModelPickerUi();
  if (!els.assistantModelPicker || !els.assistantModelPickerButton) return;
  const current = clean(els.assistantModelInput?.value) || sessionSettings().model;
  const providerApi = apiForProvider(els.assistantProviderSelect?.value);
  const items = Array.from(new Set([current, sessionSettings().model, ...providerApi.models].filter(Boolean))).sort();
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

function renderAssistantProviderOptions(selectedId = "") {
  if (!els.assistantProviderSelect) return;
  const api = apiSettings();
  els.assistantProviderSelect.innerHTML = [
    `<option value="">跟随默认提供方</option>`,
    ...api.providers.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`),
  ].join("");
  els.assistantProviderSelect.value = api.providers.some((provider) => provider.id === selectedId) ? selectedId : "";
}

function syncAssistantApiOverrideUi(forceOpen = null) {
  const hasStoredOverride = Boolean(clean(els.assistantBaseUrlInput?.value) || clean(els.assistantApiKeyInput?.value));
  const enabled = typeof forceOpen === "boolean"
    ? forceOpen
    : Boolean(els.assistantApiOverrideEnabledInput?.checked || hasStoredOverride);
  if (els.assistantApiOverrideEnabledInput) {
    els.assistantApiOverrideEnabledInput.checked = enabled;
  }
  if (els.assistantApiOverrideFold) {
    els.assistantApiOverrideFold.hidden = !enabled;
    els.assistantApiOverrideFold.open = enabled && (hasStoredOverride || forceOpen === true);
  }
  [els.assistantBaseUrlInput, els.assistantApiKeyInput].forEach((input) => {
    if (input) input.disabled = !enabled;
  });
}

function toggleModelPicker(force) {
  modelPickerOpen = typeof force === "boolean" ? force : !modelPickerOpen;
  renderModelPicker();
}

function toggleSettingsModelPicker(force) {
  settingsModelPickerOpen = typeof force === "boolean" ? force : !settingsModelPickerOpen;
  renderSettingsModelPicker();
}

function selectModelFromPicker(model) {
  setActiveModel(model);
  modelPickerOpen = false;
  render();
  persistState(state);
}

function selectSettingsModelFromPicker(model) {
  setGlobalDefaultModel(model);
  settingsModelPickerOpen = false;
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
  const draft = [clean(els.input.value), chatAttachmentLabel(pendingChatAttachments)].filter(Boolean).join("\n");
  const info = contextInfo(draft);
  drawContextBadge(els, info, formatK);
}

function renderContextPanel() {
  const info = contextInfo(clean(els.input.value));
  drawContextPanel(els, info, sessionSettings(), escapeHtml, formatK);
}

function rememberProviderModel(providerId, model) {
  const value = clean(model);
  if (!value) return;
  const api = apiSettings();
  const providerApi = providerId ? apiForProvider(providerId) : api;
  const provider = api.providers.find((item) => item.id === providerApi.currentProviderId) || activeApiProvider(api);
  provider.models = Array.from(new Set([value, ...(provider.models || [])].filter(Boolean)));
  syncApiFromProvider(api);
}

function setGlobalDefaultModel(model) {
  const value = clean(model);
  if (!value) return;
  const defaults = globalModelDefaults();
  defaults.model = value;
  rememberProviderModel("", value);
}

function setActiveModel(model) {
  const value = clean(model);
  if (!value) return;
  const session = activeSession();
  const settings = sessionSettings(session);
  const previousModel = clean(settings.model);
  const creator = getCreatorIdentity(getPrimaryCreatorId(session));
  const shouldSyncName = creator && isAutoPrimaryCreatorName(creator, {
    session,
    previousModel,
    nextModel: value,
  });
  settings.model = value;
  if (creator) {
    saveCreatorIdentity({
      ...creator,
      name: shouldSyncName ? value : creator.name,
      modelConfig: {
        ...(creator.modelConfig || {}),
        model: value,
      },
      updatedAt: Date.now(),
    });
  }
  rememberProviderModel("", value);
}

function switchApiProvider(id) {
  const api = apiSettings();
  if (!api.providers.some((provider) => provider.id === id)) return;
  api.currentProviderId = id;
  syncApiFromProvider(api);
  render();
  persistState(state);
}

function updateActiveProviderName() {
  const api = apiSettings();
  const provider = activeApiProvider(api);
  if (!provider || !els.providerName) return;
  provider.name = clean(els.providerName.value) || "未命名提供方";
  renderSettings();
  persistState(state);
}

function renameApiProvider() {
  const api = apiSettings();
  const provider = activeApiProvider(api);
  if (!provider) return;
  const nextName = window.prompt("提供方改名", provider.name || "未命名提供方");
  if (nextName === null) return;
  provider.name = clean(nextName) || "未命名提供方";
  render();
  persistState(state);
  showToast("提供方已改名");
}

function updateActiveProviderCredential(key, value) {
  const api = apiSettings();
  const provider = activeApiProvider(api);
  if (!provider) return;
  provider[key] = value;
  syncApiFromProvider(api);
  persistState(state);
}

function addApiProvider() {
  const api = apiSettings();
  const provider = createApiProvider({
    name: `提供方 ${api.providers.length + 1}`,
    baseUrl: api.baseUrl,
    models: api.models,
  });
  api.providers.push(provider);
  api.currentProviderId = provider.id;
  syncApiFromProvider(api);
  render();
  persistState(state);
  showToast("已新增模型提供方");
}

function deleteApiProvider() {
  const api = apiSettings();
  if (api.providers.length <= 1) return showToast("至少保留一个模型提供方");
  const currentId = api.currentProviderId;
  api.providers = api.providers.filter((provider) => provider.id !== currentId);
  api.currentProviderId = api.providers[0].id;
  syncApiFromProvider(api);
  render();
  persistState(state);
  showToast("已删除模型提供方");
}

async function applyGlobalModelConfigToAllAi() {
  const ok = await showConfirm({
    headline: "全面覆盖模型配置？",
    body: "将统一模型配置覆盖到所有会话、主创和议员。提示词、头像、名字和记忆不会被改动。此操作无法撤销。",
    confirmLabel: "全面覆盖",
    cancelLabel: "取消",
    danger: true,
  });
  if (!ok) return;
  const config = globalModelConfigFromApi(apiSettings());
  state.sessions.forEach((session) => {
    applyGlobalModelConfigToSession(session, config);
    Object.values(session.roundtable?.assistantConfigs || {}).forEach((assistantConfig) => {
      applyGlobalModelConfigToAssistantConfig(assistantConfig, config);
    });
    touchSession(session);
  });
  Object.values(creatorsState()).forEach((creator) => {
    applyGlobalModelConfigToCreator(creator, config);
  });
  render();
  persistState(state);
  showToast("已全面覆盖模型配置，提示词和记忆未改动");
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
  pushDialogHistory();
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
    renderMessages();
    renderGenerationChrome();
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
  renderMessages();
  renderGenerationChrome();
  showToast("已修改用户内容");
}

async function appendUserMessage(text, attachments = []) {
  const session = activeSession();
  const path = activePath(session);
  const parent = path[path.length - 1] || getNode(session.rootId, session);
  const user = createNode("user", parent.id, text);
  const normalizedAttachments = normalizeChatAttachments(attachments);
  if (normalizedAttachments.length) user.attachments = normalizedAttachments;
  appendChild(session, parent, user);
  rememberCreatorMessageNode(user, { session });
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  appendChild(session, user, assistant);
  touchSession(session);
  activeMenuNodeId = null;
  renderMessages();
  renderGenerationChrome();
  await generateIntoAssistant(assistant.id, text, assistant.versions[0].id);
}

async function editUserBranch(nodeId, text) {
  if (isGenerating) return showToast("生成中，请先停止当前生成");
  const session = activeSession();
  const old = getNode(nodeId, session);
  const parent = getNode(old?.parentId, session);
  if (!old || !parent) return;
  activateBranchToNode(parent.id, session);
  const user = createNode("user", parent.id, text);
  appendChild(session, parent, user);
  rememberCreatorMessageNode(user, { session });
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  appendChild(session, user, assistant);
  touchSession(session);
  activeMenuNodeId = null;
  renderMessages();
  renderGenerationChrome();
  await generateIntoAssistant(assistant.id, text, assistant.versions[0].id);
}

async function resendUser(nodeId) {
  if (isGenerating) return showToast("生成中，请先停止当前生成");
  const session = activeSession();
  const user = getNode(nodeId, session);
  if (!user || user.role !== "user") return;
  activateBranchToNode(user.id, session);
  rememberCreatorMessageNode(user, { session });
  const assistant = createNode("assistant", user.id, "");
  assistant.activeVersionId = assistant.versions[0].id;
  appendChild(session, user, assistant);
  touchSession(session);
  activeMenuNodeId = null;
  renderMessages();
  renderGenerationChrome();
  await generateIntoAssistant(assistant.id, user.content, assistant.versions[0].id);
}

async function regenerateAssistant(nodeId) {
  if (isGenerating) return showToast("生成中，请先停止当前生成");
  const session = activeSession();
  const assistant = getNode(nodeId, session);
  const user = getNode(assistant?.parentId, session);
  if (!assistant || assistant.role !== "assistant" || !user) return;
  activateBranchToNode(user.id, session);
  const replacement = createNode("assistant", user.id, "");
  replacement.activeVersionId = replacement.versions[0].id;
  appendChild(session, user, replacement);
  touchSession(session);
  activeMenuNodeId = null;
  renderMessages();
  renderGenerationChrome();
  await generateIntoAssistant(replacement.id, user.role === "user" ? user.content : "", replacement.versions[0].id);
}

async function continueFromAssistant(nodeId) {
  if (isGenerating) return showToast("生成中，请先停止当前生成");
  const session = activeSession();
  const assistant = getNode(nodeId, session);
  if (!assistant || assistant.role !== "assistant") return;
  activateBranchToNode(assistant.id, session);
  const next = createNode("assistant", assistant.id, "");
  next.activeVersionId = next.versions[0].id;
  appendChild(session, assistant, next);
  touchSession(session);
  activeMenuNodeId = null;
  renderMessages();
  renderGenerationChrome();
  await generateIntoAssistant(next.id, "", next.versions[0].id, true);
}

function validateApi(settings = sessionSettings(), api = apiSettings()) {
  if (!clean(api.apiKey)) throw new Error("请先在设置里填写 API Key");
  if (!clean(settings.model)) throw new Error("请先选择或填写模型");
}

async function generateIntoAssistant(nodeId, userText, versionId, continueMode = false) {
  const node = getNode(nodeId);
  const version = node?.versions.find((item) => item.id === versionId);
  if (!node || !version) return;
  isGenerating = true;
  abortController = new AbortController();
  streamRequestId = null;
  generatingNodeId = nodeId;
  activeMenuNodeId = null;
  setAssistantVersionContent(node, version, "");
  version.usage = null;
  renderMessages();
  renderGenerationChrome();
  try {
    validatePrimaryCreatorApi();
    try {
      await ensureAutoCompressNovelMemory(continueMode ? CONTINUE_PROMPT : userText, nodeId);
    } catch (error) {
      if (error.name === "AbortError") throw error;
      showToast(humanizeError(error, "自动压缩失败，已改用现有资料继续"));
    }
    const contextCompression = getAutoContextCompressedInfo(continueMode ? CONTINUE_PROMPT : userText);
    if (contextCompression.compressed) showToast("上下文过长，已自动使用小说资料压缩续写");
    const result = sessionSettings().stream
      ? await callOpenAIStream((partial) => {
          setAssistantVersionContent(node, version, partial);
          renderStreamingNode(nodeId, versionId);
        }, nodeId, continueMode)
      : await callOpenAI(nodeId, continueMode);
    cancelStreamDomUpdate(`main:${nodeId}`);
    const content = clean(result.content);
    if (!content) throw new Error("模型没有返回内容，请检查模型是否支持当前接口或关闭流式输出后重试");
    setAssistantVersionContent(node, version, content);
    version.usage = result.usage || null;
    version.createdAt = Date.now();
    touchSession(activeSession());
  } catch (error) {
    if (error.name !== "AbortError") {
      const message = humanizeError(error, "生成失败");
      version.content = version.content || `请求失败：${message}`;
      version.createdAt = Date.now();
      touchSession(activeSession());
      showToast(message);
    }
  } finally {
    isGenerating = false;
    abortController = null;
    bridgeRequestId = null;
    streamRequestId = null;
    generatingNodeId = null;
    cancelStreamDomUpdate(`main:${nodeId}`);
    renderStreamingNode(nodeId, versionId, { final: true });
    renderGenerationChrome();
    renderContextBadge();
    renderSessions();
    persistState(state);
  }
}

function renderStreamingNode(nodeId, versionId, options = {}) {
  const node = getNode(nodeId);
  const version = node?.versions.find((item) => item.id === versionId);
  const card = els.messages.querySelector(`[data-node-id="${cssEscape(nodeId)}"] .chat-bubble`);
  if (!card || !version) {
    if (node && version) {
      renderMessages();
      renderGenerationChrome();
    } else {
      render();
    }
    return;
  }
  scheduleStreamDomUpdate(`main:${nodeId}`, () => {
    const follow = shouldFollowBottom();
    let contentElement = card.querySelector(".message-content");
    if (!contentElement) {
      contentElement = document.createElement(node.role === "assistant" ? "div" : "span");
      contentElement.className = "message-content";
      card.prepend(contentElement);
    }
    const nextContent = version.content || "";
    if (nextContent) {
      contentElement.classList.remove("message-loading-dots");
      contentElement.classList.toggle("message-markdown", node.role === "assistant");
      if (node.role === "assistant") {
        contentElement.innerHTML = renderAssistantMarkdown(nextContent);
      } else {
        contentElement.textContent = nextContent;
      }
    } else if (!contentElement.classList.contains("message-loading-dots")) {
      contentElement.classList.remove("message-markdown");
      contentElement.classList.add("message-loading-dots");
      contentElement.innerHTML = "<i></i><i></i><i></i>";
    }
    card.querySelector(".stream-caret")?.remove();
    if (!options.final) {
      contentElement.insertAdjacentHTML("afterend", '<span class="stream-caret"></span>');
    }
    const row = card.closest(".chat-row[data-node-id]");
    if (row) row.dataset.renderSignature = getMessageRenderSignature(node);
    if (follow) scrollBottom();
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
  const runtime = getPrimaryCreatorRuntimeConfig();
  return aiClient.generate({
    api: runtime.api,
    settings: runtime.settings,
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
  const runtime = getPrimaryCreatorRuntimeConfig();
  return aiClient.generateStream({
    api: runtime.api,
    settings: runtime.settings,
    messages: requestMessages(assistantNodeId),
    onChunk,
    continueMode,
    continuePrompt: CONTINUE_PROMPT,
  });
}

async function fetchModels() {
  try {
    if (!clean(apiSettings().apiKey)) throw new Error("请先在设置里填写 API Key");
    els.modelStatus.textContent = "正在拉取...";
    const api = apiSettings();
    const defaults = globalModelDefaults();
    const data = await aiClient.fetchModels({ api });
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "模型拉取失败");
    const models = (data.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("没有读取到模型");
    const provider = activeApiProvider(api);
    provider.models = Array.from(new Set([defaults.model, ...models].filter(Boolean)));
    syncApiFromProvider(api);
    if (!defaults.model) defaults.model = models[0];
    els.modelStatus.textContent = `已拉取 ${models.length} 个`;
    settingsModelPickerOpen = true;
    render();
    persistState(state);
  } catch (error) {
    const message = humanizeError(error, "模型拉取失败");
    els.modelStatus.textContent = message;
    showToast(message);
  }
}

async function fetchAssistantModels() {
  if (!assistantConfigTargetId) return;
  try {
    const config = currentAssistantFormConfig();
    const api = apiForAssistantConfig(config);
    if (!clean(api.apiKey)) throw new Error("请先填写此议员或全局 API Key");
    if (els.assistantModelStatus) els.assistantModelStatus.textContent = "正在拉取...";
    if (els.fetchAssistantModels) els.fetchAssistantModels.disabled = true;
    const data = await aiClient.fetchModels({ api });
    if (data.__bridgeStatus >= 400) throw new Error(data.error?.message || "模型拉取失败");
    const models = (data.data || []).map((item) => item.id).filter(Boolean).sort();
    if (!models.length) throw new Error("没有读取到模型");
    const globalApi = apiSettings();
    const providerApi = apiForProvider(config.providerId);
    const provider = globalApi.providers.find((item) => item.id === providerApi.currentProviderId) || activeApiProvider(globalApi);
    provider.models = Array.from(new Set([sessionSettings().model, clean(els.assistantModelInput?.value), ...models].filter(Boolean)));
    syncApiFromProvider(globalApi);
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
  applyGlobalModelConfigToSession(session, globalModelConfigFromApi(apiSettings()));
  ensureSessionCreator(session);
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
  const rt = roundtableState(activeSession());
  rt.enabled = false;
  rt.membersOpen = false;
  rt.materialsOpen = false;
  rt.contextOpen = false;
  activeMenuNodeId = null;
  activeRoundtableMessageId = null;
  closePanels();
  render();
  persistState(state);
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

function removeCreatorIfUnused(creatorId) {
  const id = clean(creatorId);
  if (!id) return false;
  const stillPrimary = state.sessions.some((session) => session.creatorId === id);
  const stillInRoundtable = state.sessions.some((session) => Array.isArray(session.roundtable?.selectedIds) && session.roundtable.selectedIds.includes(id));
  if (stillPrimary || stillInRoundtable) return false;
  delete creatorsState()[id];
  state.councilParticipationRecords = (state.councilParticipationRecords || [])
    .filter((record) => record?.councilId !== id);
  state.creatorParticipationRecords = (state.creatorParticipationRecords || [])
    .filter((record) => record?.creatorId !== id);
  return true;
}

async function deleteSession(sessionId) {
  const target = state.sessions.find((session) => session.id === sessionId);
  if (!target) return;
  const title = titleForSession(target);
  const isLastSession = state.sessions.length <= 1;
  const creatorId = target.creatorId;
  const choice = await askThreeWayDelete({
    title: "删除会话",
    message: isLastSession
      ? `清空最后一个会话「${title}」并新建空会话？`
      : `删除会话「${title}」？`,
    confirmLabel: "确定",
    keepLabel: "删除但保留主创",
  });
  if (choice === "cancel") return;
  const keepCreator = choice === "keep";
  if (state.sessions.length <= 1) {
    const session = createSession();
    ensureSessionCreator(session);
    state.sessions = [session];
    state.activeSessionId = state.sessions[0].id;
    if (!keepCreator) removeCreatorIfUnused(creatorId);
    render();
    persistState(state);
    showToast("会话已清空");
    return;
  }
  state.sessions = state.sessions.filter((session) => session.id !== sessionId);
  if (state.activeSessionId === sessionId) state.activeSessionId = state.sessions[0].id;
  if (!keepCreator) removeCreatorIfUnused(creatorId);
  activeMenuNodeId = null;
  render();
  persistState(state);
  showToast(keepCreator ? "会话已删除，主创已保留" : "会话已删除");
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
    if (!LOCAL_IMAGE_TYPES.has(file.type)) return reject(new Error("请使用 PNG、JPG、WebP 或 ICO 图片"));
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
  workspaceController.updateWorkspacePath();
}

function chooseWorkspaceFiles() {
  workspaceController.chooseWorkspaceFiles();
}

function chooseChatImage() {
  els.chatImageFile?.click();
}

function renderPendingChatAttachments() {
  if (!els.chatAttachmentList) return;
  const attachments = normalizeChatAttachments(pendingChatAttachments);
  els.chatAttachmentList.hidden = !attachments.length;
  els.chatAttachmentList.innerHTML = attachments.length ? renderChatAttachments(attachments, { removable: true }) : "";
  renderContextBadge();
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)) || attachments.length > 0);
  resizeInput();
}

function removeChatImage(id) {
  pendingChatAttachments = pendingChatAttachments.filter((item) => item.id !== id);
  renderPendingChatAttachments();
}

function fileExtension(name = "") {
  const value = clean(name).toLowerCase();
  return value.includes(".") ? value.split(".").pop() : "";
}

function isChatTextFile(file) {
  const ext = fileExtension(file?.name);
  return CHAT_TEXT_EXTENSIONS.has(ext) || clean(file?.type).startsWith("text/");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("图片读取失败")));
    reader.readAsDataURL(file);
  });
}

async function fileToTextExcerpt(file) {
  if (!isChatTextFile(file)) return "";
  if (Number(file.size) > CHAT_TEXT_FILE_MAX_BYTES) {
    return `文件超过 ${Math.round(CHAT_TEXT_FILE_MAX_BYTES / 1024 / 1024)}MB，当前仅附加文件索引，未读取全文。`;
  }
  return clean(await file.text()).slice(0, CHAT_TEXT_EXCERPT_LIMIT);
}

function consumePendingChatAttachments() {
  const attachments = normalizeChatAttachments(pendingChatAttachments);
  pendingChatAttachments = [];
  renderPendingChatAttachments();
  return attachments;
}

function insertAtComposerCursor(text) {
  const input = els.input;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
  const nextCursor = start + text.length;
  input.focus();
  input.setSelectionRange?.(nextCursor, nextCursor);
  resizeInput();
  renderContextBadge();
  els.body.classList.toggle("is-ready", Boolean(clean(input.value)) || pendingChatAttachments.length > 0);
}

async function handleChatImageSelected() {
  const selected = Array.from(els.chatImageFile?.files || []);
  if (!selected.length) return;
  try {
    for (const file of selected) {
      if (pendingChatAttachments.length >= CHAT_ATTACHMENT_LIMIT) {
        showToast(`最多添加 ${CHAT_ATTACHMENT_LIMIT} 个附件`);
        break;
      }
      if (LOCAL_IMAGE_TYPES.has(file.type)) {
        const imageCount = pendingChatAttachments.filter((item) => item.kind === "image" || item.dataUrl).length;
        if (imageCount >= CHAT_IMAGE_LIMIT) {
          showToast(`最多添加 ${CHAT_IMAGE_LIMIT} 张图片`);
          continue;
        }
        if (file.size > CHAT_IMAGE_MAX_BYTES) {
          showToast(`图片过大，请选 ${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)}MB 以内`);
          continue;
        }
        pendingChatAttachments.push({
          id: uid("img"),
          kind: "image",
          name: file.name,
          type: file.type,
          size: file.size,
          dataUrl: await fileToDataUrl(file),
          readable: true,
        });
        continue;
      }
      if (!isChatTextFile(file)) {
        showToast("只支持基础文本文件和 PNG、JPG、WEBP 图片");
        continue;
      }
      const textExcerpt = await fileToTextExcerpt(file);
      pendingChatAttachments.push({
        id: uid("file"),
        kind: "text",
        name: file.name,
        type: file.type || fileExtension(file.name),
        size: file.size,
        textExcerpt,
        readable: Boolean(textExcerpt),
      });
    }
    renderPendingChatAttachments();
    els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)) || pendingChatAttachments.length > 0);
  } catch (error) {
    showToast(humanizeError(error, "附件读取失败"));
  } finally {
    if (els.chatImageFile) els.chatImageFile.value = "";
  }
}

async function handleWorkspaceFilesSelected() {
  await workspaceController.handleWorkspaceFilesSelected();
}

function clearWorkspaceFiles() {
  workspaceController.clearWorkspaceFiles();
}

function removeWorkspaceFile(id) {
  workspaceController.removeWorkspaceFile(id);
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

function exportGlobalBackup() {
  importExportController.exportGlobalBackup();
}

function importGlobalBackup() {
  importExportController.importGlobalBackup();
}

async function handleGlobalBackupImportSelected() {
  await importExportController.handleGlobalBackupImportSelected();
}

function exportCreatorPackage(creatorId) {
  importExportController.exportCreatorPackage(creatorId);
}

function importCreatorPackage() {
  importExportController.importCreatorPackage();
}

function replaceCurrentCreatorPackage() {
  importExportController.replaceCurrentCreatorPackage();
}

async function handleCreatorImportSelected() {
  await importExportController.handleCreatorImportSelected();
}

function exportSessionPackage(sessionId) {
  importExportController.exportSessionPackage(sessionId);
}

function importSessionPackage() {
  importExportController.importSessionPackage();
}

async function handleSessionImportSelected() {
  await importExportController.handleSessionImportSelected();
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
  roundtableController.toggleRoundtable();
}

function setRoundtableEnabled(enabled, toastText = "") {
  roundtableController.setRoundtableEnabled(enabled, toastText);
}

function toggleRoundtableMembers() {
  roundtableController.toggleRoundtableMembers();
}

function toggleRoundtableMaterials() {
  roundtableController.toggleRoundtableMaterials();
}

function toggleRoundtableSessionImport() {
  roundtableController.toggleRoundtableSessionImport();
}

function handleComposerTool() {
  if (roundtableState().enabled) {
    toggleRoundtableMembers();
    return;
  }
  openAssistantConfig(getPrimaryCreatorId(), { mode: "creator" });
}

function openComposerModelConfig() {
  modelPickerOpen = false;
  openAssistantConfig(getPrimaryCreatorId(), { mode: "creator-model" });
}

function getPrimaryCreatorId(session = activeSession()) {
  return ensureSessionCreator(session).id;
}

function syncPrimaryCreatorIntoRoundtable() {
  const rt = roundtableState();
  const primaryId = getPrimaryCreatorId();
  const primary = getRoundAssistant(primaryId);
  if (!primary || primary.id === "writer") return;
  const existingIds = Array.isArray(rt.selectedIds) ? rt.selectedIds : [];
  const nextIds = existingIds.filter((id) => {
    if (!id || id === "writer" || id === primaryId) return false;
    if (id === "plot" || isSealedRoundtableCreatorId(id)) return false;
    return Boolean(getRoundAssistant(id));
  });
  rt.selectedIds = nextIds;
  rt.hiddenAssistantIds = (Array.isArray(rt.hiddenAssistantIds) ? rt.hiddenAssistantIds : [])
    .filter((id) => id !== primaryId);
  rt.speakerOrderIds = getRoundtableSpeakerOrderIds(rt);
}

function isSealedCreatorLocked() {
  return Boolean(clean(getCreatorIdentity(getPrimaryCreatorId())?.sourceTemplateId));
}

function getCreatorSourceTemplateId(creatorId) {
  return clean(getCreatorIdentity(creatorId)?.sourceTemplateId);
}

function isSealedBTemplateCreator(creatorId) {
  return getCreatorSourceTemplateId(creatorId) === "sealed-b";
}

function isCurrentAssistantSealed() {
  return Boolean(clean(getCreatorIdentity(assistantConfigTargetId)?.sourceTemplateId));
}

function getMainSystemPrompt(session = activeSession()) {
  return clean(getCreatorIdentity(getPrimaryCreatorId(session))?.prompt) || clean(sessionSettings(session).systemPrompt);
}

function getPrimaryCreatorRuntimeConfig() {
  const settings = sessionSettings();
  const creator = getRoundAssistant(getPrimaryCreatorId());
  const maxTokens = Number(creator?.maxTokens);
  const temperature = Number(creator?.temperature);
  const providerId = clean(creator?.providerId);
  return {
    creator,
    settings: {
      ...settings,
      systemPrompt: getMainSystemPrompt(),
      model: clean(creator?.model) || settings.model,
      maxTokens: maxTokens > 0 ? maxTokens : settings.maxTokens,
      temperature: Number.isFinite(temperature) ? temperature : settings.temperature,
    },
    api: apiForProvider(providerId),
  };
}

function validatePrimaryCreatorApi() {
  const runtime = getPrimaryCreatorRuntimeConfig();
  validateApi(runtime.settings, runtime.api);
  return runtime;
}

function renderSealedCreatorOverlay() {
  if (!els.sealedCreatorList) return;
  const currentCreator = getCreatorIdentity(getPrimaryCreatorId());
  const lockedId = clean(currentCreator?.sourceTemplateId);
  const lockedBase = SEALED_ROUNDTABLE_CREATORS.find((base) => base.id === lockedId);
  const statusText = lockedBase ? "LOCKED" : "SELECT";
  els.sealedCreatorList.innerHTML = SEALED_ROUNDTABLE_CREATORS.map((base) => {
    const assistant = lockedId === base.id ? getRoundAssistant(getPrimaryCreatorId()) : base;
    const locked = lockedId === base.id;
    const avatar = clean(assistant.avatarDataUrl || base.avatarUrl)
      ? `<img src="${escapeHtml(assistant.avatarDataUrl || base.avatarUrl)}" alt="${escapeHtml(assistant.name || base.name)}" />`
      : escapeHtml((assistant.name || base.name).slice(0, 1));
    return `
      <button class="sealed-creator-card ${base.id} ${locked ? "locked" : ""}" type="button" data-command="select-sealed-creator" data-sealed-id="${escapeHtml(base.id)}" title="${escapeHtml(assistant.name || base.name)}" aria-label="${escapeHtml(locked ? `${assistant.name || base.name}已套用` : `套用${assistant.name || base.name}`)}">
        <span class="sealed-creator-avatar">${avatar}</span>
        <span class="sealed-creator-name">${escapeHtml(assistant.name || base.name)}</span>
      </button>
    `;
  }).join("") + `<div class="sealed-creator-status">${escapeHtml(statusText)}</div>`;
}

function pushSealedCreatorHistory() {
  if (history.state?.tbirdSealedCreatorOpen) {
    sealedCreatorHistoryOpen = true;
    return;
  }
  try {
    history.pushState({ ...(history.state || {}), tbirdSealedCreatorOpen: true }, "");
    sealedCreatorHistoryOpen = true;
  } catch {
    sealedCreatorHistoryOpen = false;
  }
}

function openSealedCreatorOverlay() {
  if (!els.sealedCreatorOverlay) return;
  if (roundtableState().membersOpen) closeRoundtableMembers({ fromHistory: true });
  modelPickerOpen = false;
  renderModelPicker();
  renderSealedCreatorOverlay();
  sealedCreatorOverlayOpen = true;
  els.sealedCreatorOverlay.hidden = false;
  els.body?.classList.add("sealed-creator-active");
  pushSealedCreatorHistory();
}

function closeSealedCreatorOverlay(options = {}) {
  if (!els.sealedCreatorOverlay || !sealedCreatorOverlayOpen) return;
  sealedCreatorOverlayOpen = false;
  els.sealedCreatorOverlay.hidden = true;
  els.body?.classList.remove("sealed-creator-active");
  if (options.fromButton && sealedCreatorHistoryOpen && history.state?.tbirdSealedCreatorOpen) {
    closingSealedCreatorFromButton = true;
    sealedCreatorHistoryOpen = false;
    history.back();
  }
}

function selectSealedCreator(id) {
  const base = getSealedRoundtableCreatorBase(id);
  if (!base) return;
  const session = activeSession();
  const currentCreator = getRoundAssistant(getPrimaryCreatorId());
  const previous = getCreatorIdentity(getPrimaryCreatorId());
  const previousTemplateId = clean(previous?.sourceTemplateId);
  const shouldSyncName = !previous || isAutoPrimaryCreatorName(previous, {
    session,
    extraNames: [currentCreator?.name],
  });
  const creator = saveCreatorIdentity({
    ...previous,
    name: shouldSyncName ? base.name : (clean(previous?.name) || base.name),
    avatarDataUrl: previousTemplateId && previousTemplateId !== base.id ? base.avatarUrl : (clean(previous?.avatarDataUrl) || base.avatarUrl),
    sourceTemplateId: base.id,
    sealedTemplateCode: base.id === "sealed-t" ? "T" : base.id === "sealed-b" ? "B" : "",
    prompt: clean(base.prompt),
    modelConfig: {
      ...(previous?.modelConfig || {}),
      providerId: clean(previous?.modelConfig?.providerId) || clean(currentCreator?.providerId),
      model: clean(previous?.modelConfig?.model) || clean(currentCreator?.model) || clean(sessionSettings().model),
    },
  });
  session.creatorId = creator.id;
  touchSession(session);
  persistState(state);
  render();
  renderSealedCreatorOverlay();
  closeSealedCreatorOverlay({ fromButton: true });
  openAssistantConfig(creator.id, { mode: "creator" });
  showToast(`已套用封装模板 ${creator.name || base.name}`);
}

function handleAssistantAvatarSecretTap() {
  if (assistantConfigMode !== "creator") return;
  sealedCreatorTapCount += 1;
  clearTimeout(sealedCreatorTapTimer);
  sealedCreatorTapTimer = setTimeout(() => {
    sealedCreatorTapCount = 0;
  }, 1600);
  if (sealedCreatorTapCount < 5) return;
  sealedCreatorTapCount = 0;
  clearTimeout(sealedCreatorTapTimer);
  if (els.assistantConfigDialog?.open) {
    closeAssistantConfig();
    requestAnimationFrame(() => openSealedCreatorOverlay());
    return;
  }
  openSealedCreatorOverlay();
}

function handleModelSelectSecretTap(event) {
  if (roundtableState().enabled) return;
  sealedCreatorTapCount += 1;
  clearTimeout(sealedCreatorTapTimer);
  sealedCreatorTapTimer = setTimeout(() => {
    sealedCreatorTapCount = 0;
  }, 1600);
  if (sealedCreatorTapCount < 5) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  sealedCreatorTapCount = 0;
  clearTimeout(sealedCreatorTapTimer);
  openSealedCreatorOverlay();
}

function toggleRoundtableRound() {
  if (roundtableGenerating) {
    stopRoundtableGeneration();
    return;
  }
  return startRoundtableRound();
}

function toggleRoundtableContextDock() {
  roundtableController.toggleRoundtableContextDock();
}

function toggleRoundtableMember(id) {
  const rt = roundtableState();
  if (!getRoundAssistantBase(id) || id === "writer") return;
  if (id === getPrimaryCreatorId()) return showToast("主创固定在本会话");
  const index = rt.selectedIds.indexOf(id);
  if (index >= 0) {
    rt.selectedIds.splice(index, 1);
    rt.speakerOrderIds = getRoundtableSpeakerOrderIds(rt).filter((item) => item !== id);
  } else {
    rt.selectedIds.push(id);
    rt.speakerOrderIds = getRoundtableSpeakerOrderIds(rt);
  }
  touchSession(activeSession());
  render();
  persistState(state);
}

function togglePrimaryRoundtableSpeaking() {
  const rt = roundtableState();
  rt.primaryInRound = rt.primaryInRound === false;
  rt.speakerOrderIds = getRoundtableSpeakerOrderIds(rt);
  touchSession(activeSession());
  render();
  persistState(state);
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

function discardPendingCustomAssistantDraft(options = {}) {
  const id = pendingCustomAssistantDraftId;
  if (!id) return false;
  const rt = roundtableState();
  const existed = rt.customAssistants.some((assistant) => assistant?.id === id);
  rt.customAssistants = rt.customAssistants.filter((assistant) => assistant?.id !== id);
  rt.selectedIds = rt.selectedIds.filter((selectedId) => selectedId !== id);
  delete rt.assistantConfigs[id];
  delete creatorsState()[id];
  pendingCustomAssistantDraftId = null;
  if (existed && options.render !== false) render();
  return existed;
}

function createCustomRoundAssistant() {
  discardPendingCustomAssistantDraft({ render: false });
  const rt = roundtableState();
  const creator = createCreatorIdentity({
    name: `新议员${rt.selectedIds.length + 1}`,
    prompt: createRandomTraitPrompt(),
    modelConfig: {
      providerId: apiSettings().currentProviderId,
      baseUrl: apiSettings().baseUrl,
      model: sessionSettings().model,
      temperature: sessionSettings().temperature,
      maxTokens: sessionSettings().maxTokens,
      contextTokenBudget: apiSettings().contextTokenBudget,
    },
  });
  saveCreatorIdentity(creator);
  rt.selectedIds.push(creator.id);
  pendingCustomAssistantDraftId = creator.id;
  render();
  openAssistantConfig(creator.id);
}

function uniqueRoundAssistantName(name, sourceTitle = "") {
  const baseName = clean(name) || "新议员";
  const existing = new Set(getRoundAssistantBases().map((assistant) => clean(assistant.name)));
  if (!existing.has(baseName)) return baseName;
  const title = clean(sourceTitle).slice(0, 8);
  let candidate = title ? `${baseName} · ${title}` : `${baseName} 副本`;
  let count = 2;
  while (existing.has(candidate)) {
    candidate = `${baseName} ${count}`;
    count += 1;
  }
  return candidate;
}

async function callCompressionModel(prompt, settingsOverride, apiOverride) {
  const settings = {
    ...settingsOverride,
    temperature: 0.25,
    maxTokens: Math.max(1000, Number(settingsOverride?.maxTokens) || 0),
  };
  validateApi(settings, apiOverride);
  return aiClient.generateText({
    api: apiOverride,
    settings,
    messages: [{ role: "user", content: prompt }],
  });
}

async function importRoundtableMemberFromSession(sessionId, memberId) {
  await roundtableController.importMemberFromSession(sessionId, memberId);
}

function openAssistantConfig(id, options = {}) {
  const assistant = getRoundAssistant(id);
  const config = getRoundAssistantConfig(id);
  if (!assistant || !config) return;
  const rawConfig = roundtableState().assistantConfigs?.[id] || {};
  assistantConfigTargetId = id;
  const sealedCreator = Boolean(clean(getCreatorIdentity(id)?.sourceTemplateId)) || isSealedRoundtableCreatorId(id);
  assistantConfigMode = options.mode || (sealedCreator ? "creator" : "member");
  assistantModelPickerOpen = false;
  ensureAssistantModelPickerUi();
  const isCreatorMode = assistantConfigMode === "creator" || assistantConfigMode === "creator-model";
  const isCreatorModelMode = assistantConfigMode === "creator-model";
  els.assistantConfigDialog?.classList.toggle("sealed-assistant-config", sealedCreator);
  els.assistantConfigDialog?.classList.toggle("sealed-b-config", isSealedBTemplateCreator(id) || id === "sealed-b");
  els.assistantConfigDialog?.classList.toggle("assistant-model-config-only", isCreatorModelMode);
  els.assistantConfigTitle.textContent = isCreatorModelMode
    ? `${assistant.name || "主创"}模型配置`
    : (sealedCreator ? "封装主创" : (isCreatorMode ? "主创设置" : `${assistant.name}设置`));
  if (els.assistantSourceLabel) {
    const imported = rawConfig.importedFrom;
    const sourceTitle = clean(imported?.sessionTitle);
    els.assistantSourceLabel.hidden = sealedCreator || !sourceTitle;
    els.assistantSourceLabel.textContent = sealedCreator ? "" : (sourceTitle ? `来自：${sourceTitle}` : "");
  }
  const rawName = clean(rawConfig.name);
  const creatorUsesFallbackName = isCreatorMode && !sealedCreator && (!rawName || isLegacyDefaultCreatorName(rawName));
  els.assistantNameInput.value = creatorUsesFallbackName ? "" : config.name;
  els.assistantNameInput.placeholder = sealedCreator ? assistant.name : (isCreatorMode ? clean(assistant.model) || getCreatorFallbackName() : "");
  if (els.assistantAvatarPreview) {
    els.assistantAvatarPreview.dataset.avatarDataUrl = config.avatarDataUrl || "";
    renderAvatarPreview(els.assistantAvatarPreview, config.avatarDataUrl, config.name || assistant.name || "议");
  }
  renderAssistantProviderOptions(config.providerId);
  if (els.assistantModelFold) {
    els.assistantModelFold.hidden = assistantConfigMode === "creator" && !sealedCreator;
    els.assistantModelFold.open = isCreatorModelMode || els.assistantModelFold.open;
  }
  if (els.assistantBaseUrlInput) els.assistantBaseUrlInput.value = config.apiBaseUrl || "";
  if (els.assistantApiKeyInput) els.assistantApiKeyInput.value = config.apiKey || "";
  syncAssistantApiOverrideUi(Boolean(clean(config.apiBaseUrl) || clean(config.apiKey)));
  els.assistantModelInput.value = config.model;
  if (els.assistantNetworkEnabledInput) els.assistantNetworkEnabledInput.checked = Boolean(config.networkEnabled);
  if (els.assistantMaxTokensInput) els.assistantMaxTokensInput.value = config.maxTokens || "";
  if (els.assistantContextTokenBudgetInput) els.assistantContextTokenBudgetInput.value = config.contextTokenBudget || "";
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
  if (els.assistantActivationProfileInput) els.assistantActivationProfileInput.value = sealedCreator ? "" : (config.activationProfile || "");
  if (els.assistantActivationStatus) els.assistantActivationStatus.textContent = config.activationProfile ? "已激活" : "未激活";
  if (els.activateAssistant) els.activateAssistant.textContent = config.activationProfile ? "重新激活" : "激活";
  if (els.assistantModelStatus) els.assistantModelStatus.textContent = config.model ? `当前：${config.model}` : "未拉取";
  renderAssistantModelPicker();
  renderAssistantParticipationRecords(id);
  renderAssistantPrivateChat(id);
  if (els.assistantPrivateChatInput) els.assistantPrivateChatInput.value = "";
  if (els.assistantPrivateFold) {
    els.assistantPrivateFold.hidden = isCreatorMode || id === "writer" || sealedCreator;
  }
  if (els.assistantActivationFold) els.assistantActivationFold.hidden = sealedCreator || isCreatorModelMode;
  if (els.sealedActivationBar) els.sealedActivationBar.hidden = true;
  if (els.assistantParticipationFold) els.assistantParticipationFold.hidden = isCreatorModelMode;
  if (els.assistantPromptFold) els.assistantPromptFold.hidden = sealedCreator || isCreatorModelMode;
  if (els.assistantMaterialsFold) els.assistantMaterialsFold.hidden = sealedCreator || isCreatorModelMode;
  if (els.sealedPromptBar) els.sealedPromptBar.hidden = true;
  const creatorPrompt = isCreatorMode && !sealedCreator
    ? clean(sessionSettings().systemPrompt) || config.prompt
    : config.prompt;
  els.assistantPromptInput.value = sealedCreator ? "" : creatorPrompt;
  if (els.importAssistant) els.importAssistant.hidden = sealedCreator || isCreatorModelMode;
  if (els.exportAssistant) els.exportAssistant.hidden = sealedCreator || isCreatorModelMode;
  if (els.resetAssistantConfig) els.resetAssistantConfig.hidden = sealedCreator || isCreatorModelMode;
  if (els.deleteAssistant) {
    els.deleteAssistant.hidden = id === "writer" || sealedCreator || isCreatorModelMode;
  }
  els.assistantConfigDialog.showModal();
  pushDialogHistory();
  requestAnimationFrame(() => els.assistantNameInput?.focus());
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
  const creatorMode = assistantConfigMode === "creator";
  const modelOnlyMode = assistantConfigMode === "creator-model";
  const sealedCreator = Boolean(clean(getCreatorIdentity(assistantConfigTargetId)?.sourceTemplateId)) || isSealedRoundtableCreatorId(assistantConfigTargetId);
  const followsMainModel = creatorMode && !sealedCreator;
  return {
    name: modelOnlyMode ? clean(previous.name) : clean(els.assistantNameInput.value),
    providerId: followsMainModel ? "" : clean(els.assistantProviderSelect?.value),
    apiBaseUrl: "",
    apiKey: "",
    model: followsMainModel ? "" : clean(els.assistantModelInput.value),
    networkEnabled: Boolean(els.assistantNetworkEnabledInput?.checked),
    maxTokens: followsMainModel ? 0 : Number(els.assistantMaxTokensInput?.value) || 0,
    contextTokenBudget: followsMainModel ? 0 : Number(els.assistantContextTokenBudgetInput?.value) || 0,
    temperature: followsMainModel ? sessionSettings().temperature : Number(els.assistantTemperatureInput.value),
    contextOptions: modelOnlyMode ? normalizeRoundtableContextOptions(previous.contextOptions) : currentAssistantContextOptions(),
    activationProfile: (sealedCreator || modelOnlyMode) ? clean(previous.activationProfile) : clean(els.assistantActivationProfileInput?.value),
    memories: normalizeAssistantMemories(previous.memories),
    privateMessages: assistantController.normalizePrivateMessages(previous.privateMessages),
    avatarDataUrl: modelOnlyMode ? clean(previous.avatarDataUrl) : clean(els.assistantAvatarPreview?.dataset.avatarDataUrl),
    prompt: (sealedCreator || modelOnlyMode) ? clean(previous.prompt) : clean(els.assistantPromptInput.value),
  };
}

async function exportAssistantConfig() {
  if (!assistantConfigTargetId) return;
  const config = currentAssistantFormConfig();
  if (!config.name && !config.prompt) return showToast("议员配置为空");
  const payload = assistantController.createPersonaPayload(config, assistantConfigTargetId);
  await copyText(assistantController.formatPersonaText(payload));
  showToast("议员人格文本已复制");
}

async function importAssistantConfig() {
  if (!assistantConfigTargetId) return;
  assistantImportMode = "single";
  try {
    const text = await navigator.clipboard?.readText?.();
    if (clean(text).includes("TBIRD-COUNCIL-PERSONA") || clean(text).includes("--- TBIRD JSON ---")) {
      applyAssistantImportConfig(assistantController.parsePersonaText(text));
      saveAssistantConfigFromForm({ close: false, toast: false, render: true });
      showToast("已从剪贴板覆盖当前主创人格");
      return;
    }
  } catch {}
  els.assistantImportFile?.click();
}

async function handleAssistantImportSelected() {
  const file = els.assistantImportFile?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (assistantImportMode === "bundle") {
      importRoundtablePersonasFromText(text);
    } else {
      applyAssistantImportConfig(assistantController.parsePersonaText(text));
      saveAssistantConfigFromForm({ close: false, toast: false, render: true });
      showToast("已覆盖当前主创人格");
    }
  } catch (error) {
    showToast(humanizeError(error, "议员配置导入失败"));
  } finally {
    assistantImportMode = "single";
    if (els.assistantImportFile) els.assistantImportFile.value = "";
  }
}

function applyAssistantImportConfig(config) {
  const name = clean(config?.name);
  const prompt = clean(config?.prompt);
  if (!name || !prompt) throw new Error("议员人格缺少名称或角色提示词");
  els.assistantNameInput.value = name;
  renderAssistantProviderOptions(clean(config.providerId));
  if (els.assistantBaseUrlInput) els.assistantBaseUrlInput.value = "";
  if (els.assistantApiKeyInput) els.assistantApiKeyInput.value = "";
  syncAssistantApiOverrideUi(false);
  els.assistantModelInput.value = clean(config.model);
  if (els.assistantNetworkEnabledInput) els.assistantNetworkEnabledInput.checked = Boolean(config.networkEnabled);
  if (els.assistantMaxTokensInput) els.assistantMaxTokensInput.value = Number(config.maxTokens) || "";
  if (els.assistantContextTokenBudgetInput) els.assistantContextTokenBudgetInput.value = Number(config.contextTokenBudget) || "";
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
}

function renderAssistantParticipationRecords(assistantId) {
  if (!els.assistantParticipationList) return;
  if (!assistantId || assistantId === "writer") {
    els.assistantParticipationList.innerHTML = `<p class="assistant-participation-empty">写手是输出通道，不保存议员参会记录。</p>`;
    return;
  }
  const records = getCouncilParticipationRecords(state.councilParticipationRecords, assistantId, { limit: 80 }).reverse();
  const creatorRecords = getCreatorParticipationRecords(state.creatorParticipationRecords, assistantId, { limit: 80 }).reverse();
  const combinedRecords = creatorRecords.length ? creatorRecords.map((record) => ({
    ...record,
    councilId: record.creatorId,
    speakerName: record.displayName,
    content: record.content || record.summary,
  })) : records;
  if (!combinedRecords.length) {
    els.assistantParticipationList.innerHTML = `<p class="assistant-participation-empty">还没有参会记录。</p>`;
    return;
  }
  const groups = [];
  combinedRecords.forEach((record) => {
    let group = groups.find((item) => item.sessionId === record.sessionId);
    if (!group) {
      const session = state.sessions.find((item) => item.id === record.sessionId);
      group = {
        sessionId: record.sessionId,
        title: session ? titleForSession(session) : "未知会话",
        records: [],
      };
      groups.push(group);
    }
    group.records.push(record);
  });
  els.assistantParticipationList.innerHTML = groups.map((group) => {
    const latest = group.records[0];
    const roleLabel = getRoundtableRoleLabel(latest.roleState, "议员");
    const topics = [...new Set(group.records.map((record) => clean(record.topic)).filter(Boolean))].slice(0, 3);
    return `
      <article class="assistant-participation-item compact">
        <div>
          <b>${escapeHtml(group.title)}</b>
          <span>${escapeHtml(roleLabel)} · ${group.records.length} 条 · ${escapeHtml(formatTime(latest.createdAt))}</span>
          ${topics.length ? `<small>${escapeHtml(topics.join(" / "))}</small>` : ""}
        </div>
        <button type="button" data-command="open-creator-detail" data-creator-id="${escapeHtml(assistantId)}">去创作者们查看</button>
      </article>
    `;
  }).join("");
}

function getAssistantPrivateMessages(assistantId) {
  const config = roundtableState().assistantConfigs?.[assistantId] || {};
  return assistantController.normalizePrivateMessages(config.privateMessages);
}

function renderAssistantPrivateChat(assistantId = assistantConfigTargetId) {
  if (!els.assistantPrivateChatList) return;
  const creator = getCreatorIdentity(assistantId);
  if (creator && assistantId !== getPrimaryCreatorId()) {
    els.assistantPrivateChatList.innerHTML = `
      <p class="assistant-participation-empty">这个议员是完整创作者身份。私聊会打开他的独立会话，并保留自己的上下文。</p>
      <button type="button" data-command="open-creator-private-session" data-creator-id="${escapeHtml(assistantId)}">打开独立私聊</button>
    `;
    if (els.assistantPrivateChatInput) els.assistantPrivateChatInput.disabled = true;
    if (els.sendAssistantPrivateChat) els.sendAssistantPrivateChat.disabled = true;
    return;
  }
  if (!assistantId || assistantId === "writer") {
    els.assistantPrivateChatList.innerHTML = `<p class="assistant-participation-empty">写手是输出通道，不开启议员私聊。</p>`;
    if (els.assistantPrivateChatInput) els.assistantPrivateChatInput.disabled = true;
    if (els.sendAssistantPrivateChat) els.sendAssistantPrivateChat.disabled = true;
    return;
  }
  if (els.assistantPrivateChatInput) els.assistantPrivateChatInput.disabled = false;
  if (els.sendAssistantPrivateChat) els.sendAssistantPrivateChat.disabled = false;
  const messages = getAssistantPrivateMessages(assistantId);
  if (!messages.length) {
    els.assistantPrivateChatList.innerHTML = `<p class="assistant-participation-empty">还没有私聊。</p>`;
    return;
  }
  els.assistantPrivateChatList.innerHTML = messages.slice(-12).map((message) => `
    <article class="assistant-private-message ${message.role}">
      <b>${message.role === "user" ? escapeHtml(clean(sessionAppearance().userName) || "我") : "议员"}</b>
      <p>${escapeHtml(message.content)}</p>
      <time>${escapeHtml(formatTime(message.createdAt))}</time>
    </article>
  `).join("");
  els.assistantPrivateChatList.scrollTop = els.assistantPrivateChatList.scrollHeight;
}

async function sendAssistantPrivateChat() {
  const id = assistantConfigTargetId;
  const base = getRoundAssistantBase(id);
  if (!id || id === "writer" || !base) return;
  const userText = clean(els.assistantPrivateChatInput?.value);
  if (!userText) return;
  if (isGenerating || roundtableGenerating || materialGenerating || assistantActivating) return showToast("已有生成任务进行中");
  const formConfig = currentAssistantFormConfig();
  const assistant = {
    ...base,
    ...formConfig,
    id: base.id,
    role: base.role,
    name: clean(formConfig.name) || base.name,
    prompt: clean(formConfig.prompt) || base.prompt,
  };
  const settings = {
    ...sessionSettings(),
    model: formConfig.model || sessionSettings().model,
    maxTokens: Math.min(Number(formConfig.maxTokens) || sessionSettings().maxTokens || 700, 900),
    temperature: Number.isFinite(Number(formConfig.temperature)) ? Number(formConfig.temperature) : sessionSettings().temperature,
  };
  const api = apiForAssistantConfig(formConfig);
  try {
    validateApi(settings, api);
    const rt = roundtableState();
    rt.assistantConfigs[id] ||= {};
    const history = assistantController.normalizePrivateMessages(rt.assistantConfigs[id].privateMessages);
    rt.assistantConfigs[id].privateMessages = [...history, { id: uid("private"), role: "user", content: userText, createdAt: Date.now() }].slice(-40);
    if (els.assistantPrivateChatInput) els.assistantPrivateChatInput.value = "";
    renderAssistantPrivateChat(id);
    if (els.sendAssistantPrivateChat) els.sendAssistantPrivateChat.disabled = true;
    const reply = await callOpenAITextWithSettings(assistantController.buildPrivateChatMessages(assistant, formConfig, userText, history), settings, api);
    const cleanReply = clean(reply);
    if (cleanReply) {
      rt.assistantConfigs[id].privateMessages = assistantController.normalizePrivateMessages([
        ...rt.assistantConfigs[id].privateMessages,
        { id: uid("private"), role: "assistant", content: cleanReply, createdAt: Date.now() },
      ]);
    }
    touchSession(activeSession());
    renderAssistantPrivateChat(id);
    persistState(state);
  } catch (error) {
    showToast(humanizeError(error, "议员私聊失败"));
  } finally {
    if (els.sendAssistantPrivateChat && id === assistantConfigTargetId) els.sendAssistantPrivateChat.disabled = false;
  }
}

function getAssistantPersonaPayload(id) {
  const assistant = getRoundAssistant(id);
  if (!assistant || assistant.id === "writer") return null;
  const config = createRoundAssistantConfigView(assistant, sessionSettings().temperature);
  if (!config) return null;
  return assistantController.createPersonaPayload(config, id);
}

async function exportRoundtablePersonas() {
  const rt = roundtableState();
  const ids = (rt.selectedIds?.length ? rt.selectedIds : getRoundAssistantBases().map((assistant) => assistant.id))
    .filter((id) => id && id !== "writer");
  const personas = ids.map(getAssistantPersonaPayload).filter(Boolean);
  if (!personas.length) return showToast("没有可导出的入席议员");
  await copyText(assistantController.formatPersonaBundleText(personas));
  showToast(`已复制 ${personas.length} 位议员人格`);
}

async function importRoundtablePersonas() {
  assistantImportMode = "bundle";
  try {
    const text = await navigator.clipboard?.readText?.();
    if (clean(text).includes("TBIRD-COUNCIL-PERSONA") || clean(text).includes("--- TBIRD JSON ---")) {
      importRoundtablePersonasFromText(text);
      return;
    }
  } catch {}
  els.assistantImportFile?.click();
}

function importRoundtablePersonasFromText(text) {
  const configs = assistantController.parsePersonaConfigs(text);
  if (!configs.length) throw new Error("没有找到可导入的议员人格");
  const rt = roundtableState();
  let imported = 0;
  configs.forEach((config) => {
    const seat = assistantController.createImportedPersonaSeat(config, apiSettings());
    if (!seat) return;
    const { creator, assistantConfig } = seat;
    saveCreatorIdentity(creator);
    rt.assistantConfigs[creator.id] = assistantConfig;
    if (!rt.selectedIds.includes(creator.id)) rt.selectedIds.push(creator.id);
    imported += 1;
  });
  if (!imported) throw new Error("议员人格缺少名称或角色提示词");
  touchSession(activeSession());
  render();
  persistState(state);
  showToast(`已导入 ${imported} 位议员人格`);
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
  assistantConfigMode = "member";
  assistantModelPickerOpen = false;
  if (els.assistantConfigDialog?.open) els.assistantConfigDialog.close();
}

function buildAssistantActivationMessages(base, config) {
  const options = normalizeRoundtableContextOptions(config.contextOptions);
  return assistantController.buildActivationMessages(base, config, {
    defaultDiscussionCount: DEFAULT_ROUNDTABLE_CONTEXT.discussionCount,
    roundtableMessages: roundtableState().messages,
    manuscriptExcerpt: options.includeManuscript ? getRoundtablePromptExcerpt(Math.min(options.excerptMax || 520, 900)) : "",
    novelMaterials: buildRoundtableNovelMaterials(options),
    mainChatText: getNovelSourceText(),
  });
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
  const api = apiForAssistantConfig(config);
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
  const formConfig = currentAssistantFormConfig();
  const creatorIdentity = getCreatorIdentity(id);
  if (creatorIdentity) {
    const wasPendingDraft = pendingCustomAssistantDraftId === id;
    const creatorMode = assistantConfigMode === "creator";
    const modelOnlyMode = assistantConfigMode === "creator-model";
    const nextCreatorDraft = assistantController.buildCreatorIdentitySave({
      creatorIdentity,
      base,
      formConfig,
      mode: assistantConfigMode,
      apiContextTokenBudget: apiSettings().contextTokenBudget,
    });
    const nextCreator = saveCreatorIdentity(nextCreatorDraft);
    if (activeSession().creatorId === id) {
      const settings = sessionSettings();
      settings.systemPrompt = clean(nextCreator.prompt) || settings.systemPrompt;
      settings.model = clean(nextCreator.modelConfig?.model) || settings.model;
      settings.maxTokens = Number(nextCreator.modelConfig?.maxTokens) || settings.maxTokens;
      settings.temperature = Number.isFinite(Number(nextCreator.modelConfig?.temperature))
        ? Number(nextCreator.modelConfig.temperature)
        : settings.temperature;
    }
    if (modelOnlyMode && clean(nextCreator.modelConfig?.model)) {
      rememberProviderModel(nextCreator.modelConfig.providerId, nextCreator.modelConfig.model);
    }
    if (wasPendingDraft) {
      pendingCustomAssistantDraftId = null;
      rememberCreatorRoundtableJoin(id, {
        summary: `${nextCreator.name || "新议员"}在当前圆桌被创建并入席。`,
      });
    }
    if (options.close !== false) closeAssistantConfig();
    touchSession(activeSession());
    if (options.render !== false) render();
    persistState(state);
    if (options.toast !== false) showToast(creatorMode ? "主创设置已保存" : "创作者设置已保存");
    return true;
  }
  const rt = roundtableState();
  const creatorMode = assistantConfigMode === "creator";
  const modelOnlyMode = assistantConfigMode === "creator-model";
  const sealedCreator = Boolean(clean(getCreatorIdentity(id)?.sourceTemplateId)) || isSealedRoundtableCreatorId(id);
  const previous = rt.assistantConfigs[id] || {};
  const assistantSave = assistantController.buildLegacyAssistantSave({
    id,
    base,
    previous,
    formConfig,
    mode: assistantConfigMode,
    sealedCreator,
  });
  rt.assistantConfigs[id] = assistantSave.config;
  if (creatorMode && !sealedCreator && !modelOnlyMode) {
    const prompt = clean(rt.assistantConfigs[id].prompt);
    if (prompt) sessionSettings().systemPrompt = prompt;
  }
  if (assistantSave.modelToRemember) {
    rememberProviderModel(rt.assistantConfigs[id].providerId, assistantSave.modelToRemember);
  }
  if (pendingCustomAssistantDraftId === id) {
    pendingCustomAssistantDraftId = null;
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
  if (id === getPrimaryCreatorId()) return showToast("主创不能在这里重置");
  if (getCreatorIdentity(id)) return showToast("创作者身份不能在这里重置");
  if (isSealedRoundtableCreatorId(id)) return showToast("封装主创已锁定，不能重置");
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
  if (id === getPrimaryCreatorId()) return showToast("主创不能从当前会话删除");
  if (isSealedRoundtableCreatorId(id)) return showToast("封装主创已锁定，不能删除");
  const rt = roundtableState();
  if (getCreatorIdentity(id)) {
    rt.selectedIds = rt.selectedIds.filter((selectedId) => selectedId !== id);
  } else if (isCustomRoundAssistant(id)) {
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
    messageType: message.messageType,
  });
}

async function addAssistantRoundtableReply(assistant, content, extra = {}, instruction = "") {
  const text = cleanRoundtableAssistantOutput(assistant, content);
  const message = addRoundtableMessage(assistant.id, assistant.name, text, extra);
  rememberCouncilParticipation(assistant, message, instruction);
  await rememberActivatedAssistantTurn(assistant, text, instruction);
  return message;
}

function updateRoundtableMessageContent(message, content, options = {}) {
  if (!message) return;
  updateRoundtableMessageText(message, content);
  touchSession(activeSession());
  if (options.render === false) {
    renderStreamingRoundtableMessage(message);
    return;
  }
  render();
}

function renderStreamingRoundtableMessage(message) {
  if (!message) return;
  const selector = `[data-round-id="${cssEscape(message.id)}"]`;
  const target = isWriterProseMessage(message)
    ? els.roundtableDiscussion?.querySelector(`${selector} .roundtable-writer-snippet`)
    : els.roundtableDiscussion?.querySelector(`.roundtable-speech${selector}`);
  if (!target) return;
  scheduleStreamDomUpdate(`round:${message.id}`, () => {
    target.innerHTML = `${renderRoundtableRichText(message.content || "")}${message.streaming ? '<span class="stream-caret"></span>' : ""}`;
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
  updateRoundtableMessageContent(message, cleanText, { render: false });
  rememberCouncilParticipation(assistant, message, instruction);
  await rememberActivatedAssistantTurn(assistant, cleanText, instruction);
  return { message, text: cleanText };
}

function appendAssistantMemory(assistantId, text, source = "roundtable") {
  const memory = clean(text);
  if (!assistantId || !memory) return;
  const memoryCreatorId = getCreatorMemoryRootId(assistantId);
  const creator = getCreatorIdentity(memoryCreatorId);
  if (creator) {
    const snapshots = normalizeAssistantMemories(creator.memory?.compressedSnapshots);
    snapshots.push({
      id: uid("memory"),
      text: memory,
      source,
      createdAt: Date.now(),
    });
    saveCreatorIdentity({
      ...creator,
      memory: {
        ...(creator.memory || {}),
        compressedSnapshots: snapshots.slice(-GENERATIVE_AGENT_MEMORY_LIMIT),
      },
      updatedAt: Date.now(),
    });
    touchSession(activeSession());
    persistState(state);
    return;
  }
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
  if (isWriterProseMessage(message)) {
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
      message.content = cleanRoundtableAssistantOutput(assistant, partial);
      renderStreamingRoundtableMessage(message);
    });
    cancelStreamDomUpdate(`round:${message.id}`);
    message.streaming = false;
    message.content = cleanRoundtableAssistantOutput(assistant, text);
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
  const orderIds = getRoundtableSpeakerOrderIds(rt);
  const index = orderIds.indexOf(id);
  if (index < 0) return;
  const next = clamp(index + delta, 0, orderIds.length - 1);
  if (next === index) return;
  const [item] = orderIds.splice(index, 1);
  orderIds.splice(next, 0, item);
  rt.speakerOrderIds = orderIds;
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
  return handleRoundtableUserWithAttachments(text, []);
}

async function handleRoundtableUserWithAttachments(text, attachments = []) {
  const normalizedAttachments = normalizeChatAttachments(attachments);
  const visibleText = buildUserTextWithAttachments(text, normalizedAttachments);
  addRoundtableMessage("user", clean(sessionAppearance().userName) || "我", visibleText, {
    attachments: normalizedAttachments,
  });
  const mentions = parseRoundtableMentions(text);
  if (!mentions.length && clean(text).includes("@")) {
    showToast("只能 @ 已安排顺序的议员，或 @写手");
  }
  if (!mentions.length) {
    persistState(state);
    return;
  }
  const payload = buildRoundtableInstructionPayload(text, normalizedAttachments);
  const writer = mentions.find((assistant) => assistant.id === "writer");
  if (writer) return generateRoundtableWriter(payload);
  return generateMentionedRoundtableAssistants(mentions, payload);
}

async function generateMentionedRoundtableAssistants(assistants, userText) {
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  if (!assistants.some((assistant) => assistant.id !== "writer")) return;
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    await roundtableController.generateMentionedAssistants(assistants, userText, () => roundtableShouldStop);
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
  if (!roundtableController.prepareRoundProgress()) return;
  await runRoundtableProgress();
}

async function resumeRoundtableRound() {
  const rt = roundtableState();
  if (roundtableGenerating || isGenerating || materialGenerating) return showToast("已有生成任务进行中");
  if (!rt.roundProgress?.ids?.length) return showToast("没有可继续的圆桌轮次");
  await runRoundtableProgress();
}

async function runRoundtableProgress() {
  if (!roundtableState().roundProgress?.ids?.length) return;
  roundtableShouldStop = false;
  roundtableGenerating = true;
  render();
  try {
    await roundtableController.runProgress(() => roundtableShouldStop);
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
    await writerController.generateWriterText(userText, () => roundtableShouldStop);
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
  await roundtableController.runAssistantMentionFollowUps(originAssistant, originText, options, () => roundtableShouldStop);
}

async function callRoundtableAssistant(assistant, instruction, onChunk = null) {
  return roundtableController.callAssistant(assistant, instruction, onChunk);
}

function buildRoundtableMessages(assistant, instruction) {
  return roundtableController.buildMessages(assistant, instruction);
}

const handleCommand = createCommandRegistry({
  "open-history": () => showPanel("history"),
  "open-keyboard-help": () => openKeyboardHelp(),
  "open-settings": () => openSettingsPanel(),
  "settings-home": () => openSettingsPage("home"),
  "open-settings-page": (target) => openSettingsPage(target.dataset.settingsPage),
  "back-creators-list": () => closeCreatorDetail(),
  "open-creator-detail": (target) => openCreatorDetail(target.dataset.creatorId),
  "open-creator-config": (target) => openAssistantConfig(target.dataset.creatorId, { mode: target.dataset.creatorId === getPrimaryCreatorId() ? "creator" : "member" }),
  "open-creator-private-session": (target) => openCreatorPrivateSession(target.dataset.creatorId),
  "open-creator-roundtable": (target) => openCreatorRoundtable(target.dataset.sessionId),
  "remove-creator-from-roundtable": (target) => removeCreatorFromRoundtable(target.dataset.sessionId, target.dataset.creatorId),
  "rename-creator-memory": (target) => renameCreatorMemory(target.dataset.creatorId),
  "query-creator-memory": (target) => queryCreatorMemory(target.dataset.creatorId),
  "clear-creator-memory-lookup": (target) => clearCreatorMemoryLookup(target.dataset.creatorId),
  "clear-creator-records": (target) => clearCreatorRecords(target.dataset.creatorId),
  "open-creator-record-detail": (target) => openCreatorRecordDetail(target.dataset.recordId),
  "open-creator-memory-detail": (target) => openCreatorMemoryDetail(target.dataset.creatorId, target.dataset.memoryId),
  "delete-creator-record": (target) => deleteCreatorRecord(target.dataset.recordId),
  "delete-creator-memory-snapshot": (target) => deleteCreatorMemorySnapshot(target.dataset.creatorId, target.dataset.memoryId),
  "delete-creator-identity": (target) => deleteCreatorIdentity(target.dataset.creatorId),
  "export-creator-package": (target) => exportCreatorPackage(target.dataset.creatorId),
  "import-creator-package": () => importCreatorPackage(),
  "replace-current-creator-package": () => replaceCurrentCreatorPackage(),
  "export-global-backup": () => exportGlobalBackup(),
  "import-global-backup": () => importGlobalBackup(),
  "open-model-config": () => openComposerModelConfig(),
  "open-workspace": () => showPanel("workspace"),
  "open-novel": () => showPanel("novel"),
  "open-context": () => showPanel("context"),
  "composer-tool": () => handleComposerTool(),
  "open-roundtable": () => toggleRoundtable(),
  "toggle-roundtable": () => toggleRoundtable(),
  "toggle-roundtable-members": () => toggleRoundtableMembers(),
  "toggle-roundtable-materials": () => toggleRoundtableMaterials(),
  "toggle-roundtable-session-import": () => toggleRoundtableSessionImport(),
  "toggle-roundtable-context": () => toggleRoundtableContextDock(),
  "toggle-roundtable-paper": () => toggleRoundtablePaperReveal(),
  "roundtable-writer-settings": () => openAssistantConfig("writer"),
  "roundtable-add-assistant": () => createCustomRoundAssistant(),
  "roundtable-import-personas": () => importRoundtablePersonas(),
  "roundtable-export-personas": () => exportRoundtablePersonas(),
  "roundtable-import-session-member": (target) => importRoundtableMemberFromSession(target.dataset.sessionId, target.dataset.memberId),
  "send-assistant-private-chat": () => sendAssistantPrivateChat(),
  "roundtable-toggle-primary-speaking": () => togglePrimaryRoundtableSpeaking(),
  "roundtable-toggle-member": (target) => toggleRoundtableMember(target.dataset.memberId),
  "roundtable-member-up": (target) => moveRoundtableMember(target.dataset.memberId, -1),
  "roundtable-member-down": (target) => moveRoundtableMember(target.dataset.memberId, 1),
  "roundtable-edit-assistant": (target) => openAssistantConfig(target.dataset.memberId),
  "select-sealed-creator": (target) => selectSealedCreator(target.dataset.sealedId),
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
  "export-session": (target) => exportSessionPackage(target.dataset.sessionId),
  "import-session-package": () => importSessionPackage(),
  "delete-session": (target) => deleteSession(target.dataset.sessionId),
  "fetch-models": () => fetchModels(),
  "select-provider": (target) => switchApiProvider(target.dataset.providerId),
  "add-provider": () => addApiProvider(),
  "rename-provider": () => renameApiProvider(),
  "delete-provider": () => deleteApiProvider(),
  "apply-global-model-config": () => applyGlobalModelConfigToAllAi(),
  "choose-workspace-files": () => chooseWorkspaceFiles(),
  "clear-workspace-files": () => clearWorkspaceFiles(),
  "choose-chat-image": () => chooseChatImage(),
  "remove-chat-image": (target) => removeChatImage(target.dataset.attachmentId),
  "remove-workspace-file": (target) => removeWorkspaceFile(target.dataset.fileId),
  "toggle-model-picker": () => toggleModelPicker(),
  "select-model": (target) => selectModelFromPicker(target.dataset.model),
  "toggle-settings-model-picker": () => toggleSettingsModelPicker(),
  "select-settings-model": (target) => selectSettingsModelFromPicker(target.dataset.model),
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
  "layout-step": (target) => stepLayoutValue(target.dataset.layoutKey, Number(target.dataset.step) || 0),
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
    renderMenu();
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

els.menu?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-command]");
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const command = target.dataset.command;
  els.menu.hidden = true;
  els.menu.innerHTML = "";
  activeMenuNodeId = null;
  activeRoundtableMessageId = null;
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
  const attachments = normalizeChatAttachments(pendingChatAttachments);
  if (!text && !attachments.length) return;
  if (roundtableState().enabled) {
    const sendingAttachments = consumePendingChatAttachments();
    els.input.value = "";
    resizeInput();
    renderContextBadge();
    await handleRoundtableUserWithAttachments(text, sendingAttachments);
    return;
  }
  try {
    validatePrimaryCreatorApi();
    const sendingAttachments = consumePendingChatAttachments();
    els.input.value = "";
    resizeInput();
    renderContextBadge();
    els.body.classList.toggle("is-ready", false);
    await appendUserMessage(text, sendingAttachments);
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

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function handleMessagePinchStart(event) {
  if (roundtableState().enabled || event.touches.length !== 2 || getOpenDialog() || panelManager.getActivePanel()) return;
  roundtableGesture.pinchActive = true;
  roundtableGesture.pinchTriggered = false;
  roundtableGesture.pinchStartDistance = touchDistance(event.touches);
}

function handleMessagePinchMove(event) {
  if (!roundtableGesture.pinchActive || roundtableGesture.pinchTriggered || event.touches.length !== 2) return;
  const currentDistance = touchDistance(event.touches);
  const startDistance = roundtableGesture.pinchStartDistance || currentDistance;
  const inwardDelta = startDistance - currentDistance;
  if (startDistance > 120 && inwardDelta > 44 && currentDistance / startDistance < 0.78) {
    roundtableGesture.pinchTriggered = true;
    setRoundtableEnabled(true, "已通过双指手势进入圆桌");
  }
}

function resetMessagePinchGesture() {
  roundtableGesture.pinchActive = false;
  roundtableGesture.pinchTriggered = false;
  roundtableGesture.pinchStartDistance = 0;
}

function lockRootScroll() {
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  if (document.documentElement.scrollTop) document.documentElement.scrollTop = 0;
  if (document.body?.scrollTop) document.body.scrollTop = 0;
}

function handlePaperDoubleTap(event) {
  if (!roundtableState().enabled || event.target.closest?.("button, input, textarea, select, summary")) return;
  const now = Date.now();
  if (now - roundtableGesture.paperLastTapAt < 320) {
    roundtableGesture.paperLastTapAt = 0;
    setRoundtableEnabled(false, "已回到交流模式");
    event.preventDefault?.();
    return;
  }
  roundtableGesture.paperLastTapAt = now;
}

function handlePaperTouchStart(event) {
  if (!roundtableState().enabled || event.touches.length !== 1) return;
  const touch = event.touches[0];
  roundtableGesture.paperTouchStartX = touch.clientX;
  roundtableGesture.paperTouchStartY = touch.clientY;
}

function handlePaperTouchEnd(event) {
  if (!roundtableState().enabled || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const moved = Math.hypot(touch.clientX - roundtableGesture.paperTouchStartX, touch.clientY - roundtableGesture.paperTouchStartY);
  if (moved > 10) return;
  handlePaperDoubleTap(event);
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
  els.body.classList.toggle("is-ready", Boolean(clean(els.input.value)) || pendingChatAttachments.length > 0);
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
  ["input", els.contextCount, "contextCount"],
  ["input", els.maxTokens, "maxTokens"],
].forEach(([, element, key]) => {
  element.addEventListener("input", () => {
    globalModelDefaults()[key] = key === "contextCount" || key === "maxTokens" ? Number(element.value) || 0 : element.value;
    persistState(state);
  });
});

[
  ["input", els.baseUrl, "baseUrl"],
  ["input", els.apiKey, "apiKey"],
].forEach(([, element, key]) => {
  element.addEventListener("input", () => {
    updateActiveProviderCredential(key, element.value);
  });
});

els.contextTokenBudget?.addEventListener("input", () => {
  const api = apiSettings();
  api.contextTokenBudget = Math.max(1000, Number(els.contextTokenBudget.value) || 200000);
  globalModelDefaults().contextTokenBudget = api.contextTokenBudget;
  persistState(state);
});

els.providerSelect?.addEventListener("change", () => switchApiProvider(els.providerSelect.value));
els.providerName?.addEventListener("input", updateActiveProviderName);

els.modelInput.addEventListener("input", () => {
  setGlobalDefaultModel(els.modelInput.value);
  renderSettingsModelPicker();
  persistState(state);
});

els.modelSelect.addEventListener("change", () => {
  setActiveModel(els.modelSelect.value);
  render();
});

document.addEventListener("click", (event) => {
  if (roundtableState().membersOpen) {
    const target = event.target;
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const insideDialog = target.closest?.("#assistantConfigDialog, #editDialog")
      || path.some((item) => item?.id === "assistantConfigDialog" || item?.id === "editDialog");
    const insideMembers = target.closest?.("#roundtableMembersPanel")
      || path.some((item) => item?.id === "roundtableMembersPanel");
    const onToggle = target.closest?.("#composerToolButton")
      || path.some((item) => item?.id === "composerToolButton");
    if (insideDialog) return;
    if (!insideMembers && !onToggle) closeRoundtableMembers();
  }
});

document.addEventListener("click", captureComposerModelPickerClick, true);

document.addEventListener("click", (event) => {
  if (!modelPickerOpen) return;
  if (event.target.closest("#modelPickerPanel, #modelSelectButton")) return;
  modelPickerOpen = false;
  renderModelPicker();
});

document.addEventListener("click", (event) => {
  if (!settingsModelPickerOpen) return;
  if (event.target.closest("#settingsModelPicker, #settingsModelPickerButton, #modelInput")) return;
  settingsModelPickerOpen = false;
  renderSettingsModelPicker();
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

els.assistantConfigDialog?.addEventListener("click", (event) => {
  const summary = event.target.closest?.(".assistant-fold > summary");
  if (!summary || !els.assistantConfigDialog.contains(summary)) return;
  const details = summary.parentElement;
  if (!details) return;
  event.preventDefault();
  event.stopPropagation();
  details.open = !details.open;
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (sealedCreatorOverlayOpen) {
    event.preventDefault();
    return;
  }
  if (getOpenDialog()) {
    closeOpenDialog();
    event.preventDefault();
    return;
  }
  if (roundtableState().membersOpen) {
    closeRoundtableMembers();
    event.preventDefault();
    return;
  }
  if (panelManager.getActivePanel() === "settings" && activeSettingsPage === "creators" && activeCreatorDetailId) {
    closeCreatorDetail();
    event.preventDefault();
    return;
  }
  if (panelManager.getActivePanel() === "settings" && activeSettingsPage !== "home") {
    openSettingsPage("home");
    event.preventDefault();
    return;
  }
  if (panelManager.getActivePanel()) {
    closePanels();
    event.preventDefault();
  }
});

window.addEventListener("popstate", () => {
  if (closingSealedCreatorFromButton) {
    closingSealedCreatorFromButton = false;
    return;
  }
  if (sealedCreatorOverlayOpen) {
    try {
      history.pushState({ ...(history.state || {}), tbirdSealedCreatorOpen: true }, "");
      sealedCreatorHistoryOpen = true;
    } catch {}
    showToast("封装界面只能用关闭按钮退出");
    return;
  }
  if (getOpenDialog()) {
    closeOpenDialog({ fromHistory: true });
    return;
  }
  if (keepRoundtableMembersOnDialogBack && roundtableState().membersOpen) {
    keepRoundtableMembersOnDialogBack = false;
    transientHistoryOpen = Boolean(history.state?.tbirdTransientOpen);
    render();
    return;
  }
  if (roundtableState().membersOpen) {
    closeRoundtableMembers({ fromHistory: true });
    return;
  }
  if (panelManager.getActivePanel() === "settings" && activeSettingsPage === "creators" && activeCreatorDetailId) {
    closeCreatorDetail();
    try {
      history.pushState({ ...(history.state || {}), tbirdPanelOpen: true }, "");
      panelHistoryOpen = true;
    } catch {
      panelHistoryOpen = false;
    }
    return;
  }
  if (panelManager.getActivePanel() === "settings" && activeSettingsPage !== "home") {
    openSettingsPage("home");
    try {
      history.pushState({ ...(history.state || {}), tbirdPanelOpen: true }, "");
      panelHistoryOpen = true;
    } catch {
      panelHistoryOpen = false;
    }
    return;
  }
  if (!panelManager.getActivePanel()) return;
  closePanels({ fromHistory: true });
});

els.temperature.addEventListener("input", () => {
  const defaults = globalModelDefaults();
  defaults.temperature = Number(els.temperature.value);
  els.temperatureLabel.textContent = defaults.temperature.toFixed(2);
  persistState(state);
});

els.unlimitedContext.addEventListener("change", () => {
  globalModelDefaults().unlimitedContext = els.unlimitedContext.checked;
  persistState(state);
});

els.stream.addEventListener("change", () => {
  globalModelDefaults().stream = els.stream.checked;
  persistState(state);
});

els.userNameInput?.addEventListener("input", updateSessionUserName);
els.chatImageFile?.addEventListener("change", handleChatImageSelected);
els.chooseUserAvatar?.addEventListener("click", () => els.userAvatarFile?.click());
els.clearUserAvatar?.addEventListener("click", clearUserAvatar);
els.userAvatarFile?.addEventListener("change", handleUserAvatarSelected);
els.chooseSessionBackground?.addEventListener("click", () => els.sessionBackgroundFile?.click());
els.clearSessionBackground?.addEventListener("click", clearSessionBackground);
els.sessionBackgroundFile?.addEventListener("change", handleSessionBackgroundSelected);

els.layoutInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const key = input.dataset.layoutKey;
    const layout = sessionSettings().layout;
    layout[key] = readLayoutInputValue(input, layout[key]);
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
els.sessionImportFile?.addEventListener("change", handleSessionImportSelected);
els.creatorImportFile?.addEventListener("change", handleCreatorImportSelected);
els.globalBackupImportFile?.addEventListener("change", handleGlobalBackupImportSelected);

els.saveEdit.addEventListener("click", () => saveEditor(false));
els.saveSendEdit.addEventListener("click", () => saveEditor(true));
els.editDialog?.addEventListener("close", () => {
  editTarget = null;
  handleDialogClosed();
});
els.assistantConfigDialog?.addEventListener("close", () => {
  els.assistantConfigDialog?.classList.remove("sealed-assistant-config");
  els.assistantConfigDialog?.classList.remove("sealed-b-config");
  els.assistantConfigDialog?.classList.remove("assistant-model-config-only");
  if (els.sealedActivationBar) els.sealedActivationBar.hidden = true;
  if (els.sealedPromptBar) els.sealedPromptBar.hidden = true;
  if (els.assistantActivationFold) els.assistantActivationFold.hidden = false;
  if (els.assistantParticipationFold) els.assistantParticipationFold.hidden = false;
  if (els.assistantMaterialsFold) els.assistantMaterialsFold.hidden = false;
  if (els.assistantPromptFold) els.assistantPromptFold.hidden = false;
  discardPendingCustomAssistantDraft({ render: true });
  assistantConfigTargetId = null;
  assistantConfigMode = "member";
  assistantModelPickerOpen = false;
  handleDialogClosed();
});
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
els.assistantProviderSelect?.addEventListener("change", () => {
  if (els.assistantModelStatus) els.assistantModelStatus.textContent = els.assistantProviderSelect.value ? "已切换提供方" : "跟随默认提供方";
  renderAssistantModelPicker();
});
els.assistantApiOverrideEnabledInput?.addEventListener("change", () => {
  syncAssistantApiOverrideUi(Boolean(els.assistantApiOverrideEnabledInput?.checked));
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
els.assistantAvatarPreview?.addEventListener("click", handleAssistantAvatarSecretTap);
els.closeSealedCreatorOverlay?.addEventListener("click", () => closeSealedCreatorOverlay({ fromButton: true }));
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
els.messages?.addEventListener("touchstart", handleMessagePinchStart, { passive: true });
els.messages?.addEventListener("touchmove", handleMessagePinchMove, { passive: true });
els.messages?.addEventListener("touchend", resetMessagePinchGesture, { passive: true });
els.messages?.addEventListener("touchcancel", resetMessagePinchGesture, { passive: true });
window.addEventListener("scroll", lockRootScroll, { passive: true });
els.roundtablePaper?.addEventListener("dblclick", handlePaperDoubleTap);
els.roundtablePaper?.addEventListener("touchstart", handlePaperTouchStart, { passive: true });
els.roundtablePaper?.addEventListener("touchend", handlePaperTouchEnd, { passive: false });

window.addEventListener("resize", resizeInput);
window.visualViewport?.addEventListener("resize", resizeInput);

if (syncSealedCreatorTemplatePrompts() || migrateImportedPrimaryCloneCreators()) persistState(state);

// Apply persisted Material You theme + seed color before first paint so
// users never see the default palette flash.
try { initThemeEngine(); } catch (_) { /* SSR/test */ }

// Theme picker (settings → 外观). Static markup in index.html provides
// the segmented mode selector and seed swatches; we only wire the
// behaviour here.
function syncThemePickerUi() {
  const mode = getThemeMode();
  document.querySelectorAll("[data-theme-mode]").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.themeMode === mode));
  });
  const seed = getSeedColor() || "";
  document.querySelectorAll(".md-seed[data-seed]").forEach((btn) => {
    const s = btn.dataset.seed === "custom" ? null : btn.dataset.seed;
    if (s == null) {
      btn.setAttribute("aria-pressed", "false");
    } else {
      btn.setAttribute("aria-pressed", String(s.toLowerCase() === seed.toLowerCase()));
    }
  });
}
document.addEventListener("click", (event) => {
  const modeBtn = event.target.closest?.("[data-theme-mode]");
  if (modeBtn) {
    setThemeMode(modeBtn.dataset.themeMode);
    syncThemePickerUi();
    return;
  }
  const seedBtn = event.target.closest?.(".md-seed[data-seed]");
  if (seedBtn) {
    if (seedBtn.dataset.seed === "custom") {
      document.getElementById("customSeedColor")?.click();
    } else {
      setSeedColor(seedBtn.dataset.seed || "");
      syncThemePickerUi();
    }
  }
});
const _customSeed = document.getElementById("customSeedColor");
_customSeed?.addEventListener("input", () => {
  setSeedColor(_customSeed.value);
  syncThemePickerUi();
});
syncThemePickerUi();

render();
resizeInput();
scrollBottom();

// Lift the top app bar to surface-container tonal once the user starts
// scrolling — M3 spec.
const _topbar = document.querySelector(".topbar");
if (_topbar && els.messages) bindScrollAwareBar(_topbar, els.messages);
if (_topbar && els.roundtableDiscussion) bindScrollAwareBar(_topbar, els.roundtableDiscussion);

// Expose theme controls on window for easy console + future settings UI.
window.tbirdTheme = { setThemeMode, setSeedColor, getThemeMode, getSeedColor };

// `?` opens the keyboard help dialog. Bound globally except inside inputs.
bindKeyboardHelpShortcut();
window.tbirdHelp = { openKeyboardHelp };

// First load after upgrade: surface a "What's new" snackbar, with an
// action that pops the keyboard help dialog so users discover the
// new chrome.
try {
  checkAndAnnounceUpgrade({ onLearnMore: openKeyboardHelp });
  window.tbirdVersion = APP_VERSION;
} catch (_) { /* SSR / test */ }

// Scroll-to-bottom FAB — visible only when the chat scroller is not
// near the bottom AND the list has content. Empty state — visible only
// when the chat path is empty AND we're not in roundtable mode.
const _scrollFab = document.getElementById("scrollToBottom");
const _emptyState = document.getElementById("messageEmpty");
function syncScrollFab() {
  if (!_scrollFab || !els.messages) return;
  const hasContent = els.messages.children.length > 0;
  const distanceFromBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight;
  const shouldShow = hasContent && distanceFromBottom > 240 && !els.messages.hidden;
  _scrollFab.hidden = !shouldShow;
}
function syncMessageEmpty() {
  if (!_emptyState) return;
  const empty = !els.messages?.hidden && (!els.messages?.children?.length);
  _emptyState.hidden = !empty;
}
els.messages?.addEventListener("scroll", () => {
  if (_fabRaf) return;
  _fabRaf = requestAnimationFrame(() => { _fabRaf = 0; syncScrollFab(); });
}, { passive: true });
let _fabRaf = 0;
_scrollFab?.addEventListener("click", () => {
  els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: "smooth" });
});
// Re-sync after the message list mutates. MutationObserver keeps us
// independent from the render() pipeline (no risk of redefining the
// existing function declaration) and only fires when something
// actually changed in the chat surface.
if (typeof MutationObserver === "function" && els.messages) {
  let _mutPending = false;
  const observer = new MutationObserver(() => {
    if (_mutPending) return;
    _mutPending = true;
    requestAnimationFrame(() => {
      _mutPending = false;
      syncScrollFab();
      syncMessageEmpty();
    });
  });
  observer.observe(els.messages, { childList: true });
}
// Empty-state suggestion chips fill the composer.
document.addEventListener("click", (event) => {
  const chip = event.target.closest?.("[data-empty-prompt]");
  if (!chip) return;
  els.input.value = chip.dataset.emptyPrompt || "";
  els.input.focus();
  els.input.dispatchEvent(new Event("input", { bubbles: true }));
});
syncScrollFab();
syncMessageEmpty();

// Flush any debounced state writes before the page unloads so we never lose
// the trailing edit. pagehide is the iOS-friendly equivalent of beforeunload.
window.addEventListener("pagehide", () => persistStateImmediate(state));
window.addEventListener("beforeunload", () => persistStateImmediate(state));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistStateImmediate(state);
});

