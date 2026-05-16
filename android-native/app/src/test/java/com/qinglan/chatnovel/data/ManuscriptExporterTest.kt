package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Session
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManuscriptExporterTest {

    private val baseSession = Session(
        id = "s1",
        title = "塞尔本的冬天",
        manuscript = "第一章。\n\n冬天来了。",
        updatedAt = 1_700_000_000_000L,
    )

    @Test fun `manuscript Markdown carries YAML front-matter and body`() {
        val md = ManuscriptExporter.exportManuscriptMarkdown(baseSession)
        assertTrue(md.contains("---"))
        assertTrue(md.contains("title: \"塞尔本的冬天\""))
        assertTrue(md.contains("created: 1700000000000"))
        assertTrue(md.contains("# 塞尔本的冬天"))
        assertTrue(md.contains("第一章。"))
        assertTrue(md.contains("冬天来了。"))
    }

    @Test fun `manuscript Markdown handles blank title and body`() {
        val s = Session(id = "x", title = "", manuscript = "")
        val md = ManuscriptExporter.exportManuscriptMarkdown(s)
        assertTrue(md.contains("title: \"Untitled session\""))
        assertTrue(md.contains("# Untitled session"))
        assertTrue(!md.endsWith("\n\n\n\n"))
    }

    @Test fun `manuscript Markdown escapes quotes in title`() {
        val s = baseSession.copy(title = "she said \"hi\"")
        val md = ManuscriptExporter.exportManuscriptMarkdown(s)
        assertTrue(md.contains("title: \"she said \\\"hi\\\"\""))
    }

    @Test fun `session Markdown includes transcript with named speakers`() {
        val s = baseSession.copy(
            messages = listOf(
                ChatMessage(id = "u", role = Role.USER, content = "今天天气怎么样？"),
                ChatMessage(id = "a1", role = Role.ASSISTANT, content = "冷。", speakerName = "设定师"),
                ChatMessage(id = "a2", role = Role.ASSISTANT, content = "下雪了。"),
            ),
        )
        val md = ManuscriptExporter.exportSessionMarkdown(s)
        assertTrue(md.contains("## Transcript"))
        assertTrue(md.contains("**你**"))
        assertTrue(md.contains("**设定师**"))
        // Assistant with no speakerName falls back to "助理".
        assertTrue(md.contains("**助理**"))
        assertTrue(md.contains("今天天气怎么样？"))
        assertTrue(md.contains("冷。"))
        assertTrue(md.contains("下雪了。"))
    }

    @Test fun `session Markdown omits transcript section when no messages`() {
        val md = ManuscriptExporter.exportSessionMarkdown(baseSession)
        assertTrue(!md.contains("## Transcript"))
    }

    @Test fun `wordCount handles pure CJK`() {
        assertEquals(0, ManuscriptExporter.wordCount(""))
        assertEquals(4, ManuscriptExporter.wordCount("塞尔本的"))
    }

    @Test fun `wordCount handles pure ASCII`() {
        assertEquals(0, ManuscriptExporter.wordCount("   "))
        assertEquals(3, ManuscriptExporter.wordCount("hello  world\nfoo"))
    }

    @Test fun `wordCount handles mixed CJK plus ASCII`() {
        // "你好 world" → 2 CJK + 1 ASCII = 3
        assertEquals(3, ManuscriptExporter.wordCount("你好 world"))
    }

    @Test fun `wordCount treats punctuation-glued tokens as one token each`() {
        // Single ASCII token, no whitespace inside.
        assertEquals(1, ManuscriptExporter.wordCount("hi,"))
        // Two tokens with a space between.
        assertEquals(2, ManuscriptExporter.wordCount("hi, world"))
    }
}
