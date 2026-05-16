package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

/**
 * A complete conversation. Persisted to disk via [SessionStore].
 *
 * - id: stable identifier; not user-visible.
 * - title: derived from the first user message, editable later.
 * - systemPrompt: optional system message prepended to the API call.
 * - messages: full chat history (linear; no branching yet).
 * - createdAt / updatedAt: ms epoch, used for sort order.
 */
@Serializable
data class Session(
    val id: String,
    val title: String = "新会话",
    val systemPrompt: String = "",
    val messages: List<ChatMessage> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = createdAt,
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
