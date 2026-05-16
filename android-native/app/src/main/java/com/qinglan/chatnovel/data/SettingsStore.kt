package com.qinglan.chatnovel.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "tbird-prefs")

private val KEY_THEME_MODE     = stringPreferencesKey("theme_mode")
private val KEY_DYNAMIC_COLOR  = booleanPreferencesKey("dynamic_color")
private val KEY_API_BASE       = stringPreferencesKey("api_base")
private val KEY_API_KEY        = stringPreferencesKey("api_key")
private val KEY_MODEL_ID       = stringPreferencesKey("model_id")
private val KEY_STREAM         = booleanPreferencesKey("stream")

/**
 * Persisted user preferences. Exposes a [Flow<AppPrefs>] for Compose
 * + a suspending [update] for write paths.
 */
class SettingsStore(context: Context) {
    private val ds = context.applicationContext.dataStore

    val flow: Flow<AppPrefs> = ds.data.map { p ->
        AppPrefs(
            themeMode = runCatching { ThemeMode.valueOf(p[KEY_THEME_MODE] ?: ThemeMode.SYSTEM.name) }
                .getOrDefault(ThemeMode.SYSTEM),
            dynamicColor = p[KEY_DYNAMIC_COLOR] ?: true,
            apiBaseUrl = p[KEY_API_BASE] ?: AppPrefs.DEFAULT.apiBaseUrl,
            apiKey = p[KEY_API_KEY] ?: "",
            modelId = p[KEY_MODEL_ID] ?: AppPrefs.DEFAULT.modelId,
            streamResponses = p[KEY_STREAM] ?: true,
        )
    }

    suspend fun update(transform: (AppPrefs) -> AppPrefs) {
        ds.edit { p ->
            val current = AppPrefs(
                themeMode = runCatching { ThemeMode.valueOf(p[KEY_THEME_MODE] ?: ThemeMode.SYSTEM.name) }
                    .getOrDefault(ThemeMode.SYSTEM),
                dynamicColor = p[KEY_DYNAMIC_COLOR] ?: true,
                apiBaseUrl = p[KEY_API_BASE] ?: AppPrefs.DEFAULT.apiBaseUrl,
                apiKey = p[KEY_API_KEY] ?: "",
                modelId = p[KEY_MODEL_ID] ?: AppPrefs.DEFAULT.modelId,
                streamResponses = p[KEY_STREAM] ?: true,
            )
            val next = transform(current)
            p[KEY_THEME_MODE] = next.themeMode.name
            p[KEY_DYNAMIC_COLOR] = next.dynamicColor
            p[KEY_API_BASE] = next.apiBaseUrl
            p[KEY_API_KEY] = next.apiKey
            p[KEY_MODEL_ID] = next.modelId
            p[KEY_STREAM] = next.streamResponses
        }
    }
}
