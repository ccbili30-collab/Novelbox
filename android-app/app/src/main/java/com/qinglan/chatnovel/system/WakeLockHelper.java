package com.qinglan.chatnovel.system;

import android.content.Context;
import android.os.PowerManager;

public class WakeLockHelper {
    private final Context context;
    private final long timeoutMs;
    private final String tag;

    public WakeLockHelper(Context context, long timeoutMs, String tag) {
        this.context = context;
        this.timeoutMs = timeoutMs;
        this.tag = tag;
    }

    public PowerManager.WakeLock acquire() {
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager == null) return null;
        PowerManager.WakeLock wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, tag);
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire(timeoutMs);
        return wakeLock;
    }

    public void release(PowerManager.WakeLock wakeLock) {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }
}
