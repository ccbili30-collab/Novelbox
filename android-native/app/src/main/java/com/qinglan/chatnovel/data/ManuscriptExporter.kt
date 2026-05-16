package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.Session

/**
 * Pure helpers that turn a [Session]'s manuscript + chat history into
 * exported formats. All functions are pure: no IO, no DOM, fully
 * unit-testable.
 *
 *  - exportManuscriptMarkdown(session): manuscript-only Markdown with
 *    a YAML front-matter header (title + timestamps).
 *  - exportSessionMarkdown(session, personas): full session export —
 *    manuscript + chat transcript with each speaker labelled. Useful
 *    for sharing a finished round.
 *  - wordCount(text): a single pass counter that treats CJK chars as
 *    one word each + splits ASCII on whitespace runs. Visible in the
 *    UI as the manuscript word count.
 */
object ManuscriptExporter {

    fun exportManuscriptMarkdown(session: Session): String {
        val title = session.title.ifBlank { "Untitled session" }
        val updated = session.updatedAt
        val body = session.manuscript.trim()
        return buildString {
            appendLine("---")
            appendLine("title: \"${escapeFrontMatter(title)}\"")
            appendLine("created: $updated")
            appendLine("---")
            appendLine()
            appendLine("# $title")
            if (body.isNotEmpty()) {
                appendLine()
                appendLine(body)
            }
        }
    }

    fun exportSessionMarkdown(
        session: Session,
        speakerLabels: Map<String, String> = emptyMap(),
    ): String {
        val sb = StringBuilder(exportManuscriptMarkdown(session))
        if (session.messages.isEmpty()) return sb.toString()
        sb.appendLine()
        sb.appendLine("## Transcript")
        sb.appendLine()
        for (m in session.messages) {
            val who = when (m.role) {
                com.qinglan.chatnovel.model.Role.USER -> "**你**"
                com.qinglan.chatnovel.model.Role.ASSISTANT ->
                    "**${m.speakerName ?: speakerLabels[m.speakerId.orEmpty()] ?: "助理"}**"
                com.qinglan.chatnovel.model.Role.SYSTEM -> "_系统_"
            }
            sb.appendLine(who)
            sb.appendLine()
            sb.appendLine(m.content.trim())
            sb.appendLine()
        }
        return sb.toString()
    }

    /**
     * Count "words" in [text]:
     *  - each CJK ideograph counts as 1
     *  - ASCII runs split on whitespace each count as 1
     */
    fun wordCount(text: String): Int {
        if (text.isEmpty()) return 0
        var cjk = 0
        for (c in text) if (c.code in 0x4E00..0x9FFF) cjk += 1
        val asciiOnly = text.filter { it.code !in 0x4E00..0x9FFF }
        val ascii = asciiOnly
            .split(Regex("\\s+"))
            .count { it.isNotBlank() }
        return cjk + ascii
    }

    private fun escapeFrontMatter(text: String): String =
        text.replace("\\", "\\\\").replace("\"", "\\\"")
}
