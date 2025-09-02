package com.lotus64.lmcmaps

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class WidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_OPEN_APP = "com.lotus64.lmcmaps.ACTION_OPEN_APP"
        const val EXTRA_WIDGET_ACTION = "extra_widget_action"
        const val EXTRA_PAYLOAD = "extra_payload"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            // Try to obtain initial layout from provider info; fallback to a simple layout
            val provider = appWidgetManager.getAppWidgetInfo(appWidgetId)
            val layoutId = provider?.initialLayout ?: context.resources.getIdentifier("widget_favorite_single", "layout", context.packageName)

            val views = RemoteViews(context.packageName, layoutId)

            // Configure common click: open app main activity
            val openIntent = buildOpenAppIntent(context, mapOf("open" to "home"))
            val pi = PendingIntent.getActivity(context, appWidgetId, openIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            // Try to set click on root; many layouts use the root id 'widget_fav_single_title' or top-level views
            try {
                views.setOnClickPendingIntent(android.R.id.content, pi)
            } catch (e: Exception) {
                // Fallback: try specific ids commonly used in our layouts
                val candidates = listOf("widget_fav_single_title", "widget_map_preview", "widget_search_input", "widget_fav_item_1")
                for (idName in candidates) {
                    val rid = context.resources.getIdentifier(idName, "id", context.packageName)
                    if (rid != 0) {
                        try {
                            views.setOnClickPendingIntent(rid, pi)
                            break
                        } catch (ignored: Exception) {}
                    }
                }
            }

            // Example: for favorites dynamic, set click intents for each item if present
            val fav1 = context.resources.getIdentifier("widget_fav_item_1", "id", context.packageName)
            if (fav1 != 0) {
                val favIntent = buildOpenAppIntent(context, mapOf("open" to "favorite", "index" to "1"))
                val favPi = PendingIntent.getActivity(context, appWidgetId + 100, favIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                try { views.setOnClickPendingIntent(fav1, favPi) } catch (ignored: Exception) {}
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    private fun buildOpenAppIntent(context: Context, extras: Map<String, String>): Intent {
        // Use the app's deep link scheme declared in MainActivity intent-filter
        val uriBuilder = StringBuilder("com.lotus64.lmcmaps://widget")
        if (extras.isNotEmpty()) {
            uriBuilder.append("?")
            uriBuilder.append(extras.map { (k, v) -> "${k}=${Uri.encode(v)}" }.joinToString("&"))
        }
        val uri = Uri.parse(uriBuilder.toString())
        val intent = Intent(Intent.ACTION_VIEW, uri)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        return intent
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        // Future: handle widget button broadcasts (pause, next stop etc.)
    }
}
