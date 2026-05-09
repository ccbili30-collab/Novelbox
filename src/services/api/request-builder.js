export function buildChatPayload({ api, settings, messages, stream = false, minimal = false }) {
  const payload = {
    baseUrl: api.baseUrl,
    apiKey: api.apiKey,
    model: settings.model,
    messages,
  };
  if (stream) payload.stream = true;
  if (minimal) {
    payload.minimal = true;
    if (settings.temperature !== undefined) payload.temperature = settings.temperature;
    if (settings.maxTokens !== undefined) payload.max_tokens = Number(settings.maxTokens) || undefined;
    return payload;
  }
  payload.temperature = settings.temperature;
  payload.max_tokens = Number(settings.maxTokens) || undefined;
  return payload;
}
