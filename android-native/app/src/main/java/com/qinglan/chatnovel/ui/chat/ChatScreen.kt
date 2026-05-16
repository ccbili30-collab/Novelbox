package com.qinglan.chatnovel.ui.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddComment
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Menu
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.SuggestionChipDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.qinglan.chatnovel.R
import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Session
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    onOpenSettings: () -> Unit,
    vm: ChatViewModel = viewModel(),
) {
    val state by vm.state.collectAsState()
    val listState = rememberLazyListState()
    val snackbar = remember { SnackbarHostState() }
    val drawer = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var systemPromptOpen by remember { mutableStateOf(false) }

    // Auto-scroll to the latest message when content arrives.
    LaunchedEffect(state.messages.size, state.messages.lastOrNull()?.content) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }
    LaunchedEffect(state.error) {
        val err = state.error
        if (!err.isNullOrBlank()) {
            snackbar.showSnackbar(err)
            vm.clearError()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            SessionDrawer(
                sessions = state.sessions,
                activeId = state.activeSession?.id,
                onSwitch = { id ->
                    vm.switchSession(id)
                    scope.launch { drawer.close() }
                },
                onNew = {
                    vm.newSession()
                    scope.launch { drawer.close() }
                },
                onDelete = vm::deleteSession,
            )
        },
    ) {
        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = {
                        Text(
                            state.activeSession?.title?.ifBlank { null } ?: stringResourceSafe(R.string.title_new_chat),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawer.open() } }) {
                            Icon(Icons.Rounded.Menu, contentDescription = stringResourceSafe(R.string.action_history))
                        }
                    },
                    actions = {
                        IconButton(onClick = { systemPromptOpen = true }) {
                            Icon(Icons.Rounded.Chat, contentDescription = "系统提示")
                        }
                        IconButton(onClick = { vm.newSession() }) {
                            Icon(Icons.Rounded.AddComment, contentDescription = stringResourceSafe(R.string.action_new_session))
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Rounded.Tune, contentDescription = stringResourceSafe(R.string.action_settings))
                        }
                    },
                    colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                )
            },
            snackbarHost = {
                SnackbarHost(snackbar) { data ->
                    Snackbar(
                        snackbarData = data,
                        containerColor = MaterialTheme.colorScheme.inverseSurface,
                        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
                        shape = MaterialTheme.shapes.extraSmall,
                    )
                }
            },
            contentWindowInsets = WindowInsets.statusBars,
            modifier = Modifier.fillMaxSize(),
        ) { padding ->
            Column(modifier = Modifier
                .fillMaxSize()
                .padding(padding)) {
                Box(modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()) {
                    if (state.messages.isEmpty()) {
                        EmptyState(onSuggestion = { vm.updateComposer(it) })
                    } else {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            items(state.messages, key = { it.id }) { msg ->
                                MessageRow(msg)
                            }
                        }
                    }
                }
                HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant)
                Composer(
                    text = state.composer,
                    isGenerating = state.isGenerating,
                    onChange = vm::updateComposer,
                    onSend = vm::send,
                    onStop = vm::stop,
                    modifier = Modifier
                        .windowInsetsPadding(WindowInsets.navigationBars)
                        .imePadding(),
                )
            }
        }
    }

    if (systemPromptOpen) {
        SystemPromptSheet(
            initial = state.systemPrompt,
            onDismiss = { systemPromptOpen = false },
            onSave = { vm.setSystemPrompt(it); systemPromptOpen = false },
        )
    }
}

@Composable
private fun SessionDrawer(
    sessions: List<Session>,
    activeId: String?,
    onSwitch: (String) -> Unit,
    onNew: () -> Unit,
    onDelete: (String) -> Unit,
) {
    ModalDrawerSheet(
        drawerShape = RoundedCornerShape(topEnd = 28.dp, bottomEnd = 28.dp),
    ) {
        Column(modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)) {
            Text(
                "历史会话",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = 8.dp, top = 8.dp, bottom = 12.dp),
            )
            TextButton(
                onClick = onNew,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            ) {
                Icon(Icons.Rounded.AddComment, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResourceSafe(R.string.action_new_session))
            }
            Spacer(Modifier.size(8.dp))
            LazyColumn(modifier = Modifier.weight(1f)) {
                items(sessions, key = { it.id }) { s ->
                    val selected = s.id == activeId
                    NavigationDrawerItem(
                        label = {
                            Text(
                                s.title.ifBlank { stringResourceSafe(R.string.title_new_chat) },
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        },
                        selected = selected,
                        onClick = { onSwitch(s.id) },
                        badge = {
                            if (sessions.size > 1) {
                                IconButton(onClick = { onDelete(s.id) }) {
                                    Icon(
                                        Icons.Rounded.Delete,
                                        contentDescription = "删除",
                                        tint = MaterialTheme.colorScheme.error,
                                    )
                                }
                            }
                        },
                        colors = NavigationDrawerItemDefaults.colors(
                            selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                        ),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SystemPromptSheet(
    initial: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var text by remember(initial) { mutableStateOf(initial) }
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 12.dp)) {
            Text(
                "系统提示",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.size(4.dp))
            Text(
                "在每次对话前注入到模型上下文。留空则不注入。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.size(16.dp))
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp, max = 320.dp),
                placeholder = { Text("例如：你是一个语言简练、风格略带幽默的小说编辑…") },
                shape = RoundedCornerShape(12.dp),
            )
            Spacer(Modifier.size(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onDismiss) { Text("取消") }
                Spacer(Modifier.size(8.dp))
                androidx.compose.material3.FilledTonalButton(onClick = { onSave(text) }) {
                    Text("保存")
                }
            }
            Spacer(Modifier.size(8.dp))
        }
    }
}

@Composable
private fun EmptyState(onSuggestion: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Rounded.Forum,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.size(12.dp))
        Text(
            stringResourceSafe(R.string.empty_chat_title),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.size(8.dp))
        Text(
            stringResourceSafe(R.string.empty_chat_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.size(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            SuggestionChip(
                onClick = { onSuggestion("帮我把下面这段散乱的想法整理成大纲：\n\n") },
                label = { Text(stringResourceSafe(R.string.empty_suggestion_outline)) },
                colors = SuggestionChipDefaults.suggestionChipColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    labelColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            )
            SuggestionChip(
                onClick = { onSuggestion("我正在写一段对话，主角是 ___，对手是 ___，冲突点是 ___，请给三种走向。\n\n") },
                label = { Text(stringResourceSafe(R.string.empty_suggestion_three_paths)) },
                colors = SuggestionChipDefaults.suggestionChipColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                    labelColor = MaterialTheme.colorScheme.onSecondaryContainer,
                ),
            )
        }
    }
}

@Composable
private fun MessageRow(msg: ChatMessage) {
    val isUser = msg.role == Role.USER
    val bubble = if (isUser) {
        MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
    } else if (msg.failed) {
        MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }
    val shape = if (isUser)
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp)
    else
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 4.dp, bottomEnd = 16.dp)

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = shape,
            color = bubble.first,
            modifier = Modifier.padding(if (isUser) PaddingValues(start = 48.dp) else PaddingValues(end = 48.dp)),
        ) {
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) {
                val showLoadingDots = msg.streaming && msg.content.isEmpty()
                if (showLoadingDots) {
                    Text(
                        "…",
                        color = bubble.second.copy(alpha = 0.7f),
                        style = MaterialTheme.typography.bodyLarge,
                    )
                } else {
                    Text(
                        msg.content,
                        color = bubble.second,
                        style = MaterialTheme.typography.bodyLarge,
                    )
                }
            }
        }
    }
}

@Composable
private fun Composer(
    text: String,
    isGenerating: Boolean,
    onChange: (String) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceContainer,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        shadowElevation = 1.dp,
        modifier = modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.Bottom,
            modifier = Modifier.padding(start = 12.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
        ) {
            TextField(
                value = text,
                onValueChange = onChange,
                placeholder = { Text(stringResourceSafe(R.string.composer_hint)) },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp, max = 188.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                    focusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                    unfocusedIndicatorColor = androidx.compose.ui.graphics.Color.Transparent,
                ),
                shape = RoundedCornerShape(28.dp),
                maxLines = 6,
            )
            Spacer(Modifier.size(8.dp))
            AnimatedVisibility(visible = isGenerating, enter = fadeIn(), exit = fadeOut()) {
                FilledIconButton(
                    onClick = onStop,
                    shape = MaterialTheme.shapes.large,
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(Icons.Rounded.Stop, contentDescription = stringResourceSafe(R.string.composer_stop))
                }
            }
            AnimatedVisibility(visible = !isGenerating, enter = fadeIn(), exit = fadeOut()) {
                FilledIconButton(
                    onClick = onSend,
                    enabled = text.isNotBlank(),
                    shape = MaterialTheme.shapes.large,
                    modifier = Modifier.size(48.dp),
                ) {
                    Icon(Icons.Rounded.ArrowUpward, contentDescription = stringResourceSafe(R.string.composer_send))
                }
            }
        }
    }
}

@Composable
private fun stringResourceSafe(@androidx.annotation.StringRes id: Int): String =
    androidx.compose.ui.res.stringResource(id)
