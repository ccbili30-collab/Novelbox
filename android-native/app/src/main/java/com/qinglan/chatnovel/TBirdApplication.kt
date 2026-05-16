package com.qinglan.chatnovel

import android.app.Application
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import java.io.File

/**
 * App-wide singletons. Kept deliberately small — Compose VMs own their
 * own dependencies, and the data layer (SettingsStore, SessionStore)
 * is lazy and process-scoped so it survives configuration changes.
 */
class TBirdApplication : Application() {

    /** Persisted user preferences (theme, API config). */
    val settingsStore: SettingsStore by lazy { SettingsStore(this) }

    /** Persisted chat history (sessions + messages). */
    val sessionStore: SessionStore by lazy {
        val file = File(filesDir, "sessions/sessions.json")
        SessionStore(file).also { it.load() }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        @Volatile private var instance: TBirdApplication? = null
        fun get(): TBirdApplication = instance
            ?: error("TBirdApplication not yet created — called from a non-Android context?")
    }
}
