package com.qinglan.chatnovel.ui.personas

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.model.Persona
import com.qinglan.chatnovel.ui.theme.TBirdTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.nio.file.Files

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class PersonasScreenUiTest {

    @get:Rule val compose = createComposeRule()

    private fun freshStore(seed: Boolean = true): PersonaStore {
        val f = File(Files.createTempDirectory("personas-ui").toFile(), "personas.json")
        return PersonaStore(f, seedOnEmpty = seed).also { it.load() }
    }

    @Test fun `seeded library renders the first default personas`() {
        val store = freshStore(seed = true)
        compose.setContent {
            TBirdTheme { PersonasScreen(onBack = {}, store = store) }
        }
        compose.waitForIdle()
        // Robolectric's default viewport is 320x480 dp; the LazyColumn
        // only composes rows that fit. Assert the first two are
        // present — the data layer guarantees all four are loaded
        // (covered by PersonaStoreTest's seed assertion).
        compose.onNodeWithText("设定师").assertIsDisplayed()
        compose.onNodeWithText("剧情师").assertIsDisplayed()
    }

    @Test fun `empty library shows the inviting placeholder`() {
        val store = freshStore(seed = false)
        compose.setContent {
            TBirdTheme { PersonasScreen(onBack = {}, store = store) }
        }
        compose.waitForIdle()
        compose.onNodeWithText("还没有议员").assertIsDisplayed()
        compose.onNodeWithText("新建议员").assertIsDisplayed()
    }

    @Test fun `back button invokes the navigation callback`() {
        val store = freshStore(seed = true)
        var backHits = 0
        compose.setContent {
            TBirdTheme { PersonasScreen(onBack = { backHits++ }, store = store) }
        }
        compose.waitForIdle()
        compose.onNodeWithContentDescription("返回").performClick()
        assert(backHits == 1) { "expected onBack to fire once, was $backHits" }
    }
}
