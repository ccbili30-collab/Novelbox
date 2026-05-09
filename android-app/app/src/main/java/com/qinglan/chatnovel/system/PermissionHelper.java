package com.qinglan.chatnovel.system;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;

public class PermissionHelper {
    private final Activity activity;
    private final int notificationPermissionRequestCode;

    public PermissionHelper(Activity activity, int notificationPermissionRequestCode) {
        this.activity = activity;
        this.notificationPermissionRequestCode = notificationPermissionRequestCode;
    }

    public void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, notificationPermissionRequestCode);
    }
}
