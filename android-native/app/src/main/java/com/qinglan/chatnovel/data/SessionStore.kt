package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.Session
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File

/**
 * JSON-on-disk persistence for the full session list. No SQL, no
 * annotation processor — the file fits comfortably in memory because
 * the UI only ever holds a single linear history (no branching, no
 * multimedia blobs).
 *
 * Public surface:
 *  - flow: a hot StateFlow<List<Session>> sorted by updatedAt desc.
 *  - activeId: persisted id of the session currently shown.
 *  - load(): reads the file once on startup.
 *  - save(...): mutate -> write back atomically (rename).
 *  - upsert / delete / setActive / newSession / rename helpers.
 *
 * Implementation notes:
 *  - All writes go through a Mutex to keep the on-disk file consistent.
 *  - Writes use a tmp file + rename so a crash mid-write can't truncate.
 *  - The store is constructable with an arbitrary [storeFile] so unit
 *    tests can target a tmp dir instead of the real app storage.
 */
class SessionStore(
    private val storeFile: File,
    private val json: Json = Json {
        prettyPrint = false
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    },
) {
    private val _sessions = MutableStateFlow<List<Session>>(emptyList())
    val sessions: StateFlow<List<Session>> = _sessions.asStateFlow()

    private val _activeId = MutableStateFlow<String?>(null)
    val activeId: StateFlow<String?> = _activeId.asStateFlow()

    private val writeLock = Mutex()
    private val serializer = ListSerializer(Session.serializer())

    /** Load from disk. Safe to call on startup; missing/corrupt file → empty. */
    fun load() {
        val list = try {
            if (!storeFile.exists()) emptyList()
            else json.decodeFromString(serializer, storeFile.readText())
        } catch (_: Throwable) {
            emptyList()
        }
        _sessions.value = list.sortedByDescending { it.updatedAt }
        // Restore the most recent as active by default.
        if (_activeId.value == null) _activeId.value = list.maxByOrNull { it.updatedAt }?.id
    }

    /** Sorted view: most-recently-updated first. */
    fun snapshot(): List<Session> = _sessions.value

    fun get(id: String): Session? = _sessions.value.firstOrNull { it.id == id }

    fun active(): Session? {
        val id = _activeId.value ?: return null
        return get(id)
    }

    suspend fun setActive(id: String?) {
        _activeId.value = id
    }

    /** Create a new empty session and make it active. Returns the session. */
    suspend fun newSession(): Session {
        val s = Session.newEmpty()
        upsert(s)
        setActive(s.id)
        return s
    }

    /** Rename + bump updatedAt. */
    suspend fun rename(id: String, title: String) {
        val cleaned = title.trim().ifEmpty { return }
        mutateOne(id) { it.copy(title = cleaned, updatedAt = System.currentTimeMillis()) }
    }

    /** Delete by id. If the deleted one was active, clear activeId. */
    suspend fun delete(id: String) {
        writeLock.withLock {
            val next = _sessions.value.filterNot { it.id == id }
            _sessions.value = next
            persist(next)
            if (_activeId.value == id) {
                _activeId.value = next.maxByOrNull { it.updatedAt }?.id
            }
        }
    }

    /** Insert-or-replace and rewrite disk. */
    suspend fun upsert(session: Session) {
        writeLock.withLock {
            val next = (_sessions.value.filterNot { it.id == session.id } + session)
                .sortedByDescending { it.updatedAt }
            _sessions.value = next
            persist(next)
        }
    }

    /**
     * Apply [transform] to every session matching [predicate]. Sessions
     * untouched stay where they are. Disk gets one write at the end.
     */
    suspend fun mutate(predicate: (Session) -> Boolean, transform: (Session) -> Session) {
        writeLock.withLock {
            val next = _sessions.value
                .map { if (predicate(it)) transform(it) else it }
                .sortedByDescending { it.updatedAt }
            _sessions.value = next
            persist(next)
        }
    }

    /** Convenience: re-use [mutate] with a single-id predicate. */
    suspend fun mutateOne(id: String, transform: (Session) -> Session) {
        mutate({ it.id == id }, transform)
    }

    private fun persist(list: List<Session>) {
        try {
            storeFile.parentFile?.mkdirs()
            val tmp = File(storeFile.parentFile ?: storeFile.absoluteFile.parentFile, storeFile.name + ".tmp")
            tmp.writeText(json.encodeToString(serializer, list))
            if (storeFile.exists()) storeFile.delete()
            tmp.renameTo(storeFile)
        } catch (_: Throwable) {
            // best-effort persist; the next mutation retries
        }
    }
}
