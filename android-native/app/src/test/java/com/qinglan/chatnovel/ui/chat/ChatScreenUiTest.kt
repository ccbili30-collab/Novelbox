package com.qinglan.chatnovel.ui.chat

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.net.OpenAIClient
import com.qinglan.chatnovel.ui.theme.TBirdTheme
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.nio.file.Files

/**
 * Robolectric-driven Compose UI tests for the chat screen.
 *
 * No emulator needed — Robolectric mounts the Android framework + view
 * system on the JVM, so the same semantics tree the user sees on a
 * real device is testable from `./gradlew testDebugUnitTest`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ChatScreenUiTest {

    @get:Rule val compose = createComposeRule()

    private fun makeVm(): ChatViewModel {
        val tmpDir = Files.createTempDirectory("tbird-ui-test").toFile()
        val file = File(tmpDir, "sessions.json")
        val sessions = SessionStore(file).also { it.load() }
        // Pre-create a session synchronously so the screen renders the
        // empty state immediately (no async race).
        runBlocking { sessions.newSession() }
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val settings = SettingsStore(context)
        return ChatViewModel(
            store = settings,
            sessions = sessions,
            client = OpenAIClient(),
        )
    }

    @Test fun `empty state renders headline + suggestion chips`() {
        val vm = makeVm()
        compose.setContent {
            TBirdTheme { ChatScreen(onOpenSettings = {}, vm = vm) }
        }
        compose.waitForIdle()
        compose.onNodeWithText("开始一段对话").assertIsDisplayed()
        compose.onNodeWithText("帮我整理大纲").assertIsDisplayed()
        compose.onNodeWithText("设计三种走向").assertIsDisplayed()
    }

    @Test fun `send button is disabled when composer is empty`() {
        val vm = makeVm()
        compose.setContent {
            TBirdTheme { ChatScreen(onOpenSettings = {}, vm = vm) }
        }
        compose.waitForIdle()
        compose.onNodeWithContentDescription("发送").assertIsNotEnabled()
    }

    @Test fun `typing into composer enables send button`() {
        val vm = makeVm()
        compose.setContent {
            TBirdTheme { ChatScreen(onOpenSettings = {}, vm = vm) }
        }
        compose.waitForIdle()
        compose.onNodeWithText("在这里输入你的问题…").performTextInput("hello world")
        compose.waitForIdle()
        compose.onNodeWithContentDescription("发送").assertIsEnabled()
    }

    @Test fun `tapping a suggestion chip pre-fills the composer`() {
        val vm = makeVm()
        compose.setContent {
            TBirdTheme { ChatScreen(onOpenSettings = {}, vm = vm) }
        }
        compose.waitForIdle()
        compose.onNodeWithText("帮我整理大纲").performClick()
        compose.waitForIdle()
        compose.onAllNodesWithText("帮我把下面这段散乱的想法整理成大纲：", substring = true)
            .assertCountEquals(1)
    }

    @Test fun `tapping the settings icon invokes the navigation callback`() {
        val vm = makeVm()
        var opened = 0
        compose.setContent {
            TBirdTheme { ChatScreen(onOpenSettings = { opened++ }, vm = vm) }
        }
        compose.waitForIdle()
        compose.onNodeWithContentDescription("设置").performClick()
        assert(opened == 1) { "expected onOpenSettings to be invoked exactly once, was $opened" }
    }
}
