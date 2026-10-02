package com.traillink;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/**
 * Foreground service that prevents Android from killing or throttling
 * network / WebRTC / Bluetooth threads when the app is temporarily backgrounded.
 */
public class KnightlineMatchService extends Service {
    public static final String ACTION_START = "com.traillink.START_MATCH_SERVICE";
    public static final String ACTION_STOP = "com.traillink.STOP_MATCH_SERVICE";
    private static final String CHANNEL_ID = "knightline_online_match";
    private static final int NOTIFICATION_ID = 4001;

    public static void start(Context context) {
        try {
            Intent intent = new Intent(context, KnightlineMatchService.class);
            intent.setAction(ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            android.util.Log.w("KnightlineService", "Failed to start match foreground service", e);
        }
    }

    public static void stop(Context context) {
        try {
            Intent intent = new Intent(context, KnightlineMatchService.class);
            intent.setAction(ACTION_STOP);
            context.stopService(intent);
        } catch (Exception e) {
            android.util.Log.w("KnightlineService", "Failed to stop match foreground service", e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            android.util.Log.w("KnightlineMatchService", "startForeground safely bypassed due to platform restrictions", e);
        }
        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Online Match",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Maintains connection for active online chess matches");
            channel.setShowBadge(false);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, KnightlineActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, launchIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Knightline")
                .setContentText("Match in progress")
                .setSmallIcon(com.eladbiller.knightline.R.drawable.icon)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_LOW);

        return builder.build();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
