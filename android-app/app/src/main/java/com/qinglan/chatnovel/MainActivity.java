package com.qinglan.chatnovel;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.qinglan.chatnovel.system.NotificationHelper;
import com.qinglan.chatnovel.system.PermissionHelper;
import com.qinglan.chatnovel.system.WakeLockHelper;
import com.qinglan.chatnovel.webview.FileChooserHandler;
import com.qinglan.chatnovel.webview.WebViewConfigurator;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 42;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 43;
    private static final int GENERATION_NOTIFICATION_ID = 1001;
    private static final long GENERATION_WAKE_LOCK_MS = 10 * 60 * 1000L;
    private static final String NOTIFICATION_CHANNEL_ID = "tbird_generation";
    private WebView webView;
    private boolean isInForeground = false;
    private NotificationHelper notificationHelper;
    private PermissionHelper permissionHelper;
    private WakeLockHelper wakeLockHelper;
    private FileChooserHandler fileChooserHandler;
    private WebViewConfigurator webViewConfigurator;
    private final Set<String> cancelledRequestIds = ConcurrentHashMap.newKeySet();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        webView = new WebView(this);
        setContentView(webView);
        notificationHelper = new NotificationHelper(this, NOTIFICATION_CHANNEL_ID, GENERATION_NOTIFICATION_ID);
        permissionHelper = new PermissionHelper(this, NOTIFICATION_PERMISSION_REQUEST);
        wakeLockHelper = new WakeLockHelper(this, GENERATION_WAKE_LOCK_MS, "TBird:Generation");
        fileChooserHandler = new FileChooserHandler(this, FILE_CHOOSER_REQUEST);
        webViewConfigurator = new WebViewConfigurator();
        notificationHelper.createChannel();
        permissionHelper.requestNotificationPermissionIfNeeded();
        configureWebView();
        webView.clearCache(true);
        webView.loadUrl(WebViewConfigurator.LOCAL_ORIGIN + "/index.html");
    }

    private void configureWebView() {
        webViewConfigurator.configure(webView, new AndroidBridge(), fileChooserHandler);
    }

    @Override
    protected void onResume() {
        super.onResume();
        isInForeground = true;
    }

    @Override
    protected void onPause() {
        isInForeground = false;
        super.onPause();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        fileChooserHandler.handleActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void cancelRequest(String requestId) {
            if (requestId == null || requestId.trim().isEmpty()) return;
            cancelledRequestIds.add(requestId);
        }

        @JavascriptInterface
        public String openAIChat(String rawPayload) {
            try {
                JSONObject payload = new JSONObject(rawPayload);
                String endpoint = normalizeOpenAIUrl(payload.optString("baseUrl", "https://api.openai.com/v1"));
                String apiKey = payload.optString("apiKey", "").trim();
                String model = payload.optString("model", "").trim();
                boolean minimal = payload.optBoolean("minimal", false);
                if (apiKey.isEmpty()) return bridgeError(400, "API Key is required");
                if (model.isEmpty()) return bridgeError(400, "Model is required");

                JSONObject body = new JSONObject();
                body.put("model", model);
                body.put("messages", payload.getJSONArray("messages"));
                if (!minimal && payload.has("temperature")) {
                    body.put("temperature", payload.optDouble("temperature", 0.8));
                }
                int maxTokens = payload.optInt("max_tokens", 0);
                if (!minimal && maxTokens > 0) body.put("max_tokens", maxTokens);

                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(120000);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                connection.setDoOutput(true);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String text = readAll(stream);
                if (status >= 200 && status < 300) return text;

                JSONObject errorPayload = parseOrWrapError(text);
                errorPayload.put("__bridgeStatus", status);
                return errorPayload.toString();
            } catch (Exception error) {
                return bridgeError(502, error.getMessage() == null ? "Android bridge request failed" : error.getMessage());
            }
        }

        @JavascriptInterface
        public void openAIChatAsync(String requestId, String rawPayload) {
            new Thread(() -> {
                PowerManager.WakeLock wakeLock = wakeLockHelper.acquire();
                String result = null;
                try {
                    result = openAIChat(rawPayload);
                    if (isRequestCancelled(requestId)) return;
                    deliverBridgeResult(requestId, result);
                    postChatNotification(result);
                } finally {
                    clearCancelledRequest(requestId);
                    wakeLockHelper.release(wakeLock);
                }
            }).start();
        }

        @JavascriptInterface
        public void openAIChatStreamAsync(String requestId, String rawPayload) {
            new Thread(() -> streamOpenAIChat(requestId, rawPayload)).start();
        }

        private boolean isRequestCancelled(String requestId) {
            return requestId != null && cancelledRequestIds.contains(requestId);
        }

        private void clearCancelledRequest(String requestId) {
            if (requestId != null) cancelledRequestIds.remove(requestId);
        }

        private void postChatNotification(String result) {
            try {
                JSONObject data = new JSONObject(result == null ? "" : result);
                if (data.optInt("__bridgeStatus", 200) >= 400 || data.has("error")) {
                    String message = data.optJSONObject("error") == null
                            ? "请求失败"
                            : data.getJSONObject("error").optString("message", "请求失败");
                    notificationHelper.postBackgroundNotification(isInForeground, "TBird 生成失败", notificationHelper.trimNotificationText(message));
                    return;
                }

                String content = "";
                if (data.has("choices") && data.getJSONArray("choices").length() > 0) {
                    JSONObject message = data.getJSONArray("choices")
                            .getJSONObject(0)
                            .optJSONObject("message");
                    if (message != null) content = message.optString("content", "");
                }
                if (content.isEmpty()) content = data.optString("content", "本次生成已完成");
                notificationHelper.postBackgroundNotification(isInForeground, "TBird 写完了", notificationHelper.trimNotificationText(content));
            } catch (Exception error) {
                notificationHelper.postBackgroundNotification(isInForeground, "TBird 写完了", "本次生成已完成");
            }
        }

        private void streamOpenAIChat(String requestId, String rawPayload) {
            PowerManager.WakeLock wakeLock = wakeLockHelper.acquire();
            StringBuilder content = new StringBuilder();
            JSONObject usage = null;
            try {
                JSONObject payload = new JSONObject(rawPayload);
                String endpoint = normalizeOpenAIUrl(payload.optString("baseUrl", "https://api.openai.com/v1"));
                String apiKey = payload.optString("apiKey", "").trim();
                String model = payload.optString("model", "").trim();
                if (apiKey.isEmpty()) throw new Exception("API Key is required");
                if (model.isEmpty()) throw new Exception("Model is required");

                JSONObject body = new JSONObject();
                body.put("model", model);
                body.put("messages", payload.getJSONArray("messages"));
                body.put("temperature", payload.optDouble("temperature", 0.8));
                int maxTokens = payload.optInt("max_tokens", 0);
                if (maxTokens > 0) body.put("max_tokens", maxTokens);
                body.put("stream", true);

                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(120000);
                connection.setRequestMethod("POST");
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Authorization", "Bearer " + apiKey);
                connection.setDoOutput(true);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                if (status < 200 || status >= 300) {
                    String message = parseOrWrapError(readAll(stream))
                            .getJSONObject("error")
                            .optString("message", "OpenAI-compatible request failed");
                    throw new Exception("HTTP " + status + ": " + message);
                }

                try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (isRequestCancelled(requestId)) return;
                        if (!line.startsWith("data:")) continue;
                        String dataText = line.substring(5).trim();
                        if (dataText.isEmpty() || "[DONE]".equals(dataText)) continue;
                        JSONObject data = new JSONObject(dataText);
                        if (data.has("usage") && !data.isNull("usage")) {
                            usage = data.getJSONObject("usage");
                        }
                        if (!data.has("choices") || data.getJSONArray("choices").length() == 0) continue;
                        JSONObject choice = data.getJSONArray("choices").getJSONObject(0);
                        JSONObject delta = choice.optJSONObject("delta");
                        String piece = "";
                        if (delta != null && delta.has("content") && !delta.isNull("content")) {
                            piece = delta.optString("content", "");
                        }
                        if (!piece.isEmpty()) {
                            content.append(piece);
                            if (!isRequestCancelled(requestId)) {
                                deliverBridgeStreamChunk(requestId, content.toString());
                            }
                        }
                    }
                }

                if (isRequestCancelled(requestId)) return;
                JSONObject meta = new JSONObject();
                meta.put("content", content.toString());
                if (usage != null) meta.put("usage", usage);
                deliverBridgeStreamDone(requestId, meta.toString());
                notificationHelper.postBackgroundNotification(isInForeground,
                        "TBird 写完了",
                        notificationHelper.trimNotificationText(content.length() > 0 ? content.toString() : "本次生成已完成")
                );
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Android bridge stream failed" : error.getMessage();
                if (!isRequestCancelled(requestId)) {
                    deliverBridgeStreamError(requestId, message);
                }
                if (isRequestCancelled(requestId)) return;
                notificationHelper.postBackgroundNotification(isInForeground, "TBird 生成失败", notificationHelper.trimNotificationText(message));
            } finally {
                clearCancelledRequest(requestId);
                wakeLockHelper.release(wakeLock);
            }
        }

        @JavascriptInterface
        public String openAIModels(String rawPayload) {
            try {
                JSONObject payload = new JSONObject(rawPayload);
                String endpoint = normalizeOpenAIModelsUrl(payload.optString("baseUrl", "https://api.openai.com/v1"));
                String apiKey = payload.optString("apiKey", "").trim();
                if (apiKey.isEmpty()) return bridgeError(400, "API Key is required");

                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(60000);
                connection.setRequestMethod("GET");
                connection.setRequestProperty("Authorization", "Bearer " + apiKey);

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String text = readAll(stream);
                if (status >= 200 && status < 300) return text;

                JSONObject errorPayload = parseOrWrapError(text);
                errorPayload.put("__bridgeStatus", status);
                return errorPayload.toString();
            } catch (Exception error) {
                return bridgeError(502, error.getMessage() == null ? "Android bridge models request failed" : error.getMessage());
            }
        }

        @JavascriptInterface
        public void openAIModelsAsync(String requestId, String rawPayload) {
            new Thread(() -> deliverBridgeResult(requestId, openAIModels(rawPayload))).start();
        }

        private void deliverBridgeResult(String requestId, String text) {
            runOnUiThread(() -> {
                if (webView == null) return;
                String script = "window.__qinglanBridgeResolve("
                        + JSONObject.quote(requestId)
                        + ","
                        + JSONObject.quote(text == null ? "" : text)
                        + ")";
                webView.evaluateJavascript(script, null);
            });
        }

        private void deliverBridgeStreamChunk(String requestId, String text) {
            runOnUiThread(() -> {
                if (webView == null) return;
                String script = "window.__qinglanBridgeStreamChunk("
                        + JSONObject.quote(requestId)
                        + ","
                        + JSONObject.quote(text == null ? "" : text)
                        + ")";
                webView.evaluateJavascript(script, null);
            });
        }

        private void deliverBridgeStreamDone(String requestId, String text) {
            runOnUiThread(() -> {
                if (webView == null) return;
                String script = "window.__qinglanBridgeStreamDone("
                        + JSONObject.quote(requestId)
                        + ","
                        + JSONObject.quote(text == null ? "" : text)
                        + ")";
                webView.evaluateJavascript(script, null);
            });
        }

        private void deliverBridgeStreamError(String requestId, String message) {
            runOnUiThread(() -> {
                if (webView == null) return;
                String script = "window.__qinglanBridgeStreamError("
                        + JSONObject.quote(requestId)
                        + ","
                        + JSONObject.quote(message == null ? "Android bridge stream failed" : message)
                        + ")";
                webView.evaluateJavascript(script, null);
            });
        }

        private String normalizeOpenAIUrl(String baseUrl) {
            String trimmed = baseUrl == null || baseUrl.trim().isEmpty()
                    ? "https://api.openai.com/v1"
                    : baseUrl.trim();
            while (trimmed.endsWith("/")) {
                trimmed = trimmed.substring(0, trimmed.length() - 1);
            }
            return trimmed.endsWith("/chat/completions") ? trimmed : trimmed + "/chat/completions";
        }

        private String normalizeOpenAIModelsUrl(String baseUrl) {
            String trimmed = baseUrl == null || baseUrl.trim().isEmpty()
                    ? "https://api.openai.com/v1"
                    : baseUrl.trim();
            while (trimmed.endsWith("/")) {
                trimmed = trimmed.substring(0, trimmed.length() - 1);
            }
            if (trimmed.endsWith("/chat/completions")) {
                trimmed = trimmed.substring(0, trimmed.length() - "/chat/completions".length());
            }
            return trimmed.endsWith("/models") ? trimmed : trimmed + "/models";
        }

        private String readAll(InputStream stream) throws Exception {
            if (stream == null) return "";
            StringBuilder builder = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    builder.append(line).append('\n');
                }
            }
            return builder.toString().trim();
        }

        private JSONObject parseOrWrapError(String text) throws Exception {
            try {
                return new JSONObject(text);
            } catch (Exception ignored) {
                JSONObject wrapper = new JSONObject();
                JSONObject error = new JSONObject();
                error.put("message", text == null || text.isEmpty() ? "OpenAI-compatible request failed" : text);
                wrapper.put("error", error);
                return wrapper;
            }
        }

        private String bridgeError(int status, String message) {
            try {
                JSONObject wrapper = new JSONObject();
                JSONObject error = new JSONObject();
                error.put("message", message);
                wrapper.put("error", error);
                wrapper.put("__bridgeStatus", status);
                return wrapper.toString();
            } catch (Exception ignored) {
                return "{\"__bridgeStatus\":502,\"error\":{\"message\":\"Android bridge request failed\"}}";
            }
        }
    }
}
