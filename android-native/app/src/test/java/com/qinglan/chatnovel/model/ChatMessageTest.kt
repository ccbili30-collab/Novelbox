package com.qinglan.chatnovel.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatMessageTest {

    @Test fun `user factory marks role and gives unique id`() {
        val a = ChatMessage.user("hi")
        val b = ChatMessage.user("hi")
        assertEquals(Role.USER, a.role)
        assertEquals("hi", a.content)
        assertFalse(a.streaming)
        assertFalse(a.failed)
        assertTrue(a.id != b.id)
        assertTrue(a.id.startsWith("u-"))
    }

    @Test fun `assistantPlaceholder marks streaming and starts empty`() {
        val p = ChatMessage.assistantPlaceholder()
        assertEquals(Role.ASSISTANT, p.role)
        assertEquals("", p.content)
        assertTrue(p.streaming)
        assertFalse(p.failed)
        assertTrue(p.id.startsWith("a-"))
    }
}
