import { uid } from "../../utils/id.js";
import { clean } from "../../utils/text.js";

export const CREATOR_STATE_SCHEMA_VERSION = 2;
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 200000;

export function createCreatorModelConfig(overrides = {}, defaults = {}) {
  return {
    providerId: clean(overrides.providerId) || clean(defaults.providerId),
    baseUrl: clean(overrides.baseUrl) || clean(defaults.baseUrl),
    model: clean(overrides.model) || clean(defaults.model) || "gpt-4o-mini",
    temperature: Number.isFinite(Number(overrides.temperature))
      ? Number(overrides.temperature)
      : Number.isFinite(Number(defaults.temperature))
        ? Number(defaults.temperature)
        : 0.8,
    maxTokens: Number(overrides.maxTokens) || Number(defaults.maxTokens) || 2048,
    contextTokenBudget: Number(overrides.contextTokenBudget)
      || Number(defaults.contextTokenBudget)
      || DEFAULT_CONTEXT_TOKEN_BUDGET,
  };
}

export function createCreatorIdentity(overrides = {}, defaults = {}) {
  const now = Date.now();
  const id = clean(overrides.id) || uid("creator");
  return {
    id,
    kind: "creator",
    name: clean(overrides.name) || clean(defaults.name) || "主创",
    avatarDataUrl: clean(overrides.avatarDataUrl),
    sourceTemplateId: clean(overrides.sourceTemplateId),
    sealedTemplateCode: clean(overrides.sealedTemplateCode),
    prompt: clean(overrides.prompt) || clean(defaults.prompt),
    activationProfile: clean(overrides.activationProfile),
    modelConfig: createCreatorModelConfig(overrides.modelConfig || {}, defaults.modelConfig || {}),
    memory: {
      displayName: clean(overrides.memory?.displayName) || clean(overrides.name) || clean(defaults.name) || "主创记忆",
      notes: clean(overrides.memory?.notes),
      compressedSnapshots: Array.isArray(overrides.memory?.compressedSnapshots)
        ? overrides.memory.compressedSnapshots.filter((item) => item && typeof item === "object")
        : [],
    },
    privateSessionId: clean(overrides.privateSessionId),
    createdAt: Number(overrides.createdAt) || now,
    updatedAt: Number(overrides.updatedAt) || now,
  };
}

export function hydrateCreatorIdentity(creator = {}, defaults = {}) {
  return createCreatorIdentity(creator, defaults);
}

export function hydrateCreators(creators = {}, defaults = {}) {
  const entries = creators && typeof creators === "object" ? Object.entries(creators) : [];
  return Object.fromEntries(entries
    .map(([, creator]) => hydrateCreatorIdentity(creator, defaults))
    .filter((creator) => creator.id)
    .map((creator) => [creator.id, creator]));
}

export function createCreatorFromLegacySession(session, input = {}) {
  const settings = input.settings || session?.settings || {};
  const api = input.api || {};
  const sealedTemplate = input.sealedTemplate || null;
  const legacyConfig = input.legacyConfig || {};
  const prompt = clean(sealedTemplate?.prompt) || clean(legacyConfig.prompt) || clean(settings.systemPrompt);
  const name = clean(legacyConfig.name)
    || clean(sealedTemplate?.name)
    || clean(settings.model)
    || clean(session?.title)
    || "主创";
  return createCreatorIdentity({
    id: clean(session?.creatorId) || uid("creator"),
    name,
    avatarDataUrl: clean(legacyConfig.avatarDataUrl),
    sourceTemplateId: clean(sealedTemplate?.id),
    sealedTemplateCode: clean(sealedTemplate?.code),
    prompt,
    activationProfile: clean(legacyConfig.activationProfile),
    modelConfig: {
      providerId: clean(legacyConfig.providerId) || clean(api.currentProviderId),
      baseUrl: clean(api.baseUrl),
      model: clean(legacyConfig.model) || clean(settings.model),
      temperature: Number.isFinite(Number(legacyConfig.temperature)) ? Number(legacyConfig.temperature) : Number(settings.temperature),
      maxTokens: Number(legacyConfig.maxTokens) || Number(settings.maxTokens),
      contextTokenBudget: Number(legacyConfig.contextTokenBudget) || Number(api.contextTokenBudget),
    },
    privateSessionId: clean(session?.id),
    createdAt: Number(session?.createdAt) || Date.now(),
    updatedAt: Number(session?.updatedAt) || Date.now(),
  });
}

export function creatorToAssistant(creator, api = {}, fallbackSettings = {}, contextOptions = {}) {
  if (!creator) return null;
  const modelConfig = createCreatorModelConfig(creator.modelConfig || {}, {
    providerId: api.currentProviderId,
    baseUrl: api.baseUrl,
    model: fallbackSettings.model,
    temperature: fallbackSettings.temperature,
    maxTokens: fallbackSettings.maxTokens,
    contextTokenBudget: api.contextTokenBudget,
  });
  return {
    id: creator.id,
    name: clean(creator.name) || "主创",
    role: "主创",
    prompt: clean(creator.prompt),
    providerId: clean(modelConfig.providerId),
    apiBaseUrl: clean(modelConfig.baseUrl || api.baseUrl),
    apiKey: clean(api.apiKey),
    model: clean(modelConfig.model),
    networkEnabled: false,
    maxTokens: Number(modelConfig.maxTokens) || 0,
    temperature: Number.isFinite(Number(modelConfig.temperature)) ? Number(modelConfig.temperature) : fallbackSettings.temperature,
    contextTokenBudget: Number(modelConfig.contextTokenBudget) || DEFAULT_CONTEXT_TOKEN_BUDGET,
    contextOptions,
    activationProfile: clean(creator.activationProfile),
    memories: Array.isArray(creator.memory?.compressedSnapshots) ? creator.memory.compressedSnapshots : [],
    avatarDataUrl: clean(creator.avatarDataUrl),
    sourceTemplateId: clean(creator.sourceTemplateId),
    sealedTemplateCode: clean(creator.sealedTemplateCode),
  };
}
