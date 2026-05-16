package com.qinglan.chatnovel.ui.manuscript

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Save
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.qinglan.chatnovel.ui.chat.ChatViewModel
import kotlinx.coroutines.launch

/**
 * The "manuscript paper" surface. Two modes, swap via a single FAB:
 *
 *   - READ: long-form scrolling viewer (no editing, focus on prose).
 *   - EDIT: M3 OutlinedTextField that fills the screen. Save commits
 *     to the active session via [ChatViewModel.updateManuscript].
 *
 * Empty manuscript: shows a centred prompt + a single "开始写作"
 * button that drops straight into edit mode.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ManuscriptScreen(
    onBack: () -> Unit,
    vm: ChatViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    val current = state.activeSession?.manuscript.orEmpty()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val ctx = androidx.compose.ui.platform.LocalContext.current

    var editing by remember(state.activeSession?.id) { mutableStateOf(false) }
    var draft by remember(state.activeSession?.id, current) { mutableStateOf(current) }
    // Memoised so the count doesn't recalculate on every recomposition.
    val wordCount = remember(current) {
        com.qinglan.chatnovel.data.ManuscriptExporter.wordCount(current)
    }

    val exportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        contract = androidx.activity.result.contract.ActivityResultContracts.CreateDocument("text/markdown"),
    ) { uri: android.net.Uri? ->
        val session = state.activeSession
        if (uri != null && session != null) {
            val md = com.qinglan.chatnovel.data.ManuscriptExporter.exportManuscriptMarkdown(session)
            val ok = com.qinglan.chatnovel.ui.share.writeText(ctx, uri, md)
            scope.launch {
                snackbar.showSnackbar(if (ok) "已导出 Markdown" else "导出失败")
            }
        }
    }
    fun startExport() {
        val session = state.activeSession ?: return
        val safe = session.title.ifBlank { "manuscript" }
            .replace(Regex("[\\\\/:*?\"<>|\\s]+"), "_").take(50)
        exportLauncher.launch("$safe.md")
    }

    // Re-sync the editor draft if the underlying manuscript changes
    // while we're in read mode (e.g. a writer persona appended text).
    LaunchedEffect(current) {
        if (!editing) draft = current
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("正文小窗")
                        if (current.isNotEmpty()) {
                            Text(
                                "$wordCount 字",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "返回")
                    }
                },
                actions = {
                    if (current.isNotEmpty()) {
                        IconButton(onClick = {
                            clipboard.setText(AnnotatedString(current))
                            scope.launch { snackbar.showSnackbar("已复制到剪贴板") }
                        }) {
                            Icon(Icons.Rounded.ContentCopy, contentDescription = "复制全文")
                        }
                        IconButton(onClick = { startExport() }) {
                            Icon(Icons.Rounded.Download, contentDescription = "导出 Markdown")
                        }
                    }
                    if (editing) {
                        IconButton(onClick = {
                            vm.updateManuscript(draft)
                            editing = false
                            scope.launch { snackbar.showSnackbar("已保存") }
                        }) {
                            Icon(Icons.Rounded.Save, contentDescription = "保存")
                        }
                    } else {
                        IconButton(onClick = { editing = true }) {
                            Icon(Icons.Rounded.Edit, contentDescription = "编辑正文")
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
        modifier = Modifier.fillMaxSize(),
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            when {
                editing -> {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        modifier = Modifier.fillMaxSize(),
                        placeholder = {
                            Text(
                                "在这里写下你的正文。议员们在聊天里讨论；写手或你自己把成稿放在这里。",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        },
                        textStyle = TextStyle(
                            fontSize = 16.sp,
                            lineHeight = 26.sp,
                            color = MaterialTheme.colorScheme.onSurface,
                        ),
                        shape = RoundedCornerShape(16.dp),
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                            unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                        ),
                    )
                }
                current.isEmpty() -> ManuscriptEmpty(onStart = {
                    editing = true; draft = ""
                })
                else -> ManuscriptReader(text = current)
            }
        }
    }
}

@Composable
private fun ManuscriptEmpty(onStart: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "还没有正文",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.size(8.dp))
        Text(
            "议员们在聊天里讨论；写手或你自己把成稿放在这里。",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.size(16.dp))
        FilledTonalButton(onClick = onStart) {
            Icon(Icons.Rounded.Edit, contentDescription = null)
            Spacer(Modifier.size(8.dp))
            Text("开始写作")
        }
    }
}

@Composable
private fun ManuscriptReader(text: String) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxSize(),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                text,
                style = TextStyle(
                    fontSize = 16.sp,
                    lineHeight = 28.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                ),
            )
        }
    }
}
