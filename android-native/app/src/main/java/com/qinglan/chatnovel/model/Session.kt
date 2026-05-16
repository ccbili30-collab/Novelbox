package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

/**
 * Per-session roundtable configuration. Lives inside [Session] so it
 * persists alongside the chat history.
 *
 *  - enabled: when true, the chat surface switches to multi-AI
 *    roundtable mode (the next user message triggers a round of
 *    sequential persona replies).
 *  - personaIds: ordered list of personas that will speak in this
 *    round. Order is the legacy "selected by number" order from the
 *    web app.
 *  - temperature: shared temperature for every persona this round
 *    (per-persona overrides land in Phase 6+ if needed).
 */
@Serializable
data class RoundtableConfig(
    val enabled: Boolean = false,
    val personaIds: List<String> = emptyList(),
    val temperature: Double = 0.7,
)

/**
 * A complete conversation. Persisted to disk via [SessionStore].
 *
 * `manuscript` is the long-form text region attached to a session —
 * the web app calls it "正文小窗 / paper". Users edit it directly or
 * have a writer persona produce prose that gets appended here.
 */
@Serializable
data class Session(
    val id: String,
    val title: String = "新会话",
    val systemPrompt: String = "",
    val messages: List<ChatMessage> = emptyList(),
    val manuscript: String = "",
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = createdAt,
    val roundtable: RoundtableConfig = RoundtableConfig(),
) {
    /** The first user message, trimmed to 40 chars, with a fallback. */
    fun deriveTitle(): String {
        val firstUserMessage = messages.firstOrNull { it.role == Role.USER }?.content
            ?.trim()
            ?.replace('\n', ' ')
        if (firstUserMessage.isNullOrEmpty()) return title
        return if (firstUserMessage.length <= 40) firstUserMessage
        else firstUserMessage.take(40) + "…"
    }

    companion object {
        fun newEmpty(): Session = Session(id = "s-${System.nanoTime()}")
    }
}
