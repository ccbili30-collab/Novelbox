package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.Session
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Single-session import/export helpers. Used by the (future) share /
 * file-picker glue layer; kept as a pure helper here so unit tests
 * can round-trip the JSON without touching the OS.
 *
 *   - exportSession: produces a pretty-printed JSON string for a
 *     single session.
 *   - importSession: best-effort parse of a previously exported
 *     session JSON. On corrupt input returns null.
 *   - exportAll / importAll: same, but list of sessions.
 */
object SessionTransfer {

    private val pretty = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
    }

    private val sessionListSerializer = ListSerializer(Session.serializer())

    fun exportSession(session: Session): String =
        pretty.encodeToString(Session.serializer(), session)

    fun importSession(jsonText: String): Session? = runCatching {
        pretty.decodeFromString(Session.serializer(), jsonText)
    }.getOrNull()

    fun exportAll(sessions: List<Session>): String =
        pretty.encodeToString(sessionListSerializer, sessions)

    fun importAll(jsonText: String): List<Session> = runCatching {
        pretty.decodeFromString(sessionListSerializer, jsonText)
    }.getOrDefault(emptyList())

    /** Generate a filesystem-safe filename for a session. */
    fun filenameFor(session: Session): String {
        val safe = session.title
            .replace(Regex("[\\\\/:*?\"<>|]"), "_")
            .replace(Regex("\\s+"), "_")
            .take(50)
            .ifBlank { "session" }
        return "$safe-${session.id}.json"
    }
}
