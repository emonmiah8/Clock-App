package com.emonscorporation.clockapp;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.List;

/**
 * One receiver draws every widget. Each widget is the page assets/public/widget.html
 * (the same designs as the Widgets tab) rendered by an off-screen WebView into a bitmap.
 * Runs once a minute (alarm) and whenever Android or the app asks for a redraw.
 */
public class ClockWidgetProvider extends BroadcastReceiver {
    static final String PREFS = "clockwidget";
    static final String TICK = "com.emonscorporation.clockapp.WIDGET_TICK";
    static final String DEFAULT_DESIGN = "blob";
    static final long PENDING_MS = 10 * 60 * 1000L;

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void redraw(Context c) {
        c.sendBroadcast(new Intent(c, ClockWidgetProvider.class).setAction(TICK));
    }

    /** Next redraw at the start of the next minute; cancelled when no widget is left. */
    static void schedule(Context c, boolean on) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 1,
                new Intent(c, ClockWidgetProvider.class).setAction(TICK),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        if (!on) {
            am.cancel(pi);
            return;
        }
        long at = (System.currentTimeMillis() / 60000 + 1) * 60000 + 300;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi);
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC, at, pi);
            }
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC, at, pi);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        Context c = context.getApplicationContext();
        if (AppWidgetManager.ACTION_APPWIDGET_DELETED.equals(intent.getAction())) {
            int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1);
            prefs(c).edit().remove("wg_" + id).remove("tr_" + id).apply();
        }
        new Job(c, goAsync()).start();
    }

    private static final class Job {
        private final Context c;
        private final BroadcastReceiver.PendingResult pr;
        private final AppWidgetManager mgr;
        private final SharedPreferences sp;
        private final Handler main = new Handler(Looper.getMainLooper());
        private final List<Integer> ids = new ArrayList<>();
        private final Runnable late = this::shot;
        private WebView web;
        private PendingIntent open;
        private int curId, curW, curH, token;
        private boolean done, shotTaken;

        Job(Context c, BroadcastReceiver.PendingResult pr) {
            this.c = c;
            this.pr = pr;
            this.mgr = AppWidgetManager.getInstance(c);
            this.sp = prefs(c);
        }

        void start() {
            for (Class<?> k : new Class<?>[]{ClockWidgetProvider.class, ClockWidgetWideProvider.class}) {
                for (int id : mgr.getAppWidgetIds(new ComponentName(c, k))) ids.add(id);
            }
            schedule(c, !ids.isEmpty());
            if (ids.isEmpty()) {
                finish();
                return;
            }
            claim();
            Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (launch != null) {
                open = PendingIntent.getActivity(c, 0, launch,
                        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            }
            main.postDelayed(this::finish, 9000);
            try {
                web = makeWeb();
            } catch (Throwable t) {
                finish();
                return;
            }
            next();
        }

        /** A new widget takes the design chosen in the app a moment ago. */
        private void claim() {
            String pend = sp.getString("pend_wg", null);
            boolean fresh = System.currentTimeMillis() - sp.getLong("pend_ts", 0) < PENDING_MS;
            for (int id : ids) {
                if (sp.contains("wg_" + id)) continue;
                SharedPreferences.Editor e = sp.edit();
                if (pend != null && fresh) {
                    e.putString("wg_" + id, pend).putBoolean("tr_" + id, sp.getBoolean("pend_tr", false));
                    e.remove("pend_wg");
                    pend = null;
                } else {
                    e.putString("wg_" + id, DEFAULT_DESIGN).putBoolean("tr_" + id, false);
                }
                e.apply();
            }
        }

        private WebView makeWeb() {
            WebView v = new WebView(c);
            v.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            v.setBackgroundColor(0);
            v.setVerticalScrollBarEnabled(false);
            v.setHorizontalScrollBarEnabled(false);
            WebSettings s = v.getSettings();
            s.setJavaScriptEnabled(true);
            s.setAllowFileAccess(true);
            s.setMinimumFontSize(1);
            s.setMinimumLogicalFontSize(1);
            s.setTextZoom(100);
            v.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void ready(String t) {
                    main.post(() -> {
                        if (String.valueOf(token).equals(t)) shot();
                    });
                }
            }, "Native");
            v.onResume();
            v.dispatchWindowVisibilityChanged(View.VISIBLE);
            return v;
        }

        private void next() {
            if (done) return;
            if (ids.isEmpty()) {
                finish();
                return;
            }
            curId = ids.remove(0);
            shotTaken = false;
            token++;

            Bundle o = mgr.getAppWidgetOptions(curId);
            boolean land = c.getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            DisplayMetrics dm = c.getResources().getDisplayMetrics();
            float w = Math.max(60, o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                    : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)) * dm.density;
            float h = Math.max(60, o.getInt(land ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
                    : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 110)) * dm.density;
            float k = (float) Math.sqrt(2.5e6 / (w * h));   // keeps the bitmap small enough for a widget
            if (k < 1) {
                w *= k;
                h *= k;
            }
            curW = Math.round(w);
            curH = Math.round(h);
            web.measure(View.MeasureSpec.makeMeasureSpec(curW, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(curH, View.MeasureSpec.EXACTLY));
            web.layout(0, 0, curW, curH);

            Uri url = Uri.parse("file:///android_asset/public/widget.html").buildUpon()
                    .appendQueryParameter("wg", sp.getString("wg_" + curId, DEFAULT_DESIGN))
                    .appendQueryParameter("tr", sp.getBoolean("tr_" + curId, false) ? "1" : "0")
                    .appendQueryParameter("fmt", sp.getString("fmt", "24"))
                    .appendQueryParameter("ev", sp.getString("events", "[]"))
                    .appendQueryParameter("t", String.valueOf(token))
                    .build();
            web.loadUrl(url.toString());
            main.postDelayed(late, 6000);
        }

        private void shot() {
            if (done || shotTaken) return;
            shotTaken = true;
            main.removeCallbacks(late);
            try {
                Bitmap bmp = Bitmap.createBitmap(curW, curH, Bitmap.Config.ARGB_8888);
                web.draw(new Canvas(bmp));
                RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.clock_widget);
                rv.setImageViewBitmap(R.id.img, bmp);
                if (open != null) rv.setOnClickPendingIntent(R.id.root, open);
                mgr.updateAppWidget(curId, rv);
            } catch (Throwable ignored) {
                // this widget keeps its old picture until the next minute
            }
            next();
        }

        private void finish() {
            if (done) return;
            done = true;
            main.removeCallbacksAndMessages(null);
            if (web != null) {
                web.destroy();
                web = null;
            }
            pr.finish();
        }
    }
}
