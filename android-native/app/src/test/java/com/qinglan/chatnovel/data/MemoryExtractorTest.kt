package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.MemoryEntry
import com.qinglan.chatnovel.model.Persona
import com.qinglan.chatnovel.model.Role
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryExtractorTest {

    private val alice = Persona(id = "p", name = "Alice", roleLabel = "审稿")

    @Test fun `buildExtractionPrompt names the persona + role`() {
        val prompt = MemoryExtractor.buildExtractionPrompt(alice, emptyList())
        assertTrue(prompt.contains("Alice"))
        assertTrue(prompt.contains("审稿"))
        assertTrue(prompt.contains("最多 5 条"))
        // Marker line: existing memories placeholder.
        assertTrue(prompt.contains("已有记忆"))
        // History placeholder when no messages.
        assertTrue(prompt.contains("对话片段"))
        assertTrue(prompt.contains("（无）"))
    }

    @Test fun `buildExtractionPrompt lists existing memories so model avoids dupes`() {
        val p = alice.copy(memories = listOf(MemoryEntry.blank("已记：用户喜欢短句")))
        val prompt = MemoryExtractor.buildExtractionPrompt(p, emptyList())
        assertTrue(prompt.contains("- 已记：用户喜欢短句"))
    }

    @Test fun `buildExtractionPrompt renders the last 20 messages with speaker tags`() {
        val msgs = (1..25).map {
            ChatMessage(
                id = "m$it",
                role = if (it % 2 == 0) Role.ASSISTANT else Role.USER,
                content = "msg $it",
                speakerName = if (it % 2 == 0) "Alice" else null,
            )
        }
        val prompt = MemoryExtractor.buildExtractionPrompt(alice, msgs)
        // Only last 20 → msg 6..25 should be present, msg 1..5 should not.
        assertTrue(prompt.contains("msg 25"))
        assertTrue(prompt.contains("[Alice] msg 24"))
        assertTrue(!prompt.contains("msg 5\n") && !prompt.endsWith("msg 5"))
    }

    @Test fun `parseExtractedMemories pulls strings out of a JSON array`() {
        val out = MemoryExtractor.parseExtractedMemories(
            """["alpha", "beta", "gamma"]"""
        )
        assertEquals(listOf("alpha", "beta", "gamma"), out)
    }

    @Test fun `parseExtractedMemories tolerates surrounding chatter and code fences`() {
        val out = MemoryExtractor.parseExtractedMemories(
            """好的，以下是我的记忆：
            |```json
            |["第一条", "第二条"]
            |```
            |希望对你有帮助。
            """.trimMargin()
        )
        assertEquals(listOf("第一条", "第二条"), out)
    }

    @Test fun `parseExtractedMemories falls back to line splitting with bullets`() {
        val out = MemoryExtractor.parseExtractedMemories(
            """
            - 用户在塞尔本长大
            * 用户偏爱冷色调
            • 用户讨厌长句
            1. 用户作息很晚
            2) 用户讨厌排比
            """.trimIndent()
        )
        assertEquals(
            listOf(
                "用户在塞尔本长大",
                "用户偏爱冷色调",
                "用户讨厌长句",
                "用户作息很晚",
                "用户讨厌排比",
            ),
            out,
        )
    }

    @Test fun `parseExtractedMemories deduplicates case-insensitively + respects limit`() {
        val out = MemoryExtractor.parseExtractedMemories(
            """["Alice", "ALICE", "bob", "Carol", "dan", "eve", "fay"]""",
            maxMemories = 4,
        )
        assertEquals(listOf("Alice", "bob", "Carol", "dan"), out)
    }

    @Test fun `parseExtractedMemories returns empty for blank or empty array literal`() {
        assertEquals(emptyList<String>(), MemoryExtractor.parseExtractedMemories(""))
        assertEquals(emptyList<String>(), MemoryExtractor.parseExtractedMemories("   "))
        assertEquals(emptyList<String>(), MemoryExtractor.parseExtractedMemories("[]"))
    }

    @Test fun `dedupAgainst drops items already in the persona pool`() {
        val existing = listOf(
            MemoryEntry.blank("用户喜欢短句"),
            MemoryEntry.blank("用户讨厌长句"),
        )
        val candidates = listOf(
            "用户喜欢短句",      // dup
            "用户喜欢短句  ",     // dup (trim)
            "  用户讨厌长句",     // dup (trim)
            "用户作息很晚",      // new
        )
        val out = MemoryExtractor.dedupAgainst(existing, candidates)
        assertEquals(listOf("用户作息很晚"), out)
    }

    @Test fun `dedupAgainst within the candidate batch also dedupes`() {
        val out = MemoryExtractor.dedupAgainst(
            existing = emptyList(),
            candidates = listOf("Alpha", "alpha", "Beta", "  Alpha  "),
        )
        assertEquals(listOf("Alpha", "Beta"), out)
    }
}
