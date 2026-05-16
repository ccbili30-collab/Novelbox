package com.qinglan.chatnovel.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryRetrievalTest {

    @Test fun `empty memory list returns empty`() {
        assertEquals(emptyList<MemoryEntry>(), MemoryRetrieval.pickRelevant(emptyList(), "x"))
    }

    @Test fun `limit cap is respected`() {
        val mem = (1..10).map { MemoryEntry.blank("entry $it") }
        val out = MemoryRetrieval.pickRelevant(mem, "", limit = 3)
        assertEquals(3, out.size)
    }

    @Test fun `pinned entries always win over high-overlap entries`() {
        val pinned = MemoryEntry(id = "p", content = "totally unrelated content", pinned = true)
        val matchy = MemoryEntry(id = "m", content = "this matches exactly the word coffee twice coffee", pinned = false)
        val out = MemoryRetrieval.pickRelevant(listOf(matchy, pinned), "coffee", limit = 1)
        assertEquals(listOf("p"), out.map { it.id })
    }

    @Test fun `ASCII substring scoring picks matching entries first`() {
        val a = MemoryEntry(id = "a", content = "I love coffee and tea", createdAt = 1)
        val b = MemoryEntry(id = "b", content = "unrelated text", createdAt = 2)
        val c = MemoryEntry(id = "c", content = "coffee coffee coffee", createdAt = 3)
        val out = MemoryRetrieval.pickRelevant(listOf(a, b, c), "coffee", limit = 2)
        // c has the highest count, a is next; b has none.
        assertEquals(listOf("c", "a"), out.map { it.id })
    }

    @Test fun `CJK 2-gram scoring works`() {
        val a = MemoryEntry(id = "a", content = "她喜欢吃苹果")
        val b = MemoryEntry(id = "b", content = "今天下雨了")
        val out = MemoryRetrieval.pickRelevant(listOf(a, b), "苹果", limit = 2)
        assertEquals("a", out.first().id)
    }

    @Test fun `empty query falls back to recency order`() {
        val a = MemoryEntry(id = "a", content = "old", createdAt = 1_000)
        val b = MemoryEntry(id = "b", content = "newer", createdAt = 5_000)
        val c = MemoryEntry(id = "c", content = "newest", createdAt = 9_000)
        val out = MemoryRetrieval.pickRelevant(listOf(a, b, c), "", limit = 2)
        assertEquals(listOf("c", "b"), out.map { it.id })
    }

    @Test fun `MemoryEntry blank factory yields unique ids`() {
        val a = MemoryEntry.blank("x")
        val b = MemoryEntry.blank("x")
        assertTrue(a.id != b.id)
        assertTrue(a.id.startsWith("m-"))
        assertEquals("x", a.content)
    }
}
