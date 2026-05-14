import { createCreatorIdentity } from "../domain/creator/creator-model.js";
import {
  normalizeAssistantMemories,
  normalizeRoundtableContextOptions,
} from "../domain/roundtable/roundtable-model.js";

export function createAssistantController({
  clean,
  uid,
  sessionSettings,
  roundtableState,
  getCouncilParticipationRecords,
  formatTime,
}) {
  function normalizePrivateMessages(messages = []) {
    return Array.isArray(messages)
      ? messages
        .filter((message) => message && ["user", "assistant"].includes(message.role) && clean(message.content))
        .map((message) => ({
          id: clean(message.id) || uid("private"),
          role: message.role,
          content: clean(message.content),
          createdAt: Number(message.createdAt) || Date.now(),
        }))
        .slice(-40)
      : [];
  }

  function createPersonaPayload(config, assistantId = "") {
    return {
      type: "tbird-council-persona",
      version: 1,
      exportedAt: Date.now(),
      assistantId: assistantId || "",
      config: {
        name: clean(config.name),
        providerId: clean(config.providerId),
        model: clean(config.model),
        networkEnabled: Boolean(config.networkEnabled),
        maxTokens: Number(config.maxTokens) || 0,
        temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : sessionSettings().temperature,
        contextOptions: normalizeRoundtableContextOptions(config.contextOptions),
        activationProfile: clean(config.activationProfile),
        memories: normalizeAssistantMemories(config.memories),
        avatarDataUrl: clean(config.avatarDataUrl),
        prompt: clean(config.prompt),
      },
    };
  }

  function formatPersonaText(payload) {
    const config = payload.config || {};
    const context = normalizeRoundtableContextOptions(config.contextOptions);
    const readableContext = [
      context.includeManuscript ? "正文" : "",
      context.includeMainChat ? "主线对话" : "",
      context.includeDiscussion ? "圆桌记录" : "",
      context.includePlotline ? "剧情线" : "",
      context.includeCharacters ? "角色卡" : "",
      context.includeWorld ? "世界观" : "",
      context.includeOutline ? "大纲" : "",
      context.includeForeshadows ? "伏笔" : "",
    ].filter(Boolean).join("、") || "无";
    return [
      "TBIRD-COUNCIL-PERSONA v1",
      `名称: ${config.name || "未命名议员"}`,
      `模型: ${config.model || "跟随默认"}`,
      `模型自带联网: ${config.networkEnabled ? "允许" : "不允许"}`,
      `温度: ${Number.isFinite(Number(config.temperature)) ? Number(config.temperature).toFixed(2) : "跟随默认"}`,
      `阅读范围: ${readableContext}`,
      `正文读取字数: ${context.excerptMax}`,
      `圆桌记录条数: ${context.discussionCount}`,
      "",
      "--- 角色提示词 ---",
      config.prompt || "",
      "",
      "--- 演员身份卡 ---",
      config.activationProfile || "",
      "",
      "--- 记忆 ---",
      config.memories?.length ? config.memories.map((item) => `- ${item.text}`).join("\n") : "无",
      "",
      "--- TBIRD JSON ---",
      JSON.stringify(payload, null, 2),
      "--- END TBIRD JSON ---",
    ].join("\n");
  }

  function parsePersonaPayload(text) {
    const source = clean(text);
    if (!source) throw new Error("导入内容为空");
    try {
      return JSON.parse(source);
    } catch {}
    const match = source.match(/--- TBIRD JSON ---\s*([\s\S]*?)\s*--- END TBIRD JSON ---/);
    if (!match) throw new Error("没有找到 TBird 议员人格数据块");
    return JSON.parse(match[1]);
  }

  function extractPersonaConfigs(payload) {
    if (Array.isArray(payload)) return payload.map((item) => item?.config || item).filter(Boolean);
    if (Array.isArray(payload?.personas)) return payload.personas.map((item) => item?.config || item).filter(Boolean);
    if (payload?.config) return [payload.config];
    return payload ? [payload] : [];
  }

  function parsePersonaConfigs(text) {
    return extractPersonaConfigs(parsePersonaPayload(text));
  }

  function parsePersonaText(text) {
    const config = parsePersonaConfigs(text)[0];
    if (!config) throw new Error("没有找到可导入的议员人格");
    return config;
  }

  function formatPersonaBundleText(personas) {
    const payload = {
      type: "tbird-council-persona-bundle",
      version: 1,
      exportedAt: Date.now(),
      personas,
    };
    return [
      "TBIRD-COUNCIL-PERSONA-BUNDLE v1",
      `数量: ${personas.length}`,
      "",
      personas.map((persona, index) => `${index + 1}. ${persona.config?.name || "未命名议员"}`).join("\n"),
      "",
      "--- TBIRD JSON ---",
      JSON.stringify(payload, null, 2),
      "--- END TBIRD JSON ---",
    ].join("\n");
  }

  function buildPrivateChatMessages(assistant, config, userText, history = null) {
    const records = getCouncilParticipationRecords(assistant.id, { limit: 8 })
      .map((record) => `- ${formatTime(record.createdAt)}｜${record.topic || "无主题"}｜${record.content}`)
      .join("\n");
    const privateMessages = normalizePrivateMessages(history || roundtableState().assistantConfigs[assistant.id]?.privateMessages)
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content }));
    const context = [
      `你正在和用户进行议员私聊。你是${assistant.name}，这段私聊不会自动进入主线对话。`,
      "请保持你的主创人格和独立判断。默认短答，除非用户要求展开。",
      clean(config.activationProfile) ? `【身份卡】\n${clean(config.activationProfile)}` : "",
      clean(assistant.prompt) ? `【角色提示】\n${clean(assistant.prompt)}` : "",
      records ? `【最近参会记录】\n${records}` : "",
    ].filter(Boolean).join("\n\n");
    return [
      { role: "system", content: context },
      ...privateMessages,
      { role: "user", content: userText },
    ];
  }

  function buildActivationMessages(base, config, context = {}) {
    const options = normalizeRoundtableContextOptions(config.contextOptions);
    const discussionCount = Math.min(options.discussionCount || context.defaultDiscussionCount || 12, 12);
    const discussion = options.includeDiscussion
      ? (context.roundtableMessages || [])
        .slice(-discussionCount)
        .map((message) => `${message.speakerName}：${message.content}`)
        .join("\n")
      : "";
    const sections = [
      `【要激活的议员】${config.name || base.name}（${base.role || "议员"}）`,
      `【原始职责提示词】\n${config.prompt || base.prompt}`,
      options.includeManuscript ? `【当前正文】\n${context.manuscriptExcerpt || ""}` : "",
      context.novelMaterials ? `【小说材料】\n${context.novelMaterials}` : "",
      options.includeMainChat ? `【主线对话】\n${context.mainChatText || "暂无主线对话。"}` : "",
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

  function createCreatorFromPersonaConfig(config, api) {
    const name = clean(config?.name);
    const prompt = clean(config?.prompt);
    if (!name || !prompt) return null;
    return createCreatorIdentity({
      name,
      prompt,
      avatarDataUrl: clean(config.avatarDataUrl),
      activationProfile: clean(config.activationProfile),
      modelConfig: {
        providerId: clean(config.providerId) || api.currentProviderId,
        baseUrl: api.baseUrl,
        model: clean(config.model) || sessionSettings().model,
        maxTokens: Number(config.maxTokens) || sessionSettings().maxTokens,
        temperature: Number.isFinite(Number(config.temperature)) ? Number(config.temperature) : sessionSettings().temperature,
        contextTokenBudget: api.contextTokenBudget,
      },
      memory: {
        displayName: `${name}记忆`,
        compressedSnapshots: normalizeAssistantMemories(config.memories),
      },
    });
  }

  function createAssistantConfigFromPersonaConfig(config, creator) {
    if (!creator) return null;
    return {
      name: creator.name,
      providerId: creator.modelConfig.providerId,
      model: creator.modelConfig.model,
      networkEnabled: Boolean(config.networkEnabled),
      maxTokens: creator.modelConfig.maxTokens,
      temperature: creator.modelConfig.temperature,
      contextOptions: normalizeRoundtableContextOptions(config.contextOptions),
      activationProfile: clean(config.activationProfile),
      memories: normalizeAssistantMemories(config.memories),
      avatarDataUrl: creator.avatarDataUrl,
      prompt: creator.prompt,
    };
  }

  function createImportedPersonaSeat(config, api) {
    const creator = createCreatorFromPersonaConfig(config, api);
    if (!creator) return null;
    return {
      creator,
      assistantConfig: createAssistantConfigFromPersonaConfig(config, creator),
    };
  }

  function buildCreatorIdentitySave({ creatorIdentity, base, formConfig, mode, apiContextTokenBudget }) {
    if (!creatorIdentity || !base) return null;
    const creatorMode = mode === "creator";
    const modelOnlyMode = mode === "creator-model";
    const sealedCreator = Boolean(clean(creatorIdentity.sourceTemplateId));
    const modelConfig = { ...(creatorIdentity.modelConfig || {}) };
    if (modelOnlyMode || !creatorMode || sealedCreator) {
      modelConfig.providerId = clean(formConfig.providerId) || modelConfig.providerId;
      modelConfig.model = clean(formConfig.model) || modelConfig.model;
      modelConfig.maxTokens = Number(formConfig.maxTokens) || modelConfig.maxTokens || 0;
      modelConfig.contextTokenBudget = Number(formConfig.contextTokenBudget) || modelConfig.contextTokenBudget || apiContextTokenBudget;
      modelConfig.temperature = Number(formConfig.temperature);
    }
    return {
      ...creatorIdentity,
      name: modelOnlyMode ? creatorIdentity.name : (clean(formConfig.name) || creatorIdentity.name || base.name),
      avatarDataUrl: modelOnlyMode ? creatorIdentity.avatarDataUrl : clean(formConfig.avatarDataUrl),
      activationProfile: (sealedCreator || modelOnlyMode) ? creatorIdentity.activationProfile : clean(formConfig.activationProfile),
      prompt: (sealedCreator || modelOnlyMode) ? creatorIdentity.prompt : (clean(formConfig.prompt) || creatorIdentity.prompt || base.prompt),
      modelConfig,
      updatedAt: Date.now(),
    };
  }

  function buildLegacyAssistantSave({ id, base, previous = {}, formConfig, mode, sealedCreator = false }) {
    const creatorMode = mode === "creator";
    const modelOnlyMode = mode === "creator-model";
    const followsMainModel = creatorMode && !sealedCreator;
    const model = followsMainModel ? "" : clean(formConfig.model);
    return {
      id,
      config: {
        name: modelOnlyMode ? clean(previous.name) : clean(formConfig.name),
        providerId: followsMainModel ? "" : clean(formConfig.providerId),
        apiBaseUrl: "",
        apiKey: "",
        model,
        networkEnabled: Boolean(formConfig.networkEnabled),
        maxTokens: followsMainModel ? 0 : Number(formConfig.maxTokens) || 0,
        contextTokenBudget: followsMainModel ? 0 : Number(formConfig.contextTokenBudget) || 0,
        temperature: followsMainModel ? sessionSettings().temperature : Number(formConfig.temperature),
        contextOptions: modelOnlyMode ? normalizeRoundtableContextOptions(previous.contextOptions) : normalizeRoundtableContextOptions(formConfig.contextOptions),
        activationProfile: (sealedCreator || modelOnlyMode) ? clean(previous.activationProfile) : clean(formConfig.activationProfile),
        memories: normalizeAssistantMemories(previous.memories),
        privateMessages: normalizePrivateMessages(previous.privateMessages),
        importedFrom: previous.importedFrom,
        avatarDataUrl: modelOnlyMode ? clean(previous.avatarDataUrl) : clean(formConfig.avatarDataUrl),
        prompt: (sealedCreator || modelOnlyMode) ? (clean(previous.prompt) || base.prompt) : (clean(formConfig.prompt) || base.prompt),
        sealed: sealedCreator || previous.sealed,
      },
      modelToRemember: model,
    };
  }

  return {
    normalizePrivateMessages,
    createPersonaPayload,
    formatPersonaText,
    parsePersonaPayload,
    extractPersonaConfigs,
    parsePersonaConfigs,
    parsePersonaText,
    formatPersonaBundleText,
    buildPrivateChatMessages,
    buildActivationMessages,
    createCreatorFromPersonaConfig,
    createAssistantConfigFromPersonaConfig,
    createImportedPersonaSeat,
    buildCreatorIdentitySave,
    buildLegacyAssistantSave,
  };
}
