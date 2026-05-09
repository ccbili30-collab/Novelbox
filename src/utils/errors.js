export function humanizeError(error, fallback = "操作失败") {
  const raw = String(error?.message || error || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return fallback;
  if (lower.includes("param incorrect") || lower.includes("invalid parameter") || lower.includes("invalid param")) {
    return "接口参数不兼容：当前模型网关不接受这组请求参数。我已改为兼容模式，请重试。";
  }
  if (lower.includes("api key is required")) return "请先在设置里填写 API Key";
  if (lower.includes("model is required")) return "请先选择或填写模型";
  if (lower.includes("messages are required")) return "请求内容为空，请先输入或保存资料";
  if (lower.includes("timeout")) return "请求超时，请检查网络或模型服务";
  if (lower.includes("failed to fetch")) return "网络请求失败，请检查 Base URL、网络或代理";
  if (lower.includes("unauthorized") || lower.includes("401")) return "认证失败，请检查 API Key";
  if (lower.includes("forbidden") || lower.includes("403")) return "模型服务拒绝访问，请检查权限或模型名";
  return raw;
}
