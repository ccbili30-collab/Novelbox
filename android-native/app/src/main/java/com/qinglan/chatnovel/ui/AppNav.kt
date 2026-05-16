package com.qinglan.chatnovel.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.qinglan.chatnovel.ui.chat.ChatScreen
import com.qinglan.chatnovel.ui.settings.SettingsScreen

private object Routes {
    const val CHAT = "chat"
    const val SETTINGS = "settings"
}

@Composable
fun AppNav() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.CHAT) {
        composable(Routes.CHAT) {
            ChatScreen(onOpenSettings = { nav.navigate(Routes.SETTINGS) })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(onBack = { nav.popBackStack() })
        }
    }
}
