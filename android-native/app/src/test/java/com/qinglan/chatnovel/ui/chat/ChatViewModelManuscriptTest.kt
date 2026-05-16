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
class ChatViewModelManuscriptTest {

    @Before fun setMain() { Dispatchers.setMain(Dispatchers.Unconfined) }
    @After  fun resetMainDispatcher() { Dispatchers.resetMain() }

    private fun makeVm(): Triple<ChatViewModel, SessionStore, String> {
        val tmpDir = Files.createTempDirectory("ms-test").toFile()
        val sessionsFile = File(tmpDir, "sessions.json")
        val personasFile = File(tmpDir, "personas.json")
        val sessions = SessionStore(sessionsFile).also { it.load() }
        val personas = PersonaStore(personasFile, seedOnEmpty = true).also { it.load() }
        val sessionId = runBlocking { sessions.newSession() }.id
        val ctx = ApplicationProvider.getApplicationContext<android.content.Context>()
        val vm = ChatViewModel(
            store = SettingsStore(ctx),
            sessions = sessions,
            personaStore = personas,
            client = OpenAIClient(),
        )
        return Triple(vm, sessions, sessionId)
    }

    @Test fun `updateManuscript writes the active session manuscript and persists`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.updateManuscript("第一章。\n\n开场。")
        val final = vm.state.filter { it.activeSession?.manuscript == "第一章。\n\n开场。" }.first()
        assertEquals("第一章。\n\n开场。", final.activeSession!!.manuscript)
        assertEquals("第一章。\n\n开场。", sessions.get(sid)!!.manuscript)
    } }

    @Test fun `appendToManuscript appends with blank-line separator`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.appendToManuscript("第一段。")
        vm.state.filter { it.activeSession?.manuscript == "第一段。" }.first()
        vm.appendToManuscript("第二段。")
        val final = vm.state.filter { it.activeSession?.manuscript?.contains("第二段。") == true }.first()
        assertEquals("第一段。\n\n第二段。", final.activeSession!!.manuscript)
        assertEquals("第一段。\n\n第二段。", sessions.get(sid)!!.manuscript)
    } }

    @Test fun `appendToManuscript on blank text is a no-op`() = runBlocking { withTimeout(5_000) {
        val (vm, _, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.appendToManuscript("seed")
        vm.state.filter { it.activeSession?.manuscript == "seed" }.first()
        vm.appendToManuscript("   \n\t ")
        // manuscript should still be just "seed"
        val state = vm.state.first()
        assertEquals("seed", state.activeSession!!.manuscript)
    } }

    @Test fun `appendToManuscript trims trailing whitespace from prior content`() = runBlocking { withTimeout(5_000) {
        val (vm, _, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.updateManuscript("第一段。   \n\n   ")
        vm.state.filter { (it.activeSession?.manuscript ?: "").startsWith("第一段。") }.first()
        vm.appendToManuscript("第二段。")
        val final = vm.state.filter { it.activeSession?.manuscript?.contains("第二段。") == true }.first()
        assertEquals("第一段。\n\n第二段。", final.activeSession!!.manuscript)
    } }

    @Test fun `manuscript persists across SessionStore reload`() = runBlocking { withTimeout(5_000) {
        val (vm, sessions, sid) = makeVm()
        vm.state.filter { it.activeSession?.id == sid }.first()
        vm.updateManuscript("persist me")
        vm.state.filter { it.activeSession?.manuscript == "persist me" }.first()
        // Re-open the same file from a fresh store.
        val file = (sessions::class.java.getDeclaredField("storeFile").apply { isAccessible = true })
            .get(sessions) as File
        val reborn = SessionStore(file)
        reborn.load()
        assertEquals("persist me", reborn.get(sid)?.manuscript)
    } }
}
