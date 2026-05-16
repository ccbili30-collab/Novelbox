package com.qinglan.chatnovel.ui.share

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts.CreateDocument
import androidx.activity.result.contract.ActivityResultContracts.OpenDocument
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.qinglan.chatnovel.data.SessionTransfer
import com.qinglan.chatnovel.model.Session

/**
 * Two thin Compose helpers that glue [SessionTransfer] to the system
 * Storage Access Framework:
 *
 *   - rememberSessionExporter(): returns a (session) -> Unit that
 *     opens the SAF 'create document' picker with a suggested
 *     filename, then writes the session JSON via SessionTransfer.exportSession.
 *   - rememberSessionImporter(onImported): returns a () -> Unit that
 *     opens the SAF 'open document' picker, reads the chosen JSON,
 *     parses it via SessionTransfer.importSession, and invokes
 *     onImported(Session) on success or onImported(null) on failure.
 */

@Composable
fun rememberSessionExporter(): (Session) -> Unit {
    val context = LocalContext.current
    var pendingPayload by remember { mutableStateOf<String?>(null) }

    val launcher = rememberLauncherForActivityResult(
        contract = CreateDocument("application/json"),
    ) { uri: Uri? ->
        val payload = pendingPayload
        pendingPayload = null
        if (uri != null && payload != null) {
            writeText(context, uri, payload)
        }
    }

    return remember(launcher) {
        { session ->
            pendingPayload = SessionTransfer.exportSession(session)
            launcher.launch(SessionTransfer.filenameFor(session))
        }
    }
}

@Composable
fun rememberSessionImporter(onImported: (Session?) -> Unit): () -> Unit {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(
        contract = OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) {
            onImported(null)
            return@rememberLauncherForActivityResult
        }
        val text = readText(context, uri) ?: run {
            onImported(null)
            return@rememberLauncherForActivityResult
        }
        onImported(SessionTransfer.importSession(text))
    }
    return remember(launcher) {
        { launcher.launch(arrayOf("application/json", "text/plain", "*/*")) }
    }
}

internal fun writeText(context: Context, uri: Uri, text: String): Boolean = runCatching {
    context.contentResolver.openOutputStream(uri, "w")?.use { it.write(text.toByteArray()) } != null
}.getOrDefault(false)

internal fun readText(context: Context, uri: Uri): String? = runCatching {
    context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
}.getOrNull()

/** Build an ACTION_SEND chooser intent for ad-hoc sharing of an
 *  exported session JSON. Use it when the user wants to send the
 *  session to another app (e.g. WeChat) without picking a file
 *  location first. */
fun buildShareIntent(jsonText: String, title: String): Intent {
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_TEXT, jsonText)
        putExtra(Intent.EXTRA_TITLE, title)
    }
    return Intent.createChooser(send, null)
}
