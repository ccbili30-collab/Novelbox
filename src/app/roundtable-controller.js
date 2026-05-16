import { createCreatorIdentity } from "../domain/creator/creator-model.js";
import {
  DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT,
  createRoundAssistantConfigView,
  normalizeAssistantMemories,
  normalizeRoundtableContextOptions,
} from "../domain/roundtable/roundtable-model.js";
import { buildRoundtablePromptMessages } from "../domain/roundtable/roundtable-context-builder.js";
import { getCouncilParticipationRecords } from "../domain/roundtable/council-participation-memory.js";
import {
  buildRoundProgressInstruction,
  createRoundProgress,
} from "../domain/roundtable/roundtable-flow.js";

export function createRoundtableController({
  getState,
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
  normalizeAssistantPrivateMessages,
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
  getRoundtableActiveSpeaker,
  syncPrimaryCreatorIntoRoundtable,
  refreshWriterStyleCacheWithAi,
  closePanels,
  render,
  resizeInput,
  touchSession,
  persistState,
  showToast,
  pushTransientHistory,
  getTransientHistoryOpen,
  setTransientHistoryOpen,
  resetActiveMenus,
  clean,
  titleForSession,
  uid,
  humanizeError,
}) {
  const pendingImports = new Set();

  function importKey(sessionId, memberId) {
    return `${clean(sessionId)}::${clean(memberId)}`;
  }

  function getSessionImportCandidates() {
    const state = getState();
    const currentId = activeSession()?.id;
    const currentPrimaryId = getPrimaryCreatorId();
    return state.sessions
      .filter((session) => session && session.id !== currentId)
      .flatMap((session) => {
        const rt = roundtableState(session);
        const customIds = new Set((rt.customAssistants || []).map((assistant) => assistant.id));
        const primary = getRoundAssistantFromSession(session, getPrimaryCreatorId(session));
        const primaryCandidate = primary && primary.id !== currentPrimaryId
          ? [{ session, assistant: primary, isCustom: false, isPrimary: true }]
          : [];
        const selectedCreatorCandidates = (rt.selectedIds || [])
          .map((id) => getCreatorIdentity(id) ? getRoundAssistantFromSession(session, id) : null)
          .filter((assistant) => assistant && assistant.id !== getPrimaryCreatorId(session) && assistant.id !== currentPrimaryId)
          .map((assistant) => ({ session, assistant, isCustom: false, isPrimary: false }));
        const memberCandidates = getRoundAssistantBases(session)
          .filter((base) => base.id !== "writer")
          .filter((base) => base.id !== "plot" && base.id !== currentPrimaryId && !isSealedRoundtableCreatorId(base.id))
          .filter((base) => customIds.has(base.id) || assistantConfigHasSavedIdentity(rt.assistantConfigs?.[base.id]))
          .map((base) => {
            const assistant = getRoundAssistantFromSession(session, base.id);
            return assistant ? { session, assistant, isCustom: customIds.has(base.id), isPrimary: false } : null;
          })
          .filter(Boolean);
        return [...primaryCandidate, ...selectedCreatorCandidates, ...memberCandidates];
      });
  }

  function isSessionMemberAlreadyImported(sessionId, memberId) {
    const importedClone = Object.values(roundtableState().assistantConfigs || {}).some((config) => (
      config?.importedFrom?.sessionId === sessionId
      && config?.importedFrom?.memberId === memberId
    ));
    if (importedClone) return true;
    if (getCreatorIdentity(memberId)) return (roundtableState().selectedIds || []).includes(memberId);
    return false;
  }

  function isImportPending(sessionId, memberId) {
    return pendingImports.has(importKey(sessionId, memberId));
  }

  function beginImport(sessionId, memberId) {
    pendingImports.add(importKey(sessionId, memberId));
  }

  function endImport(sessionId, memberId) {
    pendingImports.delete(importKey(sessionId, memberId));
  }

  function appendSourceSessionMemory(creator, source, text, options = {}) {
    const sourceCreatorId = clean(options.sourceCreatorId) || clean(creator?.id);
    const memory = {
      id: uid("memory"),
      text,
      source: clean(options.source) || "source-session-reference",
      sourceSessionId: source.id,
      sourceCreatorId,
      createdAt: Date.now(),
    };
    return normalizeAssistantMemories([
      ...normalizeAssistantMemories(creator?.memory?.compressedSnapshots),
      memory,
    ]);
  }

  function summarizeSourceSessionForClone(source, assistant) {
    const path = activePath(source);
    const dialogue = path
      .filter((node) => ["user", "assistant"].includes(node.role))
      .slice(-18)
      .map((node) => `${node.role === "user" ? "用户" : assistant.name || "主创"}：${getMessageContent(node)}`)
      .filter((line) => clean(line))
      .join("\n")
      .slice(-3200);
    const novel = sessionNovel(source);
    const materials = [
      clean(novel.plotline) ? `剧情线：${clean(novel.plotline).slice(-900)}` : "",
      clean(novel.characters) ? `角色卡：${clean(novel.characters).slice(-900)}` : "",
      clean(novel.world) ? `世界观：${clean(novel.world).slice(-900)}` : "",
      clean(novel.outline) ? `大纲：${clean(novel.outline).slice(-900)}` : "",
      clean(novel.foreshadows) ? `伏笔：${clean(novel.foreshadows).slice(-700)}` : "",
      clean(novel.body) ? `正文尾段：${clean(novel.body).slice(-1200)}` : "",
    ].filter(Boolean).join("\n");
    return [
      `来源会话：${titleForSession(source)}`,
      `来源主创：${assistant.name || "主创"}`,
      "这是从来源会话拉入圆桌时生成的压缩记忆。你是该主创的入席克隆体，应延续来源会话的设定、语气、判断和写作偏好，但在当前圆桌里作为议员发言。",
      materials ? `【来源材料压缩】\n${materials}` : "",
      dialogue ? `【来源近期对话压缩】\n${dialogue}` : "",
    ].filter(Boolean).join("\n\n");
  }

  async function compressSourceSessionMemoryForClone(source, assistant) {
    const fallback = summarizeSourceSessionForClone(source, assistant);
    const sourceCreator = getCreatorIdentity(getPrimaryCreatorId(source));
    const sourceNovel = sessionNovel(source);
    const recentChat = activePath(source)
      .filter((node) => ["user", "assistant"].includes(node.role))
      .slice(-32)
      .map((node) => `${node.role === "user" ? "用户" : sourceCreator?.name || assistant.name || "主创"}：${getMessageContent(node)}`)
      .join("\n\n");
    const sourceText = [
      clean(sourceCreator?.prompt) ? `【来源主创提示词】\n${clean(sourceCreator.prompt)}` : "",
      clean(sourceCreator?.activationProfile) ? `【来源主创身份卡】\n${clean(sourceCreator.activationProfile)}` : "",
      clean(sourceNovel.body) ? `【正文库后段】\n${clean(sourceNovel.body).slice(-24000)}` : "",
      buildNovelMemoryFromSession(sourceNovel) ? `【已有小说资料】\n${buildNovelMemoryFromSession(sourceNovel)}` : "",
      clean(recentChat) ? `【最近对话】\n${recentChat}` : "",
    ].filter(Boolean).join("\n\n");
    const prompt = [
      "请把以下来源会话压缩成一个“入席克隆体记忆”。",
      "这是供另一个圆桌中的议员使用的长期记忆，不是普通摘要。",
      "要求：用中文；保留来源会话的世界规则、人物关系、剧情进度、主创偏好、表达倾向、未完成任务、禁忌与分歧；删除闲聊和重复表达。",
      "输出自然段或要点均可，不要输出 JSON，不要解释压缩过程。",
      `【来源会话】${titleForSession(source)}`,
      `【来源身份】${assistant.name || "主创"}`,
      sourceText,
    ].join("\n\n");
    try {
      const api = apiForProvider(sourceCreator?.modelConfig?.providerId || assistant.providerId);
      const settings = {
        ...sessionSettings(source),
        model: clean(sourceCreator?.modelConfig?.model) || clean(assistant.model) || sessionSettings(source).model,
        maxTokens: Math.max(1400, Number(sourceCreator?.modelConfig?.maxTokens) || Number(assistant.maxTokens) || 0),
      };
      const text = clean(await callCompressionModel(prompt, settings, api));
      return text || fallback;
    } catch (error) {
      showToast(humanizeError(error, "AI 压缩失败，已改用本地压缩"));
      return fallback;
    }
  }

  async function attachSourcePrimaryCreatorForRoundtable(source, assistant) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const sourceCreator = getCreatorIdentity(getPrimaryCreatorId(source));
    if (!sourceCreator) throw new Error("来源主创身份不存在，无法入席");
    const compressedText = await compressSourceSessionMemoryForClone(source, assistant);
    const name = clean(sourceCreator.name) || clean(assistant.name) || "主创";
    const memories = appendSourceSessionMemory(sourceCreator, source, compressedText, {
      source: "source-session-reference",
      sourceCreatorId: sourceCreator.id,
    });
    const creator = saveCreatorIdentity({
      ...sourceCreator,
      memory: {
        ...(sourceCreator.memory || {}),
        compressedSnapshots: memories,
      },
      updatedAt: Date.now(),
    });
    return { creator, name, compressedText };
  }

  async function importMemberFromSession(sessionId, memberId) {
    const state = getState();
    const source = state.sessions.find((session) => session.id === sessionId);
    if (!source || source.id === activeSession()?.id) return showToast("没有找到可拉入的来源会话");
    const sourcePrimaryId = getPrimaryCreatorId(source);
    const assistant = getRoundAssistantFromSession(source, memberId);
    if (!assistant || assistant.id === "writer") return showToast("没有找到可拉入的议员");
    if (assistant.id === getPrimaryCreatorId()) return showToast("不能把当前会话主创拉入自己所在的圆桌");
    const isSourcePrimaryCreator = assistant.id === sourcePrimaryId;
    if (isImportPending(sessionId, memberId)) return;
    if (getCreatorIdentity(assistant.id) && !isSourcePrimaryCreator) {
      const rt = roundtableState();
      if (assistant.id === getPrimaryCreatorId()) return showToast("当前主创已经在本会话");
      if (!rt.selectedIds.includes(assistant.id)) {
        beginImport(sessionId, memberId);
        render();
        showToast(`${assistant.name}正在读取来源会话记忆`);
        const creator = getCreatorIdentity(assistant.id);
        try {
          const compressedText = await compressSourceSessionMemoryForClone(source, assistant);
          saveCreatorIdentity({
            ...creator,
            memory: {
              ...(creator.memory || {}),
              compressedSnapshots: appendSourceSessionMemory(creator, source, compressedText, {
                source: "source-session-join",
                sourceCreatorId: creator.id,
              }),
            },
            updatedAt: Date.now(),
          });
        } catch (error) {
          showToast(humanizeError(error, "来源记忆读取失败"));
        } finally {
          endImport(sessionId, memberId);
        }
        rt.selectedIds.push(assistant.id);
        rememberCreatorRoundtableJoin(assistant.id, {
          sourceTitle: titleForSession(source),
        });
      }
      touchSession(activeSession());
      render();
      persistState();
      return showToast(`已拉入 ${assistant.name}`);
    }
    if (isSourcePrimaryCreator) {
      const rt = roundtableState();
      beginImport(sessionId, memberId);
      render();
      showToast(`${assistant.name}正在压缩记忆并入席`);
      try {
        const { creator, name } = await attachSourcePrimaryCreatorForRoundtable(source, assistant);
        rt.assistantConfigs[creator.id] = {
          name,
          providerId: clean(creator.modelConfig?.providerId),
          apiBaseUrl: "",
          apiKey: "",
          model: clean(creator.modelConfig?.model),
          networkEnabled: false,
          maxTokens: Number(creator.modelConfig?.maxTokens) || 0,
          contextTokenBudget: Number(creator.modelConfig?.contextTokenBudget) || 0,
          temperature: Number(creator.modelConfig?.temperature),
          contextOptions: normalizeRoundtableContextOptions(rt.contextOptions),
          activationProfile: clean(creator.activationProfile),
          memories: [],
          avatarDataUrl: clean(creator.avatarDataUrl),
          prompt: clean(creator.prompt),
          importedFrom: {
            sessionId: source.id,
            memberId: assistant.id,
            sessionTitle: titleForSession(source),
            sourceCreatorId: creator.id,
            reference: true,
            importedAt: Date.now(),
          },
        };
        if (!rt.selectedIds.includes(creator.id)) rt.selectedIds.push(creator.id);
        rememberCreatorRoundtableJoin(creator.id, {
          sourceTitle: titleForSession(source),
          reference: true,
        });
        touchSession(activeSession());
        persistState();
        showToast(`${name}已带着压缩记忆入席`);
      } catch (error) {
        showToast(humanizeError(error, "主创入席失败"));
      } finally {
        endImport(sessionId, memberId);
        render();
      }
      return;
    }
    const rt = roundtableState();
    const existingId = Object.entries(rt.assistantConfigs || {}).find(([, config]) => (
      config?.importedFrom?.sessionId === source.id
      && config?.importedFrom?.memberId === assistant.id
    ))?.[0];
    if (existingId && getRoundAssistantBase(existingId)) {
      if (!rt.selectedIds.includes(existingId)) {
        rt.selectedIds.push(existingId);
      }
      touchSession(activeSession());
      render();
      persistState();
      return showToast("这位议员已经在当前圆桌");
    }
    const name = uniqueRoundAssistantName(assistant.name, titleForSession(source));
    beginImport(sessionId, memberId);
    render();
    showToast(`${assistant.name}正在读取来源会话记忆`);
    let compressedText = "";
    try {
      compressedText = await compressSourceSessionMemoryForClone(source, assistant);
    } catch (error) {
      showToast(humanizeError(error, "来源记忆读取失败"));
      compressedText = summarizeSourceSessionForClone(source, assistant);
    } finally {
      endImport(sessionId, memberId);
    }
    const importedPrompt = clean(assistant.prompt) || DEFAULT_CUSTOM_ROUNDTABLE_ASSISTANT_PROMPT;
    const api = apiSettings();
    const creator = createCreatorIdentity({
      name,
      prompt: importedPrompt,
      avatarDataUrl: clean(assistant.avatarDataUrl),
      activationProfile: clean(assistant.activationProfile),
      modelConfig: {
        providerId: clean(assistant.providerId) || api.currentProviderId,
        baseUrl: clean(assistant.apiBaseUrl) || api.baseUrl,
        model: clean(assistant.model) || sessionSettings(source).model,
        maxTokens: Number(assistant.maxTokens) || sessionSettings(source).maxTokens,
        temperature: Number.isFinite(Number(assistant.temperature)) ? Number(assistant.temperature) : sessionSettings(source).temperature,
        contextTokenBudget: Number(assistant.contextTokenBudget) || api.contextTokenBudget,
      },
      memory: {
        displayName: `${name}记忆`,
        compressedSnapshots: normalizeAssistantMemories([
          ...normalizeAssistantMemories(assistant.memories),
          {
            id: uid("memory"),
            text: compressedText,
            source: "source-session-import",
            sourceSessionId: source.id,
            sourceCreatorId: clean(assistant.id) || clean(source.creatorId),
            createdAt: Date.now(),
          },
        ]),
      },
    });
    saveCreatorIdentity(creator);
    const config = createRoundAssistantConfigView(assistant, sessionSettings(source).temperature) || {};
    rt.assistantConfigs[creator.id] = {
      ...config,
      name,
      prompt: importedPrompt,
      memories: normalizeAssistantMemories(creator.memory?.compressedSnapshots),
      privateMessages: normalizeAssistantPrivateMessages(config.privateMessages),
      importedFrom: {
        sessionId: source.id,
        memberId: assistant.id,
        sessionTitle: titleForSession(source),
        importedAt: Date.now(),
      },
    };
    if (!rt.selectedIds.includes(creator.id)) rt.selectedIds.push(creator.id);
    rememberCreatorRoundtableJoin(creator.id, {
      sourceTitle: titleForSession(source),
    });
    touchSession(activeSession());
    render();
    persistState();
    showToast(`已拉入 ${name}`);
  }

  function buildMessages(assistant, instruction) {
    const instructionPayload = normalizeInstructionPayload(instruction);
    const state = getState();
    const rt = roundtableState();
    const options = normalizeRoundtableContextOptions({
      ...rt.contextOptions,
      ...(assistant.contextOptions || {}),
    });
    const memorySnippets = getCreatorMemorySnippets(assistant.id, instructionPayload.text, {
      includeRecent: true,
      limit: 8,
      sessionId: activeSession()?.id,
      roundtableId: activeSession()?.id,
    });
    const creatorRecords = memorySnippets.map((item) => ({
      topic: item.type,
      content: item.text,
      summary: item.text,
      createdAt: item.createdAt,
    }));
    const legacyRecords = getCouncilParticipationRecords(state.councilParticipationRecords, assistant.id, { limit: 6 });
    const participationRecords = creatorRecords.length ? creatorRecords : legacyRecords;
    const result = buildRoundtablePromptMessages({
      assistant,
      instruction: instructionPayload.text,
      options,
      mentionableAssistants: getRoundtableMentionableAssistants(),
      roundtableMessages: rt.messages,
      participationRecords: assistant.id === "writer" ? [] : participationRecords,
      novel: sessionNovel(),
      manuscriptText: getRoundtableManuscript(),
      mainChatText: getNovelSourceText(),
      tokenThreshold: getAssistantContextTokenThreshold(assistant),
    });
    if (result.compressed) {
      showToast("圆桌上下文过长，已自动压缩本轮材料");
    }
    if (instructionPayload.images.length && result.messages.length) {
      const last = result.messages[result.messages.length - 1];
      last.content = [
        { type: "text", text: last.content || instructionPayload.text },
        ...instructionPayload.images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } })),
      ];
    }
    return result.messages;
  }

  function normalizeInstructionPayload(instruction) {
    if (instruction && typeof instruction === "object" && !Array.isArray(instruction)) {
      const attachments = Array.isArray(instruction.attachments) ? instruction.attachments : [];
      return {
        text: clean(instruction.text),
        images: attachments
          .filter((item) => item?.kind === "image" && clean(item.dataUrl))
          .slice(0, 4)
          .map((item) => ({ name: clean(item.name), dataUrl: clean(item.dataUrl) })),
      };
    }
    return { text: clean(instruction), images: [] };
  }

  async function callAssistant(assistant, instruction, onChunk = null) {
    const instructionPayload = normalizeInstructionPayload(instruction);
    setRoundtableActiveSpeaker(assistant.id);
    try {
      try {
        await ensureAutoCompressNovelMemory(instructionPayload.text);
      } catch (error) {
        if (error.name === "AbortError") throw error;
        showToast(humanizeError(error, "圆桌自动压缩失败，已改用现有资料继续"));
      }
      const messages = buildMessages(assistant, instruction);
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
      if (getRoundtableActiveSpeaker() === assistant.id) setRoundtableActiveSpeaker(null);
    }
  }

  function prepareRoundProgress() {
    const rt = roundtableState();
    const primaryId = getPrimaryCreatorId();
    const selectedIds = Array.isArray(rt.selectedIds) ? rt.selectedIds : [];
    const activeIds = [
      ...(rt.primaryInRound === false ? [] : [primaryId]),
      ...selectedIds,
    ].filter(Boolean);
    const orderedIds = [
      ...(Array.isArray(rt.speakerOrderIds) ? rt.speakerOrderIds : []).filter((id) => activeIds.includes(id)),
      ...activeIds.filter((id) => !(Array.isArray(rt.speakerOrderIds) ? rt.speakerOrderIds : []).includes(id)),
    ];
    if (!orderedIds.length) {
      showToast("先在参会人里选择至少一个发言者");
      return false;
    }
    rt.speakerOrderIds = orderedIds;
    rt.roundProgress = createRoundProgress(orderedIds, rt.contextOptions?.roundTopic);
    return true;
  }

  async function runProgress(shouldStop) {
    const rt = roundtableState();
    const progress = rt.roundProgress;
    if (!progress?.ids?.length) return;
    for (let index = Number(progress.nextIndex) || 0; index < progress.ids.length; index += 1) {
      progress.nextIndex = index;
      progress.updatedAt = Date.now();
      if (shouldStop()) break;
      const id = progress.ids[index];
      const assistant = getRoundAssistant(id);
      if (!assistant) {
        progress.nextIndex = index + 1;
        continue;
      }
      showToast(`${assistant.name}正在发言`);
      const topic = clean(progress.topic || rt.contextOptions?.roundTopic);
      try {
        const instruction = [
          "请以参会议员身份发言：补充、质疑或修正前面的意见，只说最关键的一点和一个可执行建议。保持短句，不要替写手直接写正文。",
          buildRoundProgressInstruction(topic),
        ].join("\n");
        const { text } = await streamAssistantRoundtableReply(assistant, instruction);
        if (shouldStop()) break;
        const moved = moveRoundtableMentionsAfter(progress, index, text);
        if (moved.length) {
          showToast(`${moved.map((item) => item.name).join("、")}已加入后续发言`);
        }
      } catch (error) {
        if (error.name === "AbortError" || shouldStop()) break;
        addRoundtableFailureMessage(assistant, error);
      }
      progress.nextIndex = index + 1;
    }
    if (!shouldStop() && progress.nextIndex >= progress.ids.length) {
      rt.roundProgress = null;
      showToast("本轮圆桌已完成");
    }
  }

  async function generateMentionedAssistants(assistants, userText, shouldStop) {
    const targets = assistants.filter((assistant) => assistant.id !== "writer");
    if (!targets.length) return false;
    const userPayload = normalizeInstructionPayload(userText);
    try {
      for (const assistant of targets) {
        if (shouldStop()) break;
        showToast(`${assistant.name}正在回应`);
        try {
          await streamAssistantRoundtableReply(assistant, {
            text: `用户刚刚点名你发言：${userPayload.text}`,
            attachments: userPayload.images.map((image) => ({ ...image, kind: "image" })),
          });
          if (shouldStop()) break;
        } catch (error) {
          if (error.name === "AbortError" || shouldStop()) break;
          addRoundtableFailureMessage(assistant, error);
        }
      }
    } catch (error) {
      if (!shouldStop() && error.name !== "AbortError") {
        showToast(humanizeError(error, "点名发言失败"));
      }
    }
    return true;
  }

  async function runAssistantMentionFollowUps(originAssistant, originText, options = {}, shouldStop) {
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
    while (queue.length && remaining > 0 && !shouldStop()) {
      const { sourceAssistant: source, targetAssistant, sourceText } = queue.shift();
      queuedIds.delete(targetAssistant.id);
      visitedIds.add(targetAssistant.id);
      showToast(`${targetAssistant.name}被@，正在回应`);
      try {
        const instruction = buildAssistantMentionInstruction(source, targetAssistant, sourceText);
        const reply = await callAssistant(targetAssistant, instruction);
        if (shouldStop()) break;
        await addAssistantRoundtableReply(targetAssistant, reply, {
          mentionMeta: {
            triggeredById: source.id,
            triggeredByName: source.name,
          },
        }, instruction);
        remaining -= 1;
        currentAssistant = targetAssistant;
        currentText = cleanRoundtableAssistantOutput(targetAssistant, reply);
        enqueueTargets(currentAssistant, currentText);
      } catch (error) {
        if (error.name === "AbortError" || shouldStop()) break;
        addRoundtableFailureMessage(targetAssistant, error);
        break;
      }
    }
  }

  function closeRoundtableMembers(options = {}) {
    const rt = roundtableState();
    const hadMembers = Boolean(rt.membersOpen);
    rt.membersOpen = false;
    rt.materialsOpen = false;
    render();
    if (options.fromHistory) {
      setTransientHistoryOpen(false);
      return;
    }
    if (hadMembers && getTransientHistoryOpen() && history.state?.tbirdTransientOpen) {
      setTransientHistoryOpen(false);
      history.back();
    }
  }

  function toggleRoundtable() {
    const rt = roundtableState();
    if (!rt.enabled) {
      syncPrimaryCreatorIntoRoundtable();
      refreshWriterStyleCacheWithAi({ force: true, announce: true });
    }
    rt.enabled = !rt.enabled;
    rt.membersOpen = false;
    resetActiveMenus();
    closePanels();
    render();
    resizeInput();
    if (rt.enabled) showToast("已进入圆桌共创模式");
  }

  function setRoundtableEnabled(enabled, toastText = "") {
    const rt = roundtableState();
    if (rt.enabled === enabled) return;
    if (enabled) {
      syncPrimaryCreatorIntoRoundtable();
      refreshWriterStyleCacheWithAi({ force: true });
    }
    rt.enabled = enabled;
    rt.membersOpen = false;
    rt.materialsOpen = false;
    resetActiveMenus();
    closePanels();
    render();
    resizeInput();
    if (toastText) showToast(toastText);
  }

  function toggleRoundtableMembers() {
    const rt = roundtableState();
    if (rt.membersOpen) {
      closeRoundtableMembers();
      return;
    }
    rt.membersOpen = true;
    pushTransientHistory();
    render();
  }

  function toggleRoundtableMaterials() {
    const rt = roundtableState();
    rt.materialsOpen = !rt.materialsOpen;
    render();
  }

  function toggleRoundtableSessionImport() {
    const rt = roundtableState();
    rt.sessionImportOpen = !rt.sessionImportOpen;
    render();
  }

  function toggleRoundtableContextDock() {
    const rt = roundtableState();
    if (!rt.enabled) return;
    rt.contextOpen = !rt.contextOpen;
    render();
    resizeInput();
  }

  return {
    getSessionImportCandidates,
    isSessionMemberAlreadyImported,
    importKey,
    isImportPending,
    beginImport,
    endImport,
    summarizeSourceSessionForClone,
    compressSourceSessionMemoryForClone,
    attachSourcePrimaryCreatorForRoundtable,
    importMemberFromSession,
    buildMessages,
    callAssistant,
    prepareRoundProgress,
    runProgress,
    generateMentionedAssistants,
    runAssistantMentionFollowUps,
    closeRoundtableMembers,
    toggleRoundtable,
    setRoundtableEnabled,
    toggleRoundtableMembers,
    toggleRoundtableMaterials,
    toggleRoundtableSessionImport,
    toggleRoundtableContextDock,
  };
}
