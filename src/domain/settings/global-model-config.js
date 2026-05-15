import { clean } from "../../utils/text.js";
import { hydrateModelDefaults } from "./api-settings.js";

export function globalModelConfigFromApi(api = {}) {
  const defaults = hydrateModelDefaults(api.modelDefaults, {
    model: Array.isArray(api.models) ? api.models[0] : "",
    contextTokenBudget: api.contextTokenBudget,
  });
  return {
    providerId: clean(api.currentProviderId),
    baseUrl: clean(api.baseUrl),
    model: clean(defaults.model) || "gpt-4o-mini",
    temperature: Number.isFinite(Number(defaults.temperature)) ? Number(defaults.temperature) : 0.8,
    contextCount: Number.isFinite(Number(defaults.contextCount)) ? Number(defaults.contextCount) : 12,
    unlimitedContext: Boolean(defaults.unlimitedContext),
    maxTokens: Number(defaults.maxTokens) || 2048,
    stream: defaults.stream === undefined ? true : Boolean(defaults.stream),
    contextTokenBudget: Number(api.contextTokenBudget) || Number(defaults.contextTokenBudget) || 200000,
  };
}

export function applyGlobalModelConfigToSession(session, config) {
  if (!session?.settings) return session;
  session.settings.model = config.model;
  session.settings.temperature = config.temperature;
  session.settings.contextCount = config.contextCount;
  session.settings.unlimitedContext = config.unlimitedContext;
  session.settings.maxTokens = config.maxTokens;
  session.settings.stream = config.stream;
  session.settings.streamTouched = true;
  return session;
}

export function applyGlobalModelConfigToCreator(creator, config) {
  if (!creator) return creator;
  creator.modelConfig = {
    ...(creator.modelConfig || {}),
    providerId: config.providerId,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    contextTokenBudget: config.contextTokenBudget,
  };
  creator.updatedAt = Date.now();
  return creator;
}

export function applyGlobalModelConfigToAssistantConfig(assistantConfig, config) {
  if (!assistantConfig || typeof assistantConfig !== "object") return assistantConfig;
  assistantConfig.providerId = config.providerId;
  assistantConfig.apiBaseUrl = "";
  assistantConfig.apiKey = "";
  assistantConfig.model = config.model;
  assistantConfig.temperature = config.temperature;
  assistantConfig.maxTokens = config.maxTokens;
  assistantConfig.contextTokenBudget = config.contextTokenBudget;
  return assistantConfig;
}
