import { normalizeAssistantMemories } from "../domain/roundtable/roundtable-model.js";
import { markCreatorMemoriesDeleted } from "../domain/creator/creator-memory-model.js";
import { createSession } from "../domain/session/session-model.js";

export function createCreatorController({
  getState,
  getCreatorIdentity,
  getPrimaryCreatorId,
  creatorsState,
  saveCreatorIdentity,
  ensureSessionCreator,
  roundtableState,
  switchSession,
  closePanels,
  render,
  persistState,
  touchSession,
  clean,
  showToast,
  askDeleteChoice,
}) {
  function renameCreatorMemory(creatorId) {
    const creator = getCreatorIdentity(creatorId);
    if (!creator) return;
    const current = clean(creator.memory?.displayName) || `${creator.name || "创作者"}记忆`;
    const next = window.prompt("记忆库显示名", current);
    if (next === null) return;
    const name = clean(next);
    if (!name) return showToast("记忆库名称不能为空");
    saveCreatorIdentity({
      ...creator,
      memory: {
        ...(creator.memory || {}),
        displayName: name,
      },
      updatedAt: Date.now(),
    });
    render();
    persistState();
    showToast("记忆库已改名");
  }

  function openCreatorRoundtable(sessionId) {
    const state = getState();
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return;
    state.activeSessionId = session.id;
    const rt = roundtableState(session);
    rt.enabled = true;
    rt.membersOpen = false;
    closePanels();
    render();
    persistState();
  }

  function removeCreatorFromRoundtable(sessionId, creatorId) {
    const state = getState();
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session || session.creatorId === creatorId) return;
    const rt = roundtableState(session);
    rt.selectedIds = (rt.selectedIds || []).filter((id) => id !== creatorId);
    delete rt.assistantConfigs?.[creatorId];
    touchSession(session);
    render();
    persistState();
    showToast("已从该圆桌移除，参会记录保留");
  }

  function clearCreatorRecords(creatorId) {
    const state = getState();
    const creator = getCreatorIdentity(creatorId);
    if (!creator) return;
    if (!window.confirm(`清除 ${creator.name || "该创作者"} 的参会记录？这不会删除会话。`)) return;
    const recordIds = (state.creatorParticipationRecords || [])
      .filter((record) => record?.creatorId === creatorId)
      .map((record) => clean(record?.id))
      .filter(Boolean);
    state.councilParticipationRecords = (state.councilParticipationRecords || [])
      .filter((record) => record?.councilId !== creatorId);
    state.creatorParticipationRecords = (state.creatorParticipationRecords || [])
      .filter((record) => record?.creatorId !== creatorId);
    markCreatorMemoriesForRecordsDeleted(recordIds);
    render();
    persistState();
    showToast("参会记录已清除");
  }

  function markCreatorMemoriesForRecordsDeleted(recordIds = []) {
    const ids = new Set((Array.isArray(recordIds) ? recordIds : [recordIds]).map(clean).filter(Boolean));
    if (!ids.size) return;
    const creators = creatorsState();
    Object.values(creators).forEach((creator) => {
      if (!creator?.id) return;
      const hadMatchingMemory = Array.isArray(creator.memory?.entries)
        && creator.memory.entries.some((entry) => ids.has(clean(entry?.sourceRecordId)) && !entry?.deletedAt);
      if (!hadMatchingMemory) return;
      const nextMemory = markCreatorMemoriesDeleted(
        creator.memory,
        (entry) => ids.has(clean(entry?.sourceRecordId)),
      );
      creators[creator.id] = {
        ...creator,
        memory: nextMemory,
        updatedAt: Date.now(),
      };
    });
  }

  function deleteCreatorRecord(recordId) {
    const state = getState();
    const id = clean(recordId);
    if (!id) return;
    state.creatorParticipationRecords = (state.creatorParticipationRecords || [])
      .map((record) => record?.id === id ? { ...record, deleted: true, updatedAt: Date.now() } : record);
    markCreatorMemoriesForRecordsDeleted([id]);
    render();
    persistState();
    showToast("这条参会记录已删除");
  }

  function deleteCreatorMemorySnapshot(creatorId, memoryId) {
    const creator = getCreatorIdentity(creatorId);
    const id = clean(memoryId);
    if (!creator || !id) return;
    const snapshots = normalizeAssistantMemories(creator.memory?.compressedSnapshots)
      .filter((item) => item.id !== id);
    saveCreatorIdentity({
      ...creator,
      memory: {
        ...(creator.memory || {}),
        compressedSnapshots: snapshots,
      },
      updatedAt: Date.now(),
    });
    render();
    persistState();
    showToast("这条压缩记忆已删除");
  }

  async function deleteCreatorIdentity(creatorId) {
    const state = getState();
    const creator = getCreatorIdentity(creatorId);
    if (!creator) return;
    if (creatorId === getPrimaryCreatorId()) return showToast("不能删除当前会话主创");
    const ownedSessions = state.sessions.filter((session) => session.creatorId === creatorId);
    const choice = await askDeleteChoice({
      title: "删除创作者",
      message: ownedSessions.length
        ? `删除 ${creator.name || "该创作者"}？他拥有 ${ownedSessions.length} 个主会话。`
        : `删除 ${creator.name || "该创作者"}？会从所有圆桌移除，并删除他的参会记录。`,
      confirmLabel: "确定",
      keepLabel: "删除但保留会话",
    });
    if (choice === "cancel") return;
    const keepSessions = choice === "keep";
    state.sessions.forEach((session) => {
      if (session.creatorId === creatorId) return;
      const rt = roundtableState(session);
      rt.selectedIds = (rt.selectedIds || []).filter((id) => id !== creatorId);
      delete rt.assistantConfigs?.[creatorId];
    });
    if (keepSessions) {
      ownedSessions.forEach((session) => {
        session.creatorId = "";
        ensureSessionCreator(session);
        touchSession(session);
      });
    } else {
      state.sessions = state.sessions.filter((session) => session.creatorId !== creatorId);
    }
    if (!state.sessions.length) {
      const session = createSession();
      ensureSessionCreator(session);
      state.sessions = [session];
    }
    if (!state.sessions.some((session) => session.id === state.activeSessionId)) {
      state.activeSessionId = state.sessions[0].id;
    }
    state.councilParticipationRecords = (state.councilParticipationRecords || [])
      .filter((record) => record?.councilId !== creatorId);
    state.creatorParticipationRecords = (state.creatorParticipationRecords || [])
      .filter((record) => record?.creatorId !== creatorId);
    delete creatorsState()[creatorId];
    render();
    persistState();
    showToast(keepSessions ? "创作者已删除，会话已保留" : "创作者已删除");
  }

  function openCreatorPrivateSession(creatorId) {
    const state = getState();
    const creator = getCreatorIdentity(creatorId);
    if (!creator) return;
    const existing = clean(creator.privateSessionId)
      ? state.sessions.find((session) => session.id === creator.privateSessionId)
      : state.sessions.find((session) => session.creatorId === creator.id);
    if (existing) {
      creator.privateSessionId = existing.id;
      saveCreatorIdentity(creator);
      switchSession(existing.id);
      return;
    }
    const session = createSession();
    session.creatorId = creator.id;
    session.title = clean(creator.name) || "创作者私聊";
    session.settings.systemPrompt = clean(creator.prompt) || session.settings.systemPrompt;
    session.settings.model = clean(creator.modelConfig?.model) || session.settings.model;
    session.settings.temperature = Number.isFinite(Number(creator.modelConfig?.temperature))
      ? Number(creator.modelConfig.temperature)
      : session.settings.temperature;
    session.settings.maxTokens = Number(creator.modelConfig?.maxTokens) || session.settings.maxTokens;
    creator.privateSessionId = session.id;
    saveCreatorIdentity(creator);
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    closePanels();
    render();
    persistState();
    showToast("已打开创作者私聊");
  }

  return {
    renameCreatorMemory,
    openCreatorRoundtable,
    removeCreatorFromRoundtable,
    clearCreatorRecords,
    deleteCreatorRecord,
    deleteCreatorMemorySnapshot,
    deleteCreatorIdentity,
    openCreatorPrivateSession,
  };
}
