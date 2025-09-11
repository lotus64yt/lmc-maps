package com.lotus64.lmcmaps

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

open class WidgetProvider : AppWidgetProvider() {

    companion object {
        const val ACTION_OPEN_APP = "com.lotus64.lmcmaps.ACTION_OPEN_APP"
        const val EXTRA_WIDGET_ACTION = "extra_widget_action"
        const val EXTRA_PAYLOAD = "extra_payload"
        const val FAVORITES_KEY = "lmc_favorites_v1"
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (appWidgetId in appWidgetIds) {
            // Try to obtain initial layout from provider info; fallback to a simple layout
            val provider = appWidgetManager.getAppWidgetInfo(appWidgetId)
            val layoutId = provider?.initialLayout ?: context.resources.getIdentifier("widget_favorite_single", "layout", context.packageName)

            val views = RemoteViews(context.packageName, layoutId)

            // Load favorites from AsyncStorage (SharedPreferences)
            val favorites = loadFavorites(context)
            updateFavoritesWidget(context, views, favorites)

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

            // Set click intents for favorite items
            for (i in 1..3) {
                val favItemId = context.resources.getIdentifier("widget_fav_item_$i", "id", context.packageName)
                if (favItemId != 0 && i <= favorites.size) {
                    val favorite = favorites[i - 1]
                    val favIntent = buildOpenAppIntent(context, mapOf(
                        "open" to "favorite",
                        "id" to favorite.id,
                        "title" to favorite.title,
                        "lat" to favorite.latitude.toString(),
                        "lng" to favorite.longitude.toString()
                    ))
                    val favPi = PendingIntent.getActivity(context, appWidgetId + i, favIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    try { views.setOnClickPendingIntent(favItemId, favPi) } catch (ignored: Exception) {}
                }
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    private fun loadFavorites(context: Context): List<FavoriteItem> {
        try {
            val prefs = context.getSharedPreferences("RKStorage", Context.MODE_PRIVATE)
            val favoritesJson = prefs.getString(FAVORITES_KEY, null)
            
            android.util.Log.d("WidgetProvider", "Loading favorites from SharedPreferences: $favoritesJson")
            
            if (favoritesJson == null) {
                android.util.Log.d("WidgetProvider", "No favorites found in SharedPreferences")
                return emptyList()
            }
            
            val jsonArray = JSONArray(favoritesJson)
            val favorites = mutableListOf<FavoriteItem>()
            
            android.util.Log.d("WidgetProvider", "Found ${jsonArray.length()} favorites in JSON")
            
            for (i in 0 until minOf(jsonArray.length(), 3)) {
                try {
                    val jsonObject = jsonArray.getJSONObject(i)
                    val favorite = FavoriteItem(
                        id = jsonObject.optString("id", ""),
                        title = jsonObject.optString("title", "Favori sans nom"),
                        subtitle = jsonObject.optString("subtitle", null),
                        latitude = jsonObject.optDouble("latitude", 0.0),
                        longitude = jsonObject.optDouble("longitude", 0.0)
                    )
                    favorites.add(favorite)
                    android.util.Log.d("WidgetProvider", "Added favorite: ${favorite.title}")
                } catch (e: Exception) {
                    android.util.Log.e("WidgetProvider", "Error parsing favorite at index $i", e)
                }
            }
            
            android.util.Log.d("WidgetProvider", "Returning ${favorites.size} favorites")
            return favorites
        } catch (e: Exception) {
            android.util.Log.e("WidgetProvider", "Error loading favorites", e)
            return emptyList()
        }
    }

    private fun updateFavoritesWidget(context: Context, views: RemoteViews, favorites: List<FavoriteItem>) {
        // Update header to show "LMC Maps Favoris"
        val headerResId = context.resources.getIdentifier("widget_fav_header", "id", context.packageName)
        if (headerResId != 0) {
            views.setTextViewText(headerResId, "LMC Maps Favoris")
        }

        // Update favorite items
        for (i in 1..3) {
            val favItemId = context.resources.getIdentifier("widget_fav_item_$i", "id", context.packageName)
            if (favItemId != 0) {
                if (i <= favorites.size) {
                    val favorite = favorites[i - 1]
                    val displayText = if (favorite.subtitle.isNullOrEmpty()) {
                        favorite.title
                    } else {
                        "${favorite.title}\n${favorite.subtitle}"
                    }
                    views.setTextViewText(favItemId, displayText)
                } else {
                    views.setTextViewText(favItemId, "—")
                }
            }
        }
    }

    data class FavoriteItem(
        val id: String,
        val title: String,
        val subtitle: String?,
        val latitude: Double,
        val longitude: Double
    )

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
