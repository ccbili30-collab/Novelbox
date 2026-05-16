package com.qinglan.chatnovel.ui.chat

import androidx.test.core.app.ApplicationProvider
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
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
class ChatViewModelMessageActionsTest {

    @Before fun setMain() { Dispatchers.setMain(Dispatchers.Unconfined) }
    @After  fun resetMainDispatcher() { Dispatchers.resetMain() }

    private fun makeVm(): Triple<ChatViewModel, SessionStore, String> {
        val tmpDir = Files.createTempDirectory("ma-test").toFile()
        val sessionsFile = File(tmpDir, "sessions.json")
        val personasFile = File(tmpDir, "personas.json")
        val sessions = SessionStore(sessionsFile).also { it.load() }
        val personas = PersonaStore(personasFile, seedOnEmpty = true).also { it.load() }
        val sessionId = runBlocking {
            val s = sessions.newSession()
            // Seed three messages so the truncation logic has something to chew on.
            sessions.mutateOne(s.id) {
                it.copy(messages = listOf(
                    ChatMessage(id = "m-user", role = Role.USER, content = "hi"),
                    ChatMessage(id = "m-asst-1", role = Role.ASSISTANT, content = "first reply"),
                    ChatMessage(id = "m-asst-2", role = Role.ASSISTANT, content = "second reply"),
                ))
            }
            s.id
        }
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val vm = ChatViewModel(
            store = SettingsStore(ctx),
            sessions = sessions,
            personaStore = personas,
            client = OpenAIClient(),
        )
        return Triple(vm, sessions, sessionId)
    }

    @Test fun `deleteMessage removes by id and persists to disk`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        // Wait until VM has hydrated the active session.
        vm.state.filter { it.activeSession?.id == sid && it.messages.size == 3 }.first()
        vm.deleteMessage("m-asst-1")
        val after = vm.state.filter { it.messages.size == 2 }.first()
        assertEquals(listOf("m-user", "m-asst-2"), after.messages.map { it.id })
        assertEquals(listOf("m-user", "m-asst-2"), sessions.get(sid)!!.messages.map { it.id })
    } }

    @Test fun `deleteMessage on unknown id is a no-op`() = runBlocking { withTimeout(5_000) {
        val (vm, _, _) = makeVm()
        vm.state.filter { it.messages.size == 3 }.first()
        vm.deleteMessage("does-not-exist")
        // Give the launched coroutine a chance to settle and confirm size unchanged.
        val state = vm.state.filter { it.messages.size == 3 }.first()
        assertEquals(3, state.messages.size)
    } }

    @Test fun `regenerateMessage with no API key surfaces an error and does not truncate`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.messages.size == 3 }.first()
        // No API key in DataStore -> the regenerate path bails with
        // an error BEFORE truncation, so the message list is intact.
        vm.regenerateMessage("m-asst-1")
        // Await the error.
        val final = vm.state.filter { !it.error.isNullOrBlank() }.first()
        assertEquals(3, sessions.get(sid)!!.messages.size)
        assertTrue(!final.error.isNullOrBlank())
    } }

    @Test fun `regenerateMessage refuses to regen user messages`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.messages.size == 3 }.first()
        val before = sessions.get(sid)!!.messages.size
        vm.regenerateMessage("m-user")
        val state = vm.state.first()
        assertEquals(before, sessions.get(sid)!!.messages.size)
        assertEquals(false, state.isGenerating)
    } }

    @Test fun `sendMessageToManuscript copies the message content into the manuscript`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.messages.size == 3 }.first()
        vm.sendMessageToManuscript("m-asst-1")
        val first = vm.state.filter { it.activeSession?.manuscript == "first reply" }.first()
        assertEquals("first reply", first.activeSession!!.manuscript)
        // A second send appends with the blank-line separator.
        vm.sendMessageToManuscript("m-asst-2")
        val second = vm.state.filter {
            it.activeSession?.manuscript == "first reply\n\nsecond reply"
        }.first()
        assertEquals("first reply\n\nsecond reply", second.activeSession!!.manuscript)
        assertEquals("first reply\n\nsecond reply", sessions.get(sid)!!.manuscript)
    } }

    @Test fun `sendMessageToManuscript ignores unknown ids`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.messages.size == 3 }.first()
        vm.sendMessageToManuscript("does-not-exist")
        val state = vm.state.first()
        assertEquals("", state.activeSession!!.manuscript)
        assertEquals("", sessions.get(sid)!!.manuscript)
    } }
}
