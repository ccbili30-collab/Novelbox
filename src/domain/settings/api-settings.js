export function createApiSettings() {
  return {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: ["gpt-4o-mini"],
  };
}

export function hydrateApiSettings(api) {
  const next = { ...createApiSettings(), ...(api || {}) };
  next.models = Array.isArray(next.models) && next.models.length
    ? Array.from(new Set(next.models.filter(Boolean)))
    : ["gpt-4o-mini"];
  return next;
}
