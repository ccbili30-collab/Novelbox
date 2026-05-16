package com.qinglan.chatnovel.ui.personas

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.qinglan.chatnovel.TBirdApplication
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.model.Persona
import kotlinx.coroutines.launch

/**
 * Persona library editor. Lists every persona stored on disk, lets
 * the user add / edit / delete. The actual roundtable run-loop wires
 * the personas + Roundtable.composeSystemPrompt in a later commit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PersonasScreen(
    onBack: () -> Unit,
    store: PersonaStore = remember { TBirdApplication.get().personaStore },
) {
    val personas by store.personas.collectAsState()
    val scope = rememberCoroutineScope()
    var editing by remember { mutableStateOf<Persona?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("议员（创作者）") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = "返回")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { editing = Persona.blank() },
                containerColor = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
            ) {
                Icon(Icons.Rounded.Add, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text("新建议员")
            }
        },
    ) { padding ->
        if (personas.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "还没有议员",
                    style = MaterialTheme.typography.titleLarge,
                )
                Spacer(Modifier.size(8.dp))
                Text(
                    "议员是参与圆桌讨论的 AI 角色。点击右下角的「新建议员」开始。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(personas, key = { it.id }) { p ->
                    PersonaRow(
                        persona = p,
                        onEdit = { editing = p },
                        onDelete = { scope.launch { store.delete(p.id) } },
                    )
                }
            }
        }
    }

    val target = editing
    if (target != null) {
        PersonaEditorSheet(
            initial = target,
            onDismiss = { editing = null },
            onSave = { saved ->
                scope.launch { store.upsert(saved) }
                editing = null
            },
        )
    }
}

@Composable
private fun PersonaRow(
    persona: Persona,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            androidx.compose.foundation.layout.Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = MaterialTheme.colorScheme.tertiaryContainer,
                    modifier = Modifier.size(40.dp),
                ) {
                    Column(
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        Text(
                            persona.name.take(1),
                            color = MaterialTheme.colorScheme.onTertiaryContainer,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.W500,
                        )
                    }
                }
                Spacer(Modifier.size(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        persona.name,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        persona.roleLabel,
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = onEdit) {
                    Icon(Icons.Rounded.Edit, contentDescription = "编辑 ${persona.name}")
                }
                IconButton(onClick = onDelete) {
                    Icon(
                        Icons.Rounded.Delete,
                        contentDescription = "删除 ${persona.name}",
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
            }
            if (persona.prompt.isNotBlank()) {
                Spacer(Modifier.size(8.dp))
                Text(
                    persona.prompt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonaEditorSheet(
    initial: Persona,
    onDismiss: () -> Unit,
    onSave: (Persona) -> Unit,
) {
    var name by remember(initial.id) { mutableStateOf(initial.name) }
    var roleLabel by remember(initial.id) { mutableStateOf(initial.roleLabel) }
    var prompt by remember(initial.id) { mutableStateOf(initial.prompt) }
    var modelOverride by remember(initial.id) { mutableStateOf(initial.modelOverride.orEmpty()) }
    var memories by remember(initial.id) { mutableStateOf(initial.memories) }
    var pendingMemory by remember(initial.id) { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surfaceContainer,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                if (initial.name == Persona.blank().name) "新建议员" else "编辑议员",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("名字") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            OutlinedTextField(
                value = roleLabel,
                onValueChange = { roleLabel = it },
                label = { Text("角色标签") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )
            OutlinedTextField(
                value = prompt,
                onValueChange = { prompt = it },
                label = { Text("人格 / 写作提示") },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp, max = 260.dp),
                shape = RoundedCornerShape(12.dp),
            )
            OutlinedTextField(
                value = modelOverride,
                onValueChange = { modelOverride = it },
                label = { Text("模型覆盖（可选）") },
                placeholder = { Text("留空 = 跟随全局模型") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            )

            // --- Long-term memories ---
            androidx.compose.material3.HorizontalDivider()
            Text(
                "长期记忆 (${memories.size})",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                "发言前会按相关度自动注入；置顶项总是被采用。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (memories.isNotEmpty()) {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 0.dp, max = 220.dp),
                ) {
                    items(memories, key = { it.id }) { entry ->
                        androidx.compose.foundation.layout.Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            androidx.compose.material3.AssistChip(
                                onClick = {
                                    memories = memories.map {
                                        if (it.id == entry.id) it.copy(pinned = !it.pinned) else it
                                    }
                                },
                                label = {
                                    Text(if (entry.pinned) "📌 已置顶" else "置顶")
                                },
                                modifier = Modifier.padding(end = 4.dp),
                            )
                            Text(
                                entry.content,
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 3,
                                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                            )
                            IconButton(onClick = { memories = memories.filterNot { it.id == entry.id } }) {
                                Icon(
                                    Icons.Rounded.Delete,
                                    contentDescription = "删除记忆",
                                    tint = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }
                }
            }
            androidx.compose.foundation.layout.Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                OutlinedTextField(
                    value = pendingMemory,
                    onValueChange = { pendingMemory = it },
                    label = { Text("新记忆") },
                    placeholder = { Text("例如：我喜欢冷峻克制的句子") },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(12.dp),
                )
                Spacer(Modifier.size(8.dp))
                FilledTonalButton(
                    enabled = pendingMemory.trim().isNotEmpty(),
                    onClick = {
                        memories = memories + com.qinglan.chatnovel.model.MemoryEntry.blank(pendingMemory.trim())
                        pendingMemory = ""
                    },
                ) { Text("添加") }
            }

            androidx.compose.foundation.layout.Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
            ) {
                TextButton(onClick = onDismiss) { Text("取消") }
                Spacer(Modifier.size(8.dp))
                FilledTonalButton(
                    enabled = name.trim().isNotEmpty(),
                    onClick = {
                        onSave(initial.copy(
                            name = name.trim(),
                            roleLabel = roleLabel.trim().ifEmpty { "议员" },
                            prompt = prompt,
                            modelOverride = modelOverride.trim().ifEmpty { null },
                            memories = memories,
                            updatedAt = System.currentTimeMillis(),
                        ))
                    },
                ) { Text("保存") }
            }
            Spacer(Modifier.size(8.dp))
        }
    }
}
