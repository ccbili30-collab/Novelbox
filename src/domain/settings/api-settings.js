import { uid } from "../../utils/id.js";

export function createApiProvider(overrides = {}) {
  const id = overrides.id || uid("provider");
  return {
    id,
    name: overrides.name || "默认提供方",
    baseUrl: overrides.baseUrl || "https://api.openai.com/v1",
    apiKey: overrides.apiKey || "",
    models: Array.isArray(overrides.models) && overrides.models.length
      ? Array.from(new Set(overrides.models.filter(Boolean)))
      : ["gpt-4o-mini"],
  };
}

export function createApiSettings() {
  const provider = createApiProvider({ id: "provider_default", name: "默认提供方" });
  return {
    currentProviderId: provider.id,
    providers: [provider],
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    models: provider.models,
    contextTokenBudget: 200000,
  };
}

export function hydrateApiSettings(api) {
  const next = { ...createApiSettings(), ...(api || {}) };
  const legacyProvider = createApiProvider({
    id: next.currentProviderId || "provider_default",
    name: next.providerName || "默认提供方",
    baseUrl: next.baseUrl,
    apiKey: next.apiKey,
    models: next.models,
  });
  next.providers = Array.isArray(next.providers) && next.providers.length
    ? next.providers.map((provider, index) => createApiProvider({
        ...provider,
        id: provider.id || (index === 0 ? "provider_default" : uid("provider")),
        name: provider.name || `提供方 ${index + 1}`,
      }))
    : [legacyProvider];
  next.currentProviderId = next.providers.some((provider) => provider.id === next.currentProviderId)
    ? next.currentProviderId
    : next.providers[0].id;
  const current = next.providers.find((provider) => provider.id === next.currentProviderId) || next.providers[0];
  next.baseUrl = current.baseUrl;
  next.apiKey = current.apiKey;
  next.models = current.models;
  next.models = Array.isArray(next.models) && next.models.length
    ? Array.from(new Set(next.models.filter(Boolean)))
    : ["gpt-4o-mini"];
  next.contextTokenBudget = Number(next.contextTokenBudget) || 200000;
  current.models = next.models;
  return next;
}
