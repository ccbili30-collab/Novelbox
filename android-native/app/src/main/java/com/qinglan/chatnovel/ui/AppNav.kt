package com.qinglan.chatnovel.ui

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.qinglan.chatnovel.ui.chat.ChatScreen
import com.qinglan.chatnovel.ui.manuscript.ManuscriptScreen
import com.qinglan.chatnovel.ui.personas.PersonasScreen
import com.qinglan.chatnovel.ui.settings.SettingsScreen

private object Routes {
    const val CHAT = "chat"
    const val SETTINGS = "settings"
    const val PERSONAS = "personas"
    const val MANUSCRIPT = "manuscript"
}

@Composable
fun AppNav() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = Routes.CHAT) {
        composable(Routes.CHAT) {
            ChatScreen(
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
                onOpenManuscript = { nav.navigate(Routes.MANUSCRIPT) },
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                onBack = { nav.popBackStack() },
                onOpenPersonas = { nav.navigate(Routes.PERSONAS) },
            )
        }
        composable(Routes.PERSONAS) {
            PersonasScreen(onBack = { nav.popBackStack() })
        }
        composable(Routes.MANUSCRIPT) {
            ManuscriptScreen(onBack = { nav.popBackStack() })
        }
    }
}
