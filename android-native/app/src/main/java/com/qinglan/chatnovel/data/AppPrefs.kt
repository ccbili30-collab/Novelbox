package com.qinglan.chatnovel.data

/** Theme mode the user picked (or 'follow system'). */
enum class ThemeMode { LIGHT, DARK, SYSTEM }

/**
 * Single snapshot of every preference the app reads on a typical
 * render pass. Owned by [SettingsStore]; the Flow surface is what
 * Composables observe.
 */
data class AppPrefs(
    val themeMode: ThemeMode = ThemeMode.SYSTEM,
    val dynamicColor: Boolean = true,
    val apiBaseUrl: String = "https://api.openai.com/v1",
    val apiKey: String = "",
    val modelId: String = "gpt-4o-mini",
    val streamResponses: Boolean = true,
) {
    fun isApiReady(): Boolean = apiKey.isNotBlank() && apiBaseUrl.isNotBlank()

    companion object {
        val DEFAULT = AppPrefs()
    }
}
