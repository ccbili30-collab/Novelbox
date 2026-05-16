package com.qinglan.chatnovel.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppPrefsTest {

    @Test fun `default prefs target OpenAI baseUrl`() {
        val d = AppPrefs.DEFAULT
        assertEquals(ThemeMode.SYSTEM, d.themeMode)
        assertTrue(d.dynamicColor)
        assertEquals("https://api.openai.com/v1", d.apiBaseUrl)
        assertEquals("", d.apiKey)
        assertEquals("gpt-4o-mini", d.modelId)
        assertTrue(d.streamResponses)
    }

    @Test fun `isApiReady requires key + base`() {
        assertFalse(AppPrefs.DEFAULT.isApiReady())
        val ok = AppPrefs.DEFAULT.copy(apiKey = "sk-x")
        assertTrue(ok.isApiReady())
        val noBase = AppPrefs.DEFAULT.copy(apiKey = "sk-x", apiBaseUrl = "")
        assertFalse(noBase.isApiReady())
    }
}
