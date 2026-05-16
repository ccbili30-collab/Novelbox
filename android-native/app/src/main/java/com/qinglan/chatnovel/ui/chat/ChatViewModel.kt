package com.qinglan.chatnovel.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qinglan.chatnovel.TBirdApplication
import com.qinglan.chatnovel.data.AppPrefs
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.net.OpenAIClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val composer: String = "",
    val isGenerating: Boolean = false,
    val error: String? = null,
)

class ChatViewModel(
    private val store: SettingsStore = TBirdApplication.get().settingsStore,
    private val client: OpenAIClient = OpenAIClient(),
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var streamJob: Job? = null

    fun updateComposer(text: String) {
        _state.update { it.copy(composer = text) }
    }

    fun send() {
        if (_state.value.isGenerating) return
        val text = _state.value.composer.trim()
        if (text.isEmpty()) return
        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            val userMsg = ChatMessage.user(text)
            val placeholder = ChatMessage.assistantPlaceholder()
            _state.update {
                it.copy(
                    messages = it.messages + userMsg + placeholder,
                    composer = "",
                    isGenerating = true,
                    error = null,
                )
            }
            runStream(prefs, placeholder.id)
        }
    }

    fun stop() {
        streamJob?.cancel()
        streamJob = null
        _state.update {
            it.copy(
                isGenerating = false,
                messages = it.messages.map { m -> if (m.streaming) m.copy(streaming = false) else m },
            )
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    private fun runStream(prefs: AppPrefs, placeholderId: String) {
        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            try {
                val history = _state.value.messages
                    .filter { !it.streaming && it.content.isNotEmpty() }
                val cfg = OpenAIClient.Config(
                    baseUrl = prefs.apiBaseUrl,
                    apiKey = prefs.apiKey,
                    model = prefs.modelId,
                )
                client.generateStream(history, cfg).collect { delta ->
                    _state.update { s ->
                        s.copy(messages = s.messages.map { m ->
                            if (m.id == placeholderId) m.copy(content = m.content + delta) else m
                        })
                    }
                }
                _state.update { s ->
                    s.copy(
                        isGenerating = false,
                        messages = s.messages.map { m ->
                            if (m.id == placeholderId) m.copy(streaming = false) else m
                        },
                    )
                }
            } catch (t: Throwable) {
                _state.update { s ->
                    s.copy(
                        isGenerating = false,
                        messages = s.messages.map { m ->
                            if (m.id == placeholderId) m.copy(
                                streaming = false,
                                failed = true,
                                content = if (m.content.isEmpty()) "请求失败：${t.message ?: t.javaClass.simpleName}" else m.content,
                            ) else m
                        },
                        error = t.message ?: t.javaClass.simpleName,
                    )
                }
            }
        }
    }

    fun newSession() {
        stop()
        _state.update { ChatUiState() }
    }
}
