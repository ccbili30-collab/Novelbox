package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

@Serializable
enum class Role { USER, ASSISTANT, SYSTEM }

@Serializable
data class ChatMessage(
    val id: String,
    val role: Role,
    val content: String,
    val createdAt: Long = System.currentTimeMillis(),
    /** True while a stream is appending to this message. */
    val streaming: Boolean = false,
    /** Optional error marker for failed assistant responses. */
    val failed: Boolean = false,
) {
    companion object {
        fun user(content: String) = ChatMessage(
            id = "u-${System.nanoTime()}",
            role = Role.USER,
            content = content,
        )
        fun assistantPlaceholder() = ChatMessage(
            id = "a-${System.nanoTime()}",
            role = Role.ASSISTANT,
            content = "",
            streaming = true,
        )
    }
}
