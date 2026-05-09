export function estimateTokens(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  return Math.ceil(compact.length / 1.7);
}

export function formatK(tokens) {
  if (tokens >= 1000) return `${Math.round(tokens / 100) / 10}K`;
  return `${tokens}`;
}
