package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Session
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionTransferTest {

    private val sample = Session(
        id = "s1",
        title = "Hello",
        systemPrompt = "speak briefly",
        messages = listOf(
            ChatMessage(id = "m1", role = Role.USER, content = "hi"),
            ChatMessage(id = "m2", role = Role.ASSISTANT, content = "hello there"),
        ),
        createdAt = 1_000L,
        updatedAt = 2_000L,
    )

    @Test fun `exportSession produces parseable JSON`() {
        val text = SessionTransfer.exportSession(sample)
        assertTrue(text.contains("Hello"))
        assertTrue(text.contains("speak briefly"))
        // Pretty-printed: contains a newline
        assertTrue(text.contains("\n"))
    }

    @Test fun `importSession round-trips`() {
        val text = SessionTransfer.exportSession(sample)
        val back = SessionTransfer.importSession(text)
        assertEquals(sample, back)
    }

    @Test fun `importSession returns null on garbage`() {
        assertNull(SessionTransfer.importSession("{ not json"))
        assertNull(SessionTransfer.importSession(""))
        assertNull(SessionTransfer.importSession("[]")) // wrong shape
    }

    @Test fun `exportAll + importAll round-trip preserves order`() {
        val a = sample
        val b = sample.copy(id = "s2", title = "Second", updatedAt = 3_000L)
        val text = SessionTransfer.exportAll(listOf(b, a))
        val back = SessionTransfer.importAll(text)
        assertEquals(listOf("s2", "s1"), back.map { it.id })
    }

    @Test fun `importAll returns empty list on garbage`() {
        assertTrue(SessionTransfer.importAll("not json").isEmpty())
    }

    @Test fun `filenameFor strips reserved chars and trims`() {
        val s = Session(id = "abc", title = "a/b\\c:d*e?f\"g<h>i|j  k")
        val name = SessionTransfer.filenameFor(s)
        // Should not contain any of \\/:*?"<>|
        for (c in "\\/:*?\"<>|") assertTrue("contained $c", !name.contains(c))
        // Should still end with the id and .json
        assertTrue(name.endsWith("-abc.json"))
    }

    @Test fun `filenameFor falls back when title is blank`() {
        val s = Session(id = "id1", title = "")
        assertEquals("session-id1.json", SessionTransfer.filenameFor(s))
    }
}
