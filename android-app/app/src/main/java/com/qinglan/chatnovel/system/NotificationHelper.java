package com.qinglan.chatnovel.system;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import com.qinglan.chatnovel.MainActivity;

public class NotificationHelper {
    private final Context context;
    private final String channelId;
    private final int notificationId;

    public NotificationHelper(Context context, String channelId, int notificationId) {
        this.context = context;
        this.channelId = channelId;
        this.notificationId = notificationId;
    }

    public void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                channelId,
                "TBird 生成提示",
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("小说生成完成或失败时提醒");
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    public void postBackgroundNotification(boolean isInForeground, String title, String message) {
        if (isInForeground) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, pendingFlags);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(context, channelId)
                : new Notification.Builder(context);
        Notification notification = builder
                .setSmallIcon(android.R.drawable.stat_notify_more)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build();

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(notificationId, notification);
    }

    public String trimNotificationText(String text) {
        if (text == null) return "";
        String clean = text.replace('\n', ' ').replace('\r', ' ').trim();
        return clean.length() > 120 ? clean.substring(0, 120) + "..." : clean;
    }
}
