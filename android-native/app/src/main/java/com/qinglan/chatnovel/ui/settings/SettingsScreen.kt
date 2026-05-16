package com.qinglan.chatnovel.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.qinglan.chatnovel.R
import com.qinglan.chatnovel.TBirdApplication
import com.qinglan.chatnovel.data.AppPrefs
import com.qinglan.chatnovel.data.ThemeMode
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onOpenPersonas: () -> Unit = {},
) {
    val store = remember { TBirdApplication.get().settingsStore }
    val prefs by store.flow.collectAsState(initial = AppPrefs.DEFAULT)
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    var apiBase by remember(prefs.apiBaseUrl) { mutableStateOf(prefs.apiBaseUrl) }
    var apiKey by remember(prefs.apiKey) { mutableStateOf(prefs.apiKey) }
    var modelId by remember(prefs.modelId) { mutableStateOf(prefs.modelId) }
    // Resolve at composition time so the coroutine launched on Save
    // can use the string without invoking @Composable APIs.
    val savedToast = stringResource(R.string.settings_save_success)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.action_settings)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Rounded.ArrowBack, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(horizontal = 16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // --- Appearance ---
            SectionTitle(stringResource(R.string.settings_appearance))
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.settings_theme_mode), style = MaterialTheme.typography.labelLarge)
                    ThemeModeSegmented(prefs.themeMode) { next ->
                        scope.launch { store.update { it.copy(themeMode = next) } }
                    }
                    HorizontalDivider()
                    ListItem(
                        colors = androidx.compose.material3.ListItemDefaults.colors(
                            containerColor = androidx.compose.ui.graphics.Color.Transparent,
                        ),
                        headlineContent = { Text(stringResource(R.string.settings_dynamic_color)) },
                        supportingContent = { Text(stringResource(R.string.settings_dynamic_color_subtitle)) },
                        trailingContent = {
                            Switch(
                                checked = prefs.dynamicColor,
                                onCheckedChange = { v ->
                                    scope.launch { store.update { it.copy(dynamicColor = v) } }
                                },
                            )
                        },
                    )
                }
            }

            // --- Model config ---
            SectionTitle(stringResource(R.string.settings_model))
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = apiBase,
                        onValueChange = { apiBase = it },
                        label = { Text(stringResource(R.string.settings_api_base)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = apiKey,
                        onValueChange = { apiKey = it },
                        label = { Text(stringResource(R.string.settings_api_key)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = modelId,
                        onValueChange = { modelId = it },
                        label = { Text(stringResource(R.string.settings_model_id)) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    FilledTonalButton(
                        onClick = {
                            scope.launch {
                                store.update {
                                    it.copy(
                                        apiBaseUrl = apiBase.trim().ifEmpty { AppPrefs.DEFAULT.apiBaseUrl },
                                        apiKey = apiKey.trim(),
                                        modelId = modelId.trim().ifEmpty { AppPrefs.DEFAULT.modelId },
                                    )
                                }
                                snackbar.showSnackbar(message = savedToast)
                            }
                        },
                    ) {
                        Text(stringResource(R.string.settings_save))
                    }
                }
            }

            // --- Personas ---
            SectionTitle("圆桌议员")
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
                onClick = onOpenPersonas,
            ) {
                ListItem(
                    colors = androidx.compose.material3.ListItemDefaults.colors(
                        containerColor = androidx.compose.ui.graphics.Color.Transparent,
                    ),
                    headlineContent = { Text("议员（创作者）") },
                    supportingContent = { Text("管理参与圆桌讨论的 AI 角色") },
                )
            }

            // --- Backup / restore ---
            SectionTitle("备份")
            val ctx = androidx.compose.ui.platform.LocalContext.current
            val exportAllLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                contract = androidx.activity.result.contract.ActivityResultContracts
                    .CreateDocument("application/json"),
            ) { uri: android.net.Uri? ->
                val all = com.qinglan.chatnovel.TBirdApplication.get().sessionStore.snapshot()
                if (uri != null) {
                    val text = com.qinglan.chatnovel.data.SessionTransfer.exportAll(all)
                    val ok = com.qinglan.chatnovel.ui.share.writeText(ctx, uri, text)
                    scope.launch {
                        snackbar.showSnackbar(
                            if (ok) "已导出 ${all.size} 个会话"
                            else "导出失败",
                        )
                    }
                }
            }
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                ),
                onClick = {
                    exportAllLauncher.launch("tbird-all-sessions.json")
                },
            ) {
                ListItem(
                    colors = androidx.compose.material3.ListItemDefaults.colors(
                        containerColor = androidx.compose.ui.graphics.Color.Transparent,
                    ),
                    headlineContent = { Text("导出全部会话") },
                    supportingContent = {
                        Text(
                            "把每一个会话 + 正文 + 圆桌配置打包成一个 JSON，可在系统选择器里选保存位置。",
                        )
                    },
                )
            }
            Spacer(Modifier.size(8.dp))
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 8.dp, start = 4.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ThemeModeSegmented(active: ThemeMode, onChange: (ThemeMode) -> Unit) {
    val opts = listOf(
        ThemeMode.LIGHT to stringResource(R.string.settings_theme_mode_light),
        ThemeMode.DARK to stringResource(R.string.settings_theme_mode_dark),
        ThemeMode.SYSTEM to stringResource(R.string.settings_theme_mode_system),
    )
    SingleChoiceSegmentedButtonRow {
        opts.forEachIndexed { idx, (mode, label) ->
            SegmentedButton(
                selected = mode == active,
                onClick = { onChange(mode) },
                shape = SegmentedButtonDefaults.itemShape(index = idx, count = opts.size),
            ) {
                Text(label)
            }
        }
    }
}

