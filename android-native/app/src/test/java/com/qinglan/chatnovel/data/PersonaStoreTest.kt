package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.Persona
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

class PersonaStoreTest {

    @get:Rule val tmp = TemporaryFolder()

    private fun freshStore(seed: Boolean = true): Pair<File, PersonaStore> {
        val f = File(tmp.newFolder(), "personas.json")
        val s = PersonaStore(f, seedOnEmpty = seed)
        s.load()
        return f to s
    }

    @Test fun `first load seeds Persona DEFAULTS`() {
        val (file, store) = freshStore(seed = true)
        assertEquals(Persona.DEFAULTS.size, store.snapshot().size)
        assertTrue(file.exists())
    }

    @Test fun `seedOnEmpty=false stays empty on missing file`() {
        val (_, store) = freshStore(seed = false)
        assertTrue(store.snapshot().isEmpty())
    }

    @Test fun `upsert is idempotent + persisted`() = runTest {
        val (file, store) = freshStore(seed = false)
        val p = Persona.blank("Alice")
        store.upsert(p)
        assertEquals(1, store.snapshot().size)
        store.upsert(p.copy(name = "Alice Renamed"))
        assertEquals(1, store.snapshot().size)
        assertEquals("Alice Renamed", store.snapshot().first().name)
        // Reload to confirm round-trip
        val store2 = PersonaStore(file, seedOnEmpty = false)
        store2.load()
        assertEquals("Alice Renamed", store2.snapshot().first().name)
    }

    @Test fun `delete removes by id`() = runTest {
        val (_, store) = freshStore(seed = false)
        val a = Persona.blank("A")
        val b = Persona.blank("B")
        store.upsert(a); store.upsert(b)
        store.delete(a.id)
        assertEquals(1, store.snapshot().size)
        assertEquals("B", store.snapshot().first().name)
    }

    @Test fun `mutate only touches the matching id`() = runTest {
        val (_, store) = freshStore(seed = false)
        val a = Persona.blank("A")
        val b = Persona.blank("B")
        store.upsert(a); store.upsert(b)
        store.mutate(b.id) { it.copy(prompt = "you are b") }
        assertEquals("", store.get(a.id)?.prompt)
        assertEquals("you are b", store.get(b.id)?.prompt)
    }

    @Test fun `corrupt json + seed=true falls back to DEFAULTS`() {
        val f = File(tmp.newFolder(), "personas.json")
        f.writeText("{not json")
        val store = PersonaStore(f, seedOnEmpty = true)
        store.load()
        assertEquals(Persona.DEFAULTS.size, store.snapshot().size)
    }
}
