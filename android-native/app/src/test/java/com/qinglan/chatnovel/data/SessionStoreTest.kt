package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Session
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class SessionStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private lateinit var file: File
    private lateinit var store: SessionStore

    @Before fun setUp() {
        file = File(tmp.newFolder(), "sessions.json")
        store = SessionStore(file)
        store.load()
    }

    @Test fun `load on missing file yields empty list`() {
        assertTrue(store.snapshot().isEmpty())
        assertNull(store.activeId.value)
    }

    @Test fun `newSession persists and becomes active`() = runTest {
        val s = store.newSession()
        assertEquals(1, store.snapshot().size)
        assertEquals(s.id, store.activeId.value)
        assertTrue(file.exists())
        // Re-open + reload to confirm the json round-trips.
        val reborn = SessionStore(file)
        reborn.load()
        assertEquals(1, reborn.snapshot().size)
        assertEquals(s.id, reborn.snapshot().first().id)
    }

    @Test fun `upsert is idempotent + sorts by updatedAt desc`() = runTest {
        val a = Session(id = "a", updatedAt = 1)
        val b = Session(id = "b", updatedAt = 2)
        val c = Session(id = "c", updatedAt = 3)
        store.upsert(a); store.upsert(b); store.upsert(c)
        assertEquals(listOf("c", "b", "a"), store.snapshot().map { it.id })
        // Replace b with a newer timestamp; should jump to front.
        store.upsert(b.copy(updatedAt = 99))
        assertEquals(listOf("b", "c", "a"), store.snapshot().map { it.id })
        // Same b again — no duplicate.
        store.upsert(b.copy(updatedAt = 100, title = "renamed"))
        assertEquals(3, store.snapshot().size)
        assertEquals("renamed", store.snapshot().first { it.id == "b" }.title)
    }

    @Test fun `mutateOne updates only the matching session`() = runTest {
        val a = Session(id = "a", title = "alpha")
        val b = Session(id = "b", title = "beta")
        store.upsert(a); store.upsert(b)
        store.mutateOne("b") { it.copy(title = "BETA") }
        assertEquals("alpha", store.get("a")?.title)
        assertEquals("BETA", store.get("b")?.title)
    }

    @Test fun `delete keeps the rest and reassigns active`() = runTest {
        val a = store.newSession()
        val b = store.newSession()
        assertEquals(b.id, store.activeId.value)
        store.delete(b.id)
        assertEquals(1, store.snapshot().size)
        assertEquals(a.id, store.activeId.value)
    }

    @Test fun `rename trims input and rejects empty`() = runTest {
        val s = store.newSession()
        store.rename(s.id, "   hello   ")
        assertEquals("hello", store.get(s.id)?.title)
        store.rename(s.id, "   ")
        // empty: title unchanged
        assertEquals("hello", store.get(s.id)?.title)
    }

    @Test fun `setActive flips the active pointer`() = runTest {
        val a = store.newSession()
        val b = store.newSession()
        store.setActive(a.id)
        assertEquals(a.id, store.activeId.value)
        store.setActive(b.id)
        assertEquals(b.id, store.activeId.value)
    }

    @Test fun `Session deriveTitle picks first user message trimmed`() {
        val s = Session(
            id = "x",
            messages = listOf(
                ChatMessage(id = "1", role = Role.SYSTEM, content = "你是助手"),
                ChatMessage(id = "2", role = Role.USER, content = "  hello world\nnext line"),
            ),
        )
        // trim() removes both ends; '\n' is replaced by a single space.
        assertEquals("hello world next line", s.deriveTitle())
    }

    @Test fun `Session deriveTitle clips to 40 chars`() {
        val long = "我".repeat(80)
        val s = Session(
            id = "x",
            messages = listOf(ChatMessage(id = "1", role = Role.USER, content = long)),
        )
        val title = s.deriveTitle()
        assertEquals(41, title.length) // 40 chars + ellipsis
        assertTrue(title.endsWith("…"))
    }

    @Test fun `Session deriveTitle falls back to existing title when no user msg`() {
        val s = Session(id = "x", title = "保留", messages = emptyList())
        assertEquals("保留", s.deriveTitle())
    }

    @Test fun `corrupt json yields empty store, no throw`() {
        file.writeText("{not valid json")
        val store2 = SessionStore(file)
        store2.load()
        assertTrue(store2.snapshot().isEmpty())
    }

    @Test fun `search empty query returns full snapshot`() = runTest {
        store.upsert(Session(id = "a", title = "alpha", updatedAt = 1))
        store.upsert(Session(id = "b", title = "beta", updatedAt = 2))
        assertEquals(listOf("b", "a"), store.search("").map { it.id })
        assertEquals(listOf("b", "a"), store.search("   ").map { it.id })
    }

    @Test fun `search matches title case-insensitively`() = runTest {
        store.upsert(Session(id = "a", title = "Hello World", updatedAt = 1))
        store.upsert(Session(id = "b", title = "另一个会话", updatedAt = 2))
        assertEquals(listOf("a"), store.search("hello").map { it.id })
        assertEquals(listOf("a"), store.search("WORLD").map { it.id })
        assertEquals(listOf("b"), store.search("另一").map { it.id })
    }

    @Test fun `search matches manuscript body`() = runTest {
        store.upsert(Session(id = "a", title = "x", manuscript = "从前有座山", updatedAt = 1))
        store.upsert(Session(id = "b", title = "y", manuscript = "另起一行", updatedAt = 2))
        assertEquals(listOf("a"), store.search("从前").map { it.id })
        assertEquals(listOf("b"), store.search("另起").map { it.id })
    }

    @Test fun `search matches any message content`() = runTest {
        store.upsert(
            Session(
                id = "a", title = "x", updatedAt = 1,
                messages = listOf(
                    ChatMessage(id = "m1", role = Role.USER, content = "needle in a haystack"),
                ),
            )
        )
        store.upsert(Session(id = "b", title = "y", updatedAt = 2))
        assertEquals(listOf("a"), store.search("needle").map { it.id })
        assertEquals(listOf("a"), store.search("HAYSTACK").map { it.id })
        assertTrue(store.search("nothing-matches").isEmpty())
    }

    @Test fun `search results preserve updatedAt desc order`() = runTest {
        store.upsert(Session(id = "a", title = "alpha apple", updatedAt = 1))
        store.upsert(Session(id = "b", title = "beta apple", updatedAt = 3))
        store.upsert(Session(id = "c", title = "carrot apple", updatedAt = 2))
        assertEquals(listOf("b", "c", "a"), store.search("apple").map { it.id })
    }
}
