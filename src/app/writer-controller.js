export function createWriterController({
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
  persistState,
  render,
  showToast,
  humanizeError,
  clean,
  simpleHash,
}) {
  function writerState(session = activeSession()) {
    session.writerState = session.writerState && typeof session.writerState === "object"
      ? session.writerState
      : {};
    session.writerState.styleCache = clean(session.writerState.styleCache);
    session.writerState.styleCacheUpdatedAt = Number(session.writerState.styleCacheUpdatedAt) || 0;
    session.writerState.styleCacheSourceHash = clean(session.writerState.styleCacheSourceHash);
    session.writerState.inheritingStyle = Boolean(session.writerState.inheritingStyle);
    session.writerState.modelOverride = session.writerState.modelOverride && typeof session.writerState.modelOverride === "object"
      ? session.writerState.modelOverride
      : {};
    return session.writerState;
  }

  function getWriterStyleSource(session = activeSession()) {
    const creator = getCreatorIdentity(getPrimaryCreatorId(session));
    const recentAssistantText = activePath(session)
      .filter((node) => node.role === "assistant")
      .map((node) => getMessageContent(node))
      .filter(Boolean)
      .slice(-8)
      .join("\n\n");
    const novel = sessionNovel(session);
    return [
      `主创：${creator?.name || "主创"}`,
      clean(creator?.prompt) ? `【主创提示词】\n${clean(creator.prompt)}` : "",
      clean(creator?.activationProfile) ? `【主创身份卡】\n${clean(creator.activationProfile)}` : "",
      clean(novel.body) ? `【当前正文】\n${clean(novel.body).slice(-1800)}` : "",
      clean(novel.plotline) ? `【剧情线】\n${clean(novel.plotline)}` : "",
      recentAssistantText ? `【最近主线输出】\n${recentAssistantText.slice(-2200)}` : "",
    ].filter(Boolean).join("\n\n");
  }

  function refreshWriterStyleCache(options = {}) {
    const session = activeSession();
    const ws = writerState(session);
    const source = getWriterStyleSource(session);
    const hash = simpleHash(source);
    if (!options.force && ws.styleCache && ws.styleCacheSourceHash === hash) return ws.styleCache;
    ws.inheritingStyle = true;
    const creator = getCreatorIdentity(getPrimaryCreatorId(session));
    const body = clean(sessionNovel(session).body);
    const recent = activePath(session)
      .filter((node) => node.role === "assistant")
      .map((node) => getMessageContent(node))
      .filter(Boolean)
      .slice(-3)
      .join("\n\n")
      .slice(-1200);
    ws.styleCache = [
      `写手继承对象：${creator?.name || "主创"}`,
      "写手是工具化文本整理机：只在被 @写手 或明确要求时输出正文/整理稿，不参与议员争论。",
      "延续主创已经建立的叙事偏好、节奏、视角、人物关系和禁忌，不擅自更换世界规则。",
      body ? `当前正文尾段风格依据：\n${body.slice(-900)}` : "",
      recent ? `最近主线表达依据：\n${recent}` : "",
    ].filter(Boolean).join("\n\n");
    ws.styleCacheUpdatedAt = Date.now();
    ws.styleCacheSourceHash = hash;
    ws.inheritingStyle = false;
    touchSession(session);
    if (options.announce) showToast("写手已继承当前主创文风");
    return ws.styleCache;
  }

  async function refreshWriterStyleCacheWithAi(options = {}) {
    const session = activeSession();
    const ws = writerState(session);
    const source = getWriterStyleSource(session);
    const hash = simpleHash(source);
    if (!options.force && ws.styleCache && ws.styleCacheSourceHash === hash) return ws.styleCache;
    ws.inheritingStyle = true;
    render();
    const creator = getCreatorIdentity(getPrimaryCreatorId(session));
    const prompt = [
      "请把以下小说创作上下文压缩成“写手文风继承卡”。",
      "这不是普通剧情摘要，而是给写手使用的工具化提示词。",
      "要求：用中文；提炼叙事视角、句式节奏、描写密度、人物对白习惯、情绪底色、禁忌、常用转场、正在延续的创作方向；保留少量必要剧情锚点；不要复述完整上下文；不要输出 JSON；不要解释过程。",
      `【继承对象】${creator?.name || "主创"}`,
      source,
    ].join("\n\n");
    try {
      const runtime = getPrimaryCreatorRuntimeConfig();
      const text = clean(await callCompressionModel(prompt, {
        ...runtime.settings,
        maxTokens: Math.max(1200, Number(runtime.settings.maxTokens) || 0),
      }, runtime.api));
      ws.styleCache = text || refreshWriterStyleCache({ force: true });
      ws.styleCacheUpdatedAt = Date.now();
      ws.styleCacheSourceHash = hash;
      ws.inheritingStyle = false;
      touchSession(session);
      persistState();
      if (options.announce) showToast("写手已压缩继承主创文风");
      render();
      return ws.styleCache;
    } catch (error) {
      const fallback = refreshWriterStyleCache({ force: true });
      ws.inheritingStyle = false;
      persistState();
      render();
      showToast(humanizeError(error, "AI 文风压缩失败，已改用本地文风卡"));
      return fallback;
    }
  }

  function applyWriterInheritance(writer) {
    const primaryRuntime = getPrimaryCreatorRuntimeConfig();
    const ws = writerState();
    const styleCache = ws.styleCache || refreshWriterStyleCache();
    const creator = primaryRuntime.creator;
    const inheritsModel = writer.inheritedModel !== false;
    return {
      ...writer,
      providerId: clean(writer.providerId) || clean(creator?.providerId),
      apiBaseUrl: clean(writer.apiBaseUrl) || clean(creator?.apiBaseUrl),
      apiKey: clean(writer.apiKey) || clean(creator?.apiKey),
      model: inheritsModel ? (clean(creator?.model) || clean(writer.model) || sessionSettings().model) : (clean(writer.model) || sessionSettings().model),
      maxTokens: inheritsModel ? (Number(creator?.maxTokens) || Number(writer.maxTokens) || sessionSettings().maxTokens) : (Number(writer.maxTokens) || sessionSettings().maxTokens),
      temperature: inheritsModel
        ? primaryRuntime.settings.temperature
        : Number.isFinite(Number(writer.temperature)) ? Number(writer.temperature) : primaryRuntime.settings.temperature,
      prompt: [
        clean(writer.prompt),
        styleCache ? `【继承的主创文风缓存】\n${styleCache}` : "【继承状态】正在继承文风；如果缓存为空，先依据当前主创提示词、正文和圆桌讨论保持风格一致。",
      ].filter(Boolean).join("\n\n"),
      inheritedModel: inheritsModel,
    };
  }

  async function generateWriterText(userText, shouldStop) {
    await refreshWriterStyleCacheWithAi();
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
    if (shouldStop()) return;
    const cleanText = cleanRoundtableAssistantOutput(writer, text);
    message.streaming = false;
    updateRoundtableMessageContent(message, cleanText);
    syncWriterMessageToNovel(message, cleanText);
    persistState();
    showToast("写手已更新正文，并同步到正文库");
  }

  return {
    writerState,
    getWriterStyleSource,
    refreshWriterStyleCache,
    refreshWriterStyleCacheWithAi,
    applyWriterInheritance,
    generateWriterText,
  };
}
