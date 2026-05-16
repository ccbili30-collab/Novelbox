package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

@Serializable
enum class Role { USER, ASSISTANT, SYSTEM }

/**
 * A single message in a session's linear timeline.
 *
 * For ordinary chats only `role` + `content` matter. In roundtable
 * mode each assistant message also carries `speakerId` + `speakerName`
 * so the UI can render the speaker's name and tint the bubble by
 * persona.
 */
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
    /** Roundtable speaker id (null for plain user/single-assistant chat). */
    val speakerId: String? = null,
    /** Roundtable speaker display name. */
    val speakerName: String? = null,
) {
    companion object {
        fun user(content: String) = ChatMessage(
            id = "u-${System.nanoTime()}",
            role = Role.USER,
            content = content,
        )
        fun assistantPlaceholder(speakerId: String? = null, speakerName: String? = null) = ChatMessage(
            id = "a-${System.nanoTime()}",
            role = Role.ASSISTANT,
            content = "",
            streaming = true,
            speakerId = speakerId,
            speakerName = speakerName,
        )
    }
}
