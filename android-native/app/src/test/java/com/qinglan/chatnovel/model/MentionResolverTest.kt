package com.qinglan.chatnovel.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MentionResolverTest {

    private val alice = Persona(id = "alice", name = "Alice", roleLabel = "审稿")
    private val arnold = Persona(id = "arnold", name = "Arnold", roleLabel = "剧情")
    private val xiaoming = Persona(id = "xm", name = "小明")
    private val all = listOf(alice, arnold, xiaoming)

    @Test fun `no caret-in-fragment returns null`() {
        assertNull(MentionResolver.activeMention("hello world", 5))
        assertNull(MentionResolver.activeMention("", 0))
    }

    @Test fun `caret right after @ returns empty partial`() {
        val frag = MentionResolver.activeMention("@", 1)
        assertNotNull(frag)
        assertEquals(0, frag!!.start)
        assertEquals(1, frag.end)
        assertEquals("", frag.partial)
    }

    @Test fun `caret inside ASCII fragment returns partial`() {
        val frag = MentionResolver.activeMention("hi @Ar there", 6) // caret after 'r'
        assertNotNull(frag)
        assertEquals(3, frag!!.start)
        assertEquals(6, frag.end)
        assertEquals("Ar", frag.partial)
    }

    @Test fun `caret inside CJK fragment returns partial`() {
        val frag = MentionResolver.activeMention("ping @小明 走", 8) // after 明
        assertNotNull(frag)
        assertEquals("小明", frag!!.partial)
    }

    @Test fun `whitespace before caret kills the fragment`() {
        assertNull(MentionResolver.activeMention("hello @foo bar", 14))
    }

    @Test fun `candidatesFor empty partial returns first N`() {
        val out = MentionResolver.candidatesFor(all, "", limit = 2)
        assertEquals(listOf(alice, arnold), out)
    }

    @Test fun `candidatesFor prefix match is case-insensitive`() {
        val out = MentionResolver.candidatesFor(all, "ar")
        assertEquals(listOf(arnold), out)
    }

    @Test fun `candidatesFor substring match works when no prefix matches`() {
        // 'no' does not prefix any name; substring should still find Arnold
        val out = MentionResolver.candidatesFor(all, "no")
        assertEquals(listOf(arnold), out)
    }

    @Test fun `candidatesFor returns empty on unknown partial`() {
        assertTrue(MentionResolver.candidatesFor(all, "zzz").isEmpty())
    }

    @Test fun `insertMention replaces fragment with at-name plus trailing space`() {
        val frag = MentionResolver.activeMention("hi @Ar there", 6)!!
        val ins = MentionResolver.insertMention("hi @Ar there", frag, arnold)
        assertEquals("hi @Arnold  there", ins.newText)
        // caret is positioned at the space after @Arnold.
        assertEquals("hi @Arnold ".length, ins.newCaret)
    }

    @Test fun `insertMention handles CJK names`() {
        val text = "ping @x 走"
        val frag = MentionResolver.activeMention(text, 7)!!
        val ins = MentionResolver.insertMention(text, frag, xiaoming)
        assertTrue("inserted: ${ins.newText}", ins.newText.startsWith("ping @小明 "))
    }
}
