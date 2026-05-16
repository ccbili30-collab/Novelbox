package com.qinglan.chatnovel.ui.chat

import androidx.test.core.app.ApplicationProvider
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.net.OpenAIClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.nio.file.Files

/**
 * VM-level behavioural tests for the roundtable plumbing. We do NOT
 * exercise the OpenAI network path here — just the state machine.
 *
 * Roundtable enable/disable + add/remove members must persist on disk
 * via SessionStore.mutateOne, so the next process can replay the
 * configuration. These cases prove the round-trip.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ChatViewModelRoundtableTest {

    // viewModelScope launches on Dispatchers.Main by default. Under
    // Robolectric the Main looper exists but doesn't auto-advance, so
    // we redirect Main to Unconfined for the test — every launch runs
    // inline on the test thread and state assertions see the result
    // synchronously.
    @Before fun setMain() { Dispatchers.setMain(kotlinx.coroutines.Dispatchers.Unconfined) }
    @After  fun resetMainDispatcher() { Dispatchers.resetMain() }

    private fun makeVm(): Triple<ChatViewModel, SessionStore, PersonaStore> {
        val tmpDir = Files.createTempDirectory("rt-test").toFile()
        val sessionsFile = File(tmpDir, "sessions.json")
        val personasFile = File(tmpDir, "personas.json")
        val sessions = SessionStore(sessionsFile).also { it.load() }
        val personas = PersonaStore(personasFile, seedOnEmpty = true).also { it.load() }
        runBlocking { sessions.newSession() }
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val settings = SettingsStore(ctx)
        val vm = ChatViewModel(
            store = settings,
            sessions = sessions,
            personaStore = personas,
            client = OpenAIClient(),
        )
        return Triple(vm, sessions, personas)
    }

    @Test fun `roundtable starts disabled with an empty member list`() = runBlocking { withTimeout(5_000) {
        val (vm, _, _) = makeVm()
        // Wait for the init combine to flow once.
        val state = vm.state.filter { it.activeSession != null }.first()
        assertFalse(state.roundtable.enabled)
        assertTrue(state.roundtable.personaIds.isEmpty())
        assertTrue(state.selectedPersonas.isEmpty())
    } }

    @Test fun `toggleRoundtable flips the persisted flag`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, _) = makeVm()
        // Snapshot the current id, await initial state
        val initial = vm.state.filter { it.activeSession != null }.first()
        val id = initial.activeSession!!.id
        vm.toggleRoundtable()
        // Wait until the StateFlow reflects the change.
        val flipped = vm.state.filter { it.activeSession?.roundtable?.enabled == true }.first()
        assertTrue(flipped.roundtable.enabled)
        assertEquals(true, sessions.get(id)?.roundtable?.enabled)
        vm.toggleRoundtable()
        val flipped2 = vm.state.filter { it.activeSession?.roundtable?.enabled == false }.first()
        assertFalse(flipped2.roundtable.enabled)
    } }

    @Test fun `toggleRoundtableMember adds then removes by id`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, personas) = makeVm()
        val initial = vm.state.filter { it.activeSession != null && it.personas.isNotEmpty() }.first()
        val id = initial.activeSession!!.id
        val pick = initial.personas.first()

        vm.toggleRoundtableMember(pick.id)
        val withMember = vm.state.filter { pick.id in it.roundtable.personaIds }.first()
        assertEquals(listOf(pick.id), withMember.roundtable.personaIds)
        assertEquals(listOf(pick.id), sessions.get(id)?.roundtable?.personaIds)

        vm.toggleRoundtableMember(pick.id)
        val without = vm.state.filter { pick.id !in it.roundtable.personaIds }.first()
        assertTrue(without.roundtable.personaIds.isEmpty())
    } }

    @Test fun `member order matches the order taps were applied`() = runBlocking { withTimeout(5_000) {
        val (vm, _, _) = makeVm()
        val initial = vm.state.filter { it.personas.size >= 3 }.first()
        val (a, b, c) = Triple(initial.personas[0], initial.personas[1], initial.personas[2])

        vm.toggleRoundtableMember(c.id)
        vm.toggleRoundtableMember(a.id)
        vm.toggleRoundtableMember(b.id)

        val final = vm.state.filter { it.roundtable.personaIds.size == 3 }.first()
        assertEquals(listOf(c.id, a.id, b.id), final.roundtable.personaIds)
        assertEquals(listOf(c.id, a.id, b.id), final.selectedPersonas.map { it.id })
    } }
}
