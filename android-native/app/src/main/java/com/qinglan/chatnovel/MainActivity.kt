package com.qinglan.chatnovel

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.compose.viewModel
import com.qinglan.chatnovel.ui.AppNav
import com.qinglan.chatnovel.ui.theme.TBirdTheme

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            TBirdRoot()
        }
    }
}

@Composable
private fun TBirdRoot() {
    val store = TBirdApplication.get().settingsStore
    val prefs by store.flow.collectAsState(initial = com.qinglan.chatnovel.data.AppPrefs.DEFAULT)
    TBirdTheme(
        themeMode = prefs.themeMode,
        dynamicColor = prefs.dynamicColor,
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            AppNav()
        }
    }
}
