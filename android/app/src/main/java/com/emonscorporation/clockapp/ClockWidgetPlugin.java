package com.emonscorporation.clockapp;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ClockWidget")
public class ClockWidgetPlugin extends Plugin {

    /** The app shares the 24h/12h choice and the upcoming dates with the widgets. */
    @PluginMethod
    public void sync(PluginCall call) {
        Context c = getContext();
        ClockWidgetProvider.prefs(c).edit()
                .putString("fmt", call.getString("fmt", "24"))
                .putString("events", call.getString("events", "[]"))
                .apply();
        ClockWidgetProvider.redraw(c);
        call.resolve();
    }

    /** Asks Android to place a widget with the chosen design on the home screen. */
    @PluginMethod
    public void pin(PluginCall call) {
        Context c = getContext();
        ClockWidgetProvider.prefs(c).edit()
                .putString("pend_wg", call.getString("type", "blob"))
                .putBoolean("pend_tr", Boolean.TRUE.equals(call.getBoolean("transparent", false)))
                .putLong("pend_ts", System.currentTimeMillis())
                .putString("fmt", call.getString("fmt", "24"))
                .apply();

        boolean ok = false;
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        if (Build.VERSION.SDK_INT >= 26 && m.isRequestPinAppWidgetSupported()) {
            Class<?> k = Boolean.TRUE.equals(call.getBoolean("wide", false))
                    ? ClockWidgetWideProvider.class : ClockWidgetProvider.class;
            ok = m.requestPinAppWidget(new ComponentName(c, k), null, null);
        }
        JSObject r = new JSObject();
        r.put("requested", ok);
        call.resolve(r);
    }
}
