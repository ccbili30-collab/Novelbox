package com.qinglan.chatnovel.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RoundtableTest {

    private val alice  = Persona(id = "alice",  name = "Alice")
    private val bob    = Persona(id = "bob",    name = "Bob")
    private val carol  = Persona(id = "carol",  name = "Carol")
    private val xiao   = Persona(id = "xiao",   name = "小明")

    private val all = listOf(alice, bob, carol, xiao)

    @Test fun `parseMentions matches ASCII and CJK aliases case-insensitively`() {
        val text = "Hi @alice and @CAROL — also 你好 @小明"
        val hit = Roundtable.parseMentions(text, all)
        assertEquals(listOf(alice, carol, xiao), hit)
    }

    @Test fun `parseMentions ignores unknown handles`() {
        val text = "ping @dave please"
        val hit = Roundtable.parseMentions(text, all)
        assertTrue(hit.isEmpty())
    }

    @Test fun `parseMentions deduplicates while preserving first-mention order`() {
        val text = "@bob talk to @alice; @alice replies and @bob, again"
        val hit = Roundtable.parseMentions(text, all)
        assertEquals(listOf(bob, alice), hit)
    }

    @Test fun `parseMentions returns empty on empty inputs`() {
        assertTrue(Roundtable.parseMentions("", all).isEmpty())
        assertTrue(Roundtable.parseMentions("@alice", emptyList()).isEmpty())
    }

    @Test fun `reorderForMentions moves later speakers ahead of un-spoken ones`() {
        val order = listOf(alice, bob, carol)
        // Alice just spoke (index 0) and mentioned carol.
        val next = Roundtable.reorderForMentions(order, 0, listOf(carol))
        assertEquals(listOf(alice, carol, bob), next)
    }

    @Test fun `reorderForMentions ignores mentions of already-spoken personas`() {
        val order = listOf(alice, bob, carol)
        // Bob just spoke (index 1) and mentioned alice (already spoke).
        val next = Roundtable.reorderForMentions(order, 1, listOf(alice))
        assertEquals(listOf(alice, bob, carol), next)
    }

    @Test fun `reorderForMentions returns input unchanged when index out of range`() {
        val order = listOf(alice, bob)
        assertEquals(order, Roundtable.reorderForMentions(order, -1, listOf(bob)))
        assertEquals(order, Roundtable.reorderForMentions(order, 99, listOf(bob)))
    }

    @Test fun `composeSystemPrompt includes session prompt + persona prompt + turn hint`() {
        val sess = "整个会话风格保持冷峻克制。"
        val p = Persona(id = "p", name = "Plot", roleLabel = "剧情", prompt = "你只谈冲突与代价。")
        val msg = Roundtable.composeSystemPrompt(sess, p, roundIndex = 1, totalSpeakers = 3)
        assertTrue(msg.contains("整个会话风格保持冷峻克制"))
        assertTrue(msg.contains("Plot"))
        assertTrue(msg.contains("剧情"))
        assertTrue(msg.contains("你只谈冲突与代价"))
        assertTrue(msg.contains("第 2/3 位发言"))
    }

    @Test fun `composeSystemPrompt omits blank parts cleanly`() {
        val p = Persona(id = "p", name = "Plain")
        val msg = Roundtable.composeSystemPrompt("", p, roundIndex = 0, totalSpeakers = 1)
        // No leading empty section, no double blank lines.
        assertTrue(msg.startsWith("你扮演的角色是「Plain」"))
        assertTrue(!msg.contains("\n\n\n"))
    }
}
