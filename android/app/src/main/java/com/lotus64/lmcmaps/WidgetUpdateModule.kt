package com.lotus64.lmcmaps

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetUpdateModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    
    override fun getName(): String = "WidgetUpdateModule"
    
    @ReactMethod
    fun updateFavoritesWidgets() {
        try {
            val context = reactApplicationContext
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetComponent = ComponentName(context, FavoritesWidgetProvider::class.java)
            val appWidgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)
            
            if (appWidgetIds.isNotEmpty()) {
                val widgetProvider = FavoritesWidgetProvider()
                widgetProvider.onUpdate(context, appWidgetManager, appWidgetIds)
            }
        } catch (e: Exception) {
            // Silent fail - widget updates shouldn't crash the app
        }
    }
}
