package com.qinglan.chatnovel.webview;

import android.app.Activity;
import android.content.ClipData;
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
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{
                "text/*",
                "application/json",
                "image/*"
        });
        try {
            activity.startActivityForResult(intent, requestCode);
        } catch (Exception error) {
            try {
                Intent fallback = params.createIntent();
                fallback.addCategory(Intent.CATEGORY_OPENABLE);
                activity.startActivityForResult(fallback, requestCode);
            } catch (Exception fallbackError) {
                filePathCallback = null;
                return false;
            }
        }
        return true;
    }

    public void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != this.requestCode || filePathCallback == null) return;
        Uri[] result = parseResult(resultCode, data);
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    private Uri[] parseResult(int resultCode, Intent data) {
        if (resultCode != Activity.RESULT_OK || data == null) return null;
        ClipData clipData = data.getClipData();
        if (clipData != null && clipData.getItemCount() > 0) {
            Uri[] uris = new Uri[clipData.getItemCount()];
            for (int index = 0; index < clipData.getItemCount(); index++) {
                uris[index] = clipData.getItemAt(index).getUri();
            }
            return uris;
        }
        Uri uri = data.getData();
        return uri == null ? null : new Uri[]{uri};
    }
}
