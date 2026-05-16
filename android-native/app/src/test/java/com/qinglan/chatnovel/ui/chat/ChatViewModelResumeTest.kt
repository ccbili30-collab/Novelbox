package com.qinglan.chatnovel.ui.chat

import androidx.test.core.app.ApplicationProvider
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.model.RoundtableConfig
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

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ChatViewModelResumeTest {

    @Before fun setMain() { Dispatchers.setMain(Dispatchers.Unconfined) }
    @After  fun resetMainDispatcher() { Dispatchers.resetMain() }

    private fun makeVm(): Triple<ChatViewModel, SessionStore, String> {
        val tmpDir = Files.createTempDirectory("rt-resume").toFile()
        val sessionsFile = File(tmpDir, "sessions.json")
        val personasFile = File(tmpDir, "personas.json")
        val sessions = SessionStore(sessionsFile).also { it.load() }
        val personas = PersonaStore(personasFile, seedOnEmpty = true).also { it.load() }
        val sid = runBlocking { sessions.newSession() }.id
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val vm = ChatViewModel(
            store = SettingsStore(ctx),
            sessions = sessions,
            personaStore = personas,
            client = OpenAIClient(),
        )
        return Triple(vm, sessions, sid)
    }

    @Test fun `default RoundtableConfig has empty pendingQueue`() {
        val cfg = RoundtableConfig()
        assertTrue(cfg.pendingQueue.isEmpty())
    }

    @Test fun `RoundtableConfig serialises pendingQueue through SessionStore`() = runBlocking { withTimeout(5_000) {
        val tmpDir = Files.createTempDirectory("rt-persist").toFile()
        val file = File(tmpDir, "sessions.json")
        val store = SessionStore(file).also { it.load() }
        val s = store.newSession()
        store.mutateOne(s.id) {
            it.copy(roundtable = it.roundtable.copy(pendingQueue = listOf("a", "b", "c")))
        }
        val reopen = SessionStore(file).also { it.load() }
        assertEquals(listOf("a", "b", "c"), reopen.get(s.id)?.roundtable?.pendingQueue)
    } }

    @Test fun `resumeRoundtable bails when pendingQueue is empty`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        // No pending, no API config — neither generation nor error.
        vm.resumeRoundtable()
        val state = vm.state.first()
        assertEquals(false, state.isGenerating)
        assertTrue(state.error.isNullOrBlank())
        assertEquals(emptyList<String>(), sessions.get(sid)!!.roundtable.pendingQueue)
    } }

    @Test fun `resumeRoundtable surfaces an error when API is not ready`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        // Manually seed a pendingQueue + leave API unconfigured.
        sessions.mutateOne(sid) {
            it.copy(roundtable = it.roundtable.copy(pendingQueue = listOf("nobody")))
        }
        vm.state.filter { it.roundtable.pendingQueue.isNotEmpty() }.first()
        vm.resumeRoundtable()
        val final = vm.state.filter { !it.error.isNullOrBlank() }.first()
        assertFalse(final.isGenerating)
        assertTrue(!final.error.isNullOrBlank())
    } }

    @Test fun `startAnotherRound bails with error when API is not configured`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        val initial = vm.state.filter { it.personas.size >= 2 }.first()
        val a = initial.personas[0]
        val b = initial.personas[1]
        vm.toggleRoundtableMember(a.id)
        vm.toggleRoundtableMember(b.id)
        vm.state.filter { it.roundtable.personaIds.size == 2 }.first()
        // No API key -> bail out with an error BEFORE touching pendingQueue.
        vm.startAnotherRound()
        val final = vm.state.filter { !it.error.isNullOrBlank() }.first()
        assertEquals(emptyList<String>(), sessions.get(sid)!!.roundtable.pendingQueue)
        assertFalse(final.isGenerating)
    } }

    @Test fun `startAnotherRound is a no-op when no personas are selected`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.startAnotherRound()
        val state = vm.state.first()
        assertEquals(emptyList<String>(), sessions.get(sid)!!.roundtable.pendingQueue)
        assertEquals(false, state.isGenerating)
    } }
}
