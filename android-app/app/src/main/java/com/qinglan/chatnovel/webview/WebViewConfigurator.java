package com.qinglan.chatnovel.webview;

import android.annotation.SuppressLint;
import android.os.Build;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.InputStream;

public class WebViewConfigurator {
    public static final String LOCAL_ORIGIN = "https://tbird.local";

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    public void configure(WebView webView, Object bridge, FileChooserHandler fileChooserHandler) {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.addJavascriptInterface(bridge, "AndroidBridge");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) {
                    return null;
                }
                if (!"tbird.local".equals(request.getUrl().getHost())) {
                    return null;
                }
                String path = request.getUrl().getPath();
                String assetPath = normalizeAssetPath(path);
                if (assetPath == null) {
                    return null;
                }
                try {
                    InputStream stream = view.getContext().getAssets().open(assetPath);
                    return new WebResourceResponse(mimeFor(assetPath), "UTF-8", stream);
                } catch (Exception ignored) {
                    return null;
                }
            }
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, android.webkit.ValueCallback<android.net.Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                return fileChooserHandler.handleShowFileChooser(filePathCallback, fileChooserParams);
            }
        });
    }

    private String normalizeAssetPath(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) {
            return "index.html";
        }
        String next = path.startsWith("/") ? path.substring(1) : path;
        if (next.contains("..") || next.startsWith(".")) {
            return null;
        }
        return next;
    }

    private String mimeFor(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }
}
