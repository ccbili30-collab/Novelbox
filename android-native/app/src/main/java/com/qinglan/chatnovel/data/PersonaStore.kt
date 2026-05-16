package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.Persona
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File

/**
 * JSON-on-disk persistence for the roundtable persona library. Same
 * design as [SessionStore]: tmp+rename atomic write, mutex-guarded,
 * Flow-based subscription. Seeds Persona.DEFAULTS the first time the
 * store loads from a missing file.
 */
class PersonaStore(
    private val storeFile: File,
    private val json: Json = Json {
        prettyPrint = false
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    },
    private val seedOnEmpty: Boolean = true,
) {
    private val _personas = MutableStateFlow<List<Persona>>(emptyList())
    val personas: StateFlow<List<Persona>> = _personas.asStateFlow()

    private val writeLock = Mutex()
    private val serializer = ListSerializer(Persona.serializer())

    /** Load from disk. Missing/corrupt file → seed defaults. */
    fun load() {
        val list = try {
            if (!storeFile.exists()) emptyList()
            else json.decodeFromString(serializer, storeFile.readText())
        } catch (_: Throwable) {
            emptyList()
        }
        _personas.value = if (list.isEmpty() && seedOnEmpty) Persona.DEFAULTS else list
        // Persist the seed on first launch so the user can edit it.
        if (list.isEmpty() && seedOnEmpty) persist(_personas.value)
    }

    fun snapshot(): List<Persona> = _personas.value
    fun get(id: String): Persona? = _personas.value.firstOrNull { it.id == id }

    suspend fun upsert(persona: Persona) {
        writeLock.withLock {
            val next = _personas.value
                .filterNot { it.id == persona.id }
                .plus(persona)
                .sortedBy { it.createdAt }
            _personas.value = next
            persist(next)
        }
    }

    suspend fun delete(id: String) {
        writeLock.withLock {
            val next = _personas.value.filterNot { it.id == id }
            _personas.value = next
            persist(next)
        }
    }

    suspend fun mutate(id: String, transform: (Persona) -> Persona) {
        writeLock.withLock {
            val next = _personas.value.map { if (it.id == id) transform(it) else it }
            _personas.value = next
            persist(next)
        }
    }

    private fun persist(list: List<Persona>) {
        try {
            storeFile.parentFile?.mkdirs()
            val tmp = File(storeFile.parentFile ?: storeFile.absoluteFile.parentFile, storeFile.name + ".tmp")
            tmp.writeText(json.encodeToString(serializer, list))
            if (storeFile.exists()) storeFile.delete()
            tmp.renameTo(storeFile)
        } catch (_: Throwable) {
            // best-effort persist
        }
    }
}
