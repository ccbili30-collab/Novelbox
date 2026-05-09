package com.qinglan.chatnovel.webview;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;

public class FileChooserHandler {
    private final Activity activity;
    private final int requestCode;
    private ValueCallback<Uri[]> filePathCallback;

    public FileChooserHandler(Activity activity, int requestCode) {
        this.activity = activity;
        this.requestCode = requestCode;
    }

    public boolean handleShowFileChooser(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        filePathCallback = callback;
        Intent intent = params.createIntent();
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        try {
            activity.startActivityForResult(intent, requestCode);
        } catch (Exception error) {
            filePathCallback = null;
            return false;
        }
        return true;
    }

    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != this.requestCode || filePathCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }
}
