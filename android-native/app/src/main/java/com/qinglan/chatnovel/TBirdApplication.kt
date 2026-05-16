package com.qinglan.chatnovel

import android.app.Application
import com.qinglan.chatnovel.data.SettingsStore

/**
 * App-wide singletons. Kept deliberately small — Compose VMs own their
 * own dependencies, and the data layer (SettingsStore, ChatRepository)
 * is lazy and process-scoped so it survives configuration changes.
 */
class TBirdApplication : Application() {

    /** Lazy singletons exposed to the rest of the app. */
    val settingsStore: SettingsStore by lazy { SettingsStore(this) }

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
