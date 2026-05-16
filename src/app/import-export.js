import { createCreatorIdentity } from "../domain/creator/creator-model.js";
import {
  GENERATIVE_AGENT_MEMORY_LIMIT,
  getRoundtableCreatorTemplateBase,
  hydrateRoundtableState,
  normalizeAssistantMemories,
} from "../domain/roundtable/roundtable-model.js";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function stripRuntimeSecretsFromAssistantConfigs(configs = {}) {
  return Object.fromEntries(Object.entries(configs || {}).map(([id, config]) => [
    id,
    {
      ...(config || {}),
      apiKey: "",
    },
  ]));
}

export function createImportExportController({
  getEls,
  getState,
  replaceState,
  hydrateState,
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
  persistState,
  showToast,
  humanizeError,
}) {
  let creatorImportMode = "library";

  function creatorExportView(creator) {
    const sourceTemplateId = clean(creator.sourceTemplateId);
    const sealedTemplateCode = clean(creator.sealedTemplateCode);
    return {
      ...cloneJson(creator),
      modelConfig: {
        ...(cloneJson(creator.modelConfig || {})),
        apiKey: "",
      },
      prompt: sourceTemplateId ? "" : clean(creator.prompt),
      sourceTemplateId,
      sealedTemplateCode,
    };
  }

  function restoreImportedCreatorPrompt(creator) {
    const sourceTemplateId = clean(creator.sourceTemplateId);
    const sealedTemplateCode = clean(creator.sealedTemplateCode).toUpperCase();
    if (!sourceTemplateId && !sealedTemplateCode) return clean(creator.prompt);
    const templateId = sourceTemplateId
      || (sealedTemplateCode === "T" ? "sealed-t" : sealedTemplateCode === "B" ? "sealed-b" : "");
    return clean(getRoundtableCreatorTemplateBase(templateId)?.prompt) || clean(creator.prompt);
  }

  function collectSessionCreatorIds(session) {
    const ids = new Set([session.creatorId]);
    (session.roundtable?.selectedIds || []).forEach((id) => {
      if (getCreatorIdentity(id)) ids.add(id);
    });
    return [...ids].filter(Boolean);
  }

  function exportGlobalBackup() {
    const packageData = {
      format: "tbird-global-backup",
      version: 1,
      exportedAt: Date.now(),
      state: cloneJson(getState()),
    };
    downloadText(`TBird-全局备份-${Date.now()}.json`, JSON.stringify(packageData, null, 2), "application/json;charset=utf-8");
    showToast("已导出完整全局备份，包含本机 API Key");
  }

  function importGlobalBackup() {
    if (!window.confirm("导入全局备份会覆盖当前所有会话、创作者、记忆库和 API 配置。继续？")) return;
    getEls().globalBackupImportFile?.click();
  }

  async function handleGlobalBackupImportSelected() {
    const els = getEls();
    const file = els.globalBackupImportFile?.files?.[0];
    if (!file) return;
    try {
      const packageData = JSON.parse(await file.text());
      const backupState = packageData?.format === "tbird-global-backup" ? packageData.state : packageData;
      if (!backupState || !Array.isArray(backupState.sessions)) {
        throw new Error("不是 TBird 全局备份");
      }
      replaceState(hydrateState(cloneJson(backupState)));
      closePanels();
      render();
      persistState();
      showToast("全局备份已导入");
    } catch (error) {
      showToast(humanizeError(error, "全局备份导入失败"));
    } finally {
      if (els.globalBackupImportFile) els.globalBackupImportFile.value = "";
    }
  }

  function exportCreatorPackage(creatorId) {
    const state = getState();
    const creator = getCreatorIdentity(creatorId);
    if (!creator) return showToast("没有找到创作者");
    const records = (state.creatorParticipationRecords || [])
      .filter((record) => record?.creatorId === creatorId)
      .map(cloneJson);
    const primarySessions = state.sessions
      .filter((session) => session.creatorId === creatorId)
      .map((session) => ({
        id: session.id,
        title: titleForSession(session),
        updatedAt: session.updatedAt,
      }));
    const packageData = {
      format: "tbird-creator-package",
      version: 1,
      exportedAt: Date.now(),
      creator: creatorExportView(creator),
      creatorParticipationRecords: records,
      primarySessions,
    };
    const safeName = (creator.name || "creator").replace(/[\\/:*?"<>|]+/g, "_").slice(0, 36) || "creator";
    downloadText(`TBird-创作者-${safeName}-${Date.now()}.json`, JSON.stringify(packageData, null, 2), "application/json;charset=utf-8");
    showToast("创作者已导出，不包含 API Key");
  }

  function importCreatorPackage() {
    creatorImportMode = "library";
    getEls().creatorImportFile?.click();
  }

  function replaceCurrentCreatorPackage() {
    if (!window.confirm("导入创作者包并替换当前会话主创？旧主创会保留在创作者库，当前会话会切到导入主创，并生成一条交接压缩记忆。")) return;
    creatorImportMode = "replace-current";
    getEls().creatorImportFile?.click();
  }

  function buildCurrentSessionCreatorHandoffMemory(oldCreator, newCreator) {
    const session = activeSession();
    const novel = sessionNovel(session);
    const chat = activePath(session)
      .filter((node) => ["user", "assistant"].includes(node.role))
      .slice(-24)
      .map((node) => `${node.role === "user" ? clean(sessionAppearance(session).userName) || "用户" : oldCreator?.name || "原主创"}：${getMessageContent(node)}`)
      .filter((line) => clean(line))
      .join("\n")
      .slice(-3600);
    const materials = [
      clean(novel.plotline) ? `剧情线：${clean(novel.plotline).slice(-900)}` : "",
      clean(novel.characters) ? `角色卡：${clean(novel.characters).slice(-900)}` : "",
      clean(novel.world) ? `世界观：${clean(novel.world).slice(-900)}` : "",
      clean(novel.outline) ? `大纲：${clean(novel.outline).slice(-900)}` : "",
      clean(novel.foreshadows) ? `伏笔线：${clean(novel.foreshadows).slice(-700)}` : "",
      clean(novel.body) ? `正文尾段：${clean(novel.body).slice(-1400)}` : "",
    ].filter(Boolean).join("\n");
    return [
      `你被导入并替换为「${titleForSession(session)}」的当前主创。`,
      `原主创：${oldCreator?.name || "未知"}；新主创：${newCreator?.name || "导入主创"}。`,
      "这是一次配置替换，不与原导出会话保持同步。请把下面内容当作当前会话的压缩交接记忆，而不是完整历史。",
      materials ? `【当前小说资料】\n${materials}` : "",
      chat ? `【最近有效对话】\n${chat}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function createImportedCreatorFromPackage(packageData, options = {}) {
    const oldCreator = packageData.creator;
    const newCreatorId = uid("creator");
    const name = clean(options.name)
      || `${clean(oldCreator.name) || "导入创作者"}${options.suffix === false ? "" : " · 导入"}`;
    const importedCreator = createCreatorIdentity({
      ...oldCreator,
      id: newCreatorId,
      name,
      prompt: restoreImportedCreatorPrompt(oldCreator),
      privateSessionId: clean(options.privateSessionId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const packageSnapshots = normalizeAssistantMemories(oldCreator.memory?.compressedSnapshots);
    importedCreator.memory = {
      ...(importedCreator.memory || {}),
      displayName: clean(importedCreator.memory?.displayName) || `${name}记忆`,
      notes: clean(importedCreator.memory?.notes),
      compressedSnapshots: packageSnapshots,
    };
    return importedCreator;
  }

  function importCreatorRecordsForPackage(packageData, newCreatorId) {
    const state = getState();
    const importedRecords = (packageData.creatorParticipationRecords || []).map((record) => ({
      ...record,
      id: uid("creator_record"),
      creatorId: newCreatorId,
      createdAt: Number(record.createdAt) || Date.now(),
      updatedAt: Date.now(),
    }));
    state.creatorParticipationRecords = [...(state.creatorParticipationRecords || []), ...importedRecords];
  }

  function replaceCurrentCreatorWithImportedPackage(packageData) {
    const session = activeSession();
    const oldCreator = getCreatorIdentity(getPrimaryCreatorId(session));
    const importedCreator = createImportedCreatorFromPackage(packageData, {
      name: clean(packageData.creator?.name) || "导入主创",
      suffix: false,
      privateSessionId: session.id,
    });
    const handoffMemory = buildCurrentSessionCreatorHandoffMemory(oldCreator, importedCreator);
    importedCreator.memory = {
      ...(importedCreator.memory || {}),
      compressedSnapshots: [
        ...normalizeAssistantMemories(importedCreator.memory?.compressedSnapshots),
        {
          id: uid("memory"),
          text: handoffMemory,
          source: "primary-creator-replacement",
          sourceSessionId: session.id,
          sourceCreatorId: oldCreator?.id || "",
          createdAt: Date.now(),
        },
      ].slice(-GENERATIVE_AGENT_MEMORY_LIMIT),
    };
    saveCreatorIdentity(importedCreator);
    importCreatorRecordsForPackage(packageData, importedCreator.id);
    session.creatorId = importedCreator.id;
    session.settings.systemPrompt = clean(importedCreator.prompt) || session.settings.systemPrompt;
    session.settings.model = clean(importedCreator.modelConfig?.model) || session.settings.model;
    session.settings.maxTokens = Number(importedCreator.modelConfig?.maxTokens) || session.settings.maxTokens;
    session.settings.temperature = Number.isFinite(Number(importedCreator.modelConfig?.temperature))
      ? Number(importedCreator.modelConfig.temperature)
      : session.settings.temperature;
    const rt = roundtableState(session);
    rt.selectedIds = (rt.selectedIds || []).filter((id) => id !== importedCreator.id);
    writerState(session).styleCache = "";
    writerState(session).styleCacheSourceHash = "";
    writerState(session).styleCacheUpdatedAt = 0;
    touchSession(session);
    render();
    persistState();
    showToast(`当前会话主创已替换为 ${importedCreator.name}`);
  }

  async function handleCreatorImportSelected() {
    const els = getEls();
    const file = els.creatorImportFile?.files?.[0];
    if (!file) return;
    try {
      const packageData = JSON.parse(await file.text());
      if (packageData?.format !== "tbird-creator-package" || !packageData.creator) {
        throw new Error("不是 TBird 创作者包");
      }
      if (creatorImportMode === "replace-current") {
        replaceCurrentCreatorWithImportedPackage(packageData);
        return;
      }
      const importedCreator = createImportedCreatorFromPackage(packageData);
      saveCreatorIdentity(importedCreator);
      importCreatorRecordsForPackage(packageData, importedCreator.id);
      render();
      persistState();
      showToast(`已导入创作者 ${importedCreator.name}`);
    } catch (error) {
      showToast(humanizeError(error, "创作者导入失败"));
    } finally {
      creatorImportMode = "library";
      if (els.creatorImportFile) els.creatorImportFile.value = "";
    }
  }

  function exportSessionPackage(sessionId) {
    const state = getState();
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return showToast("没有找到会话");
    const creatorIds = collectSessionCreatorIds(session);
    const creators = Object.fromEntries(creatorIds
      .map((id) => getCreatorIdentity(id))
      .filter(Boolean)
      .map((creator) => [creator.id, creatorExportView(creator)]));
    const sessionCopy = cloneJson(session);
    sessionCopy.roundtable = {
      ...(sessionCopy.roundtable || {}),
      assistantConfigs: stripRuntimeSecretsFromAssistantConfigs(sessionCopy.roundtable?.assistantConfigs),
    };
    const records = (state.councilParticipationRecords || [])
      .filter((record) => record?.sessionId === session.id || creatorIds.includes(record?.councilId))
      .map(cloneJson);
    const creatorRecords = (state.creatorParticipationRecords || [])
      .filter((record) => record?.sessionId === session.id || creatorIds.includes(record?.creatorId))
      .map(cloneJson);
    const packageData = {
      format: "tbird-session-package",
      version: 1,
      exportedAt: Date.now(),
      session: sessionCopy,
      creators,
      councilParticipationRecords: records,
      creatorParticipationRecords: creatorRecords,
    };
    const safeTitle = titleForSession(session).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 36) || "session";
    downloadText(`TBird-${safeTitle}-${Date.now()}.json`, JSON.stringify(packageData, null, 2), "application/json;charset=utf-8");
    showToast("会话包已导出，不包含 API Key");
  }

  function importSessionPackage() {
    getEls().sessionImportFile?.click();
  }

  async function handleSessionImportSelected() {
    const state = getState();
    const els = getEls();
    const file = els.sessionImportFile?.files?.[0];
    if (!file) return;
    try {
      const packageData = JSON.parse(await file.text());
      if (packageData?.format !== "tbird-session-package" || !packageData.session) {
        throw new Error("不是 TBird 会话包");
      }
      const sessionIdMap = new Map([[packageData.session.id, uid("sess")]]);
      const creatorIdMap = new Map();
      const importedCreators = Object.values(packageData.creators || {});
      importedCreators.forEach((creator) => {
        const nextId = uid("creator");
        creatorIdMap.set(creator.id, nextId);
        const nextCreator = createCreatorIdentity({
          ...creator,
          id: nextId,
          prompt: restoreImportedCreatorPrompt(creator),
          privateSessionId: creator.privateSessionId === packageData.session.id ? sessionIdMap.get(packageData.session.id) : "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        saveCreatorIdentity(nextCreator);
      });
      const importedSession = cloneJson(packageData.session);
      importedSession.id = sessionIdMap.get(packageData.session.id);
      importedSession.title = `${clean(importedSession.title) || "导入会话"}（导入）`;
      importedSession.creatorId = creatorIdMap.get(importedSession.creatorId) || importedSession.creatorId;
      importedSession.createdAt = Date.now();
      importedSession.updatedAt = Date.now();
      importedSession.roundtable = hydrateRoundtableState(importedSession.roundtable || {});
      importedSession.roundtable.selectedIds = (importedSession.roundtable.selectedIds || [])
        .map((id) => creatorIdMap.get(id) || id)
        .filter((id) => id && id !== importedSession.creatorId);
      importedSession.roundtable.assistantConfigs = Object.fromEntries(Object.entries(importedSession.roundtable.assistantConfigs || {}).map(([id, config]) => [
        creatorIdMap.get(id) || id,
        { ...(config || {}), apiKey: "" },
      ]));
      importedSession.roundtable.messages = (importedSession.roundtable.messages || []).map((message) => ({
        ...message,
        speakerId: creatorIdMap.get(message.speakerId) || message.speakerId,
      }));
      if (importedSession.roundtable.roundProgress?.ids) {
        importedSession.roundtable.roundProgress.ids = importedSession.roundtable.roundProgress.ids.map((id) => creatorIdMap.get(id) || id);
      }
      state.sessions.unshift(importedSession);
      state.activeSessionId = importedSession.id;
      const importedRecords = (packageData.councilParticipationRecords || []).map((record) => ({
        ...record,
        id: uid("council_record"),
        sessionId: sessionIdMap.get(record.sessionId) || importedSession.id,
        councilId: creatorIdMap.get(record.councilId) || record.councilId,
        createdAt: Number(record.createdAt) || Date.now(),
        updatedAt: Date.now(),
      }));
      state.councilParticipationRecords = [...(state.councilParticipationRecords || []), ...importedRecords];
      const importedCreatorRecords = (packageData.creatorParticipationRecords || []).map((record) => ({
        ...record,
        id: uid("creator_record"),
        sessionId: sessionIdMap.get(record.sessionId) || importedSession.id,
        creatorId: creatorIdMap.get(record.creatorId) || record.creatorId,
        createdAt: Number(record.createdAt) || Date.now(),
        updatedAt: Date.now(),
      }));
      state.creatorParticipationRecords = [...(state.creatorParticipationRecords || []), ...importedCreatorRecords];
      closePanels();
      render();
      persistState();
      showToast("会话包已导入为新会话");
    } catch (error) {
      showToast(humanizeError(error, "会话导入失败"));
    } finally {
      if (els.sessionImportFile) els.sessionImportFile.value = "";
    }
  }

  return {
    exportGlobalBackup,
    importGlobalBackup,
    handleGlobalBackupImportSelected,
    exportCreatorPackage,
    importCreatorPackage,
    replaceCurrentCreatorPackage,
    handleCreatorImportSelected,
    exportSessionPackage,
    importSessionPackage,
    handleSessionImportSelected,
  };
}
