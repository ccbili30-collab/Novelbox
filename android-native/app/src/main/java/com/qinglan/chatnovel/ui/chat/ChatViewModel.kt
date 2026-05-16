package com.qinglan.chatnovel.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qinglan.chatnovel.TBirdApplication
import com.qinglan.chatnovel.data.AppPrefs
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Session
import com.qinglan.chatnovel.net.OpenAIClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val activeSession: Session? = null,
    val sessions: List<Session> = emptyList(),
    val composer: String = "",
    val isGenerating: Boolean = false,
    val error: String? = null,
) {
    val messages: List<ChatMessage> get() = activeSession?.messages ?: emptyList()
    val systemPrompt: String get() = activeSession?.systemPrompt.orEmpty()
}

class ChatViewModel(
    private val store: SettingsStore = TBirdApplication.get().settingsStore,
    private val sessions: SessionStore = TBirdApplication.get().sessionStore,
    private val client: OpenAIClient = OpenAIClient(),
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var streamJob: Job? = null

    init {
        // Subscribe to the session list + active id; rebuild ui state.
        combine(sessions.sessions, sessions.activeId) { all, id ->
            val active = id?.let { aid -> all.firstOrNull { it.id == aid } } ?: all.firstOrNull()
            // If there are zero sessions yet, materialise one.
            if (active == null) {
                viewModelScope.launch { sessions.newSession() }
                ChatUiState(activeSession = null, sessions = all)
            } else {
                ChatUiState(
                    activeSession = active,
                    sessions = all,
                )
            }
        }.onEach { snapshot ->
            // Preserve in-flight composer + generation flags from the
            // previous ui-state when the data layer pushes a new
            // snapshot, so a save-to-disk doesn't blow away the user's
            // typing or the streaming indicator.
            _state.update { prev ->
                snapshot.copy(
                    composer = prev.composer,
                    isGenerating = prev.isGenerating,
                    error = prev.error,
                )
            }
        }.launchIn(viewModelScope)
    }

    fun updateComposer(text: String) {
        _state.update { it.copy(composer = text) }
    }

    fun switchSession(id: String) {
        if (_state.value.isGenerating) stop()
        viewModelScope.launch { sessions.setActive(id) }
    }

    fun newSession() {
        if (_state.value.isGenerating) stop()
        viewModelScope.launch { sessions.newSession() }
    }

    fun deleteSession(id: String) {
        viewModelScope.launch { sessions.delete(id) }
    }

    fun renameSession(id: String, title: String) {
        viewModelScope.launch { sessions.rename(id, title) }
    }

    suspend fun updateSystemPrompt(prompt: String) {
        val id = _state.value.activeSession?.id ?: return
        sessions.mutateOne(id) {
            it.copy(systemPrompt = prompt, updatedAt = System.currentTimeMillis())
        }
    }

    fun setSystemPrompt(prompt: String) {
        viewModelScope.launch { updateSystemPrompt(prompt) }
    }

    fun send() {
        if (_state.value.isGenerating) return
        val text = _state.value.composer.trim()
        if (text.isEmpty()) return
        val activeId = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            val userMsg = ChatMessage.user(text)
            val placeholder = ChatMessage.assistantPlaceholder()

            sessions.mutateOne(activeId) { s ->
                val newMessages = s.messages + userMsg + placeholder
                val newTitle = if (s.messages.isEmpty()) {
                    s.copy(messages = newMessages).deriveTitle()
                } else s.title
                s.copy(
                    messages = newMessages,
                    title = newTitle,
                    updatedAt = System.currentTimeMillis(),
                )
            }
            _state.update { it.copy(composer = "", isGenerating = true, error = null) }
            runStream(prefs, activeId, placeholder.id)
        }
    }

    fun stop() {
        streamJob?.cancel()
        streamJob = null
        val activeId = _state.value.activeSession?.id
        if (activeId != null) {
            viewModelScope.launch {
                sessions.mutateOne(activeId) { s ->
                    s.copy(messages = s.messages.map { m ->
                        if (m.streaming) m.copy(streaming = false) else m
                    })
                }
            }
        }
        _state.update { it.copy(isGenerating = false) }
    }

    fun clearError() = _state.update { it.copy(error = null) }

    private fun runStream(prefs: AppPrefs, activeId: String, placeholderId: String) {
        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            try {
                val active = sessions.get(activeId) ?: return@launch
                val history = buildHistoryForRequest(active, placeholderId)
                val cfg = OpenAIClient.Config(
                    baseUrl = prefs.apiBaseUrl,
                    apiKey = prefs.apiKey,
                    model = prefs.modelId,
                )
                client.generateStream(history, cfg).collect { delta ->
                    sessions.mutateOne(activeId) { s ->
                        s.copy(messages = s.messages.map { m ->
                            if (m.id == placeholderId) m.copy(content = m.content + delta) else m
                        })
                    }
                }
                sessions.mutateOne(activeId) { s ->
                    s.copy(messages = s.messages.map { m ->
                        if (m.id == placeholderId) m.copy(streaming = false) else m
                    })
                }
                _state.update { it.copy(isGenerating = false) }
            } catch (t: Throwable) {
                sessions.mutateOne(activeId) { s ->
                    s.copy(messages = s.messages.map { m ->
                        if (m.id == placeholderId) m.copy(
                            streaming = false,
                            failed = true,
                            content = if (m.content.isEmpty())
                                "请求失败：${t.message ?: t.javaClass.simpleName}"
                            else m.content,
                        ) else m
                    })
                }
                _state.update {
                    it.copy(
                        isGenerating = false,
                        error = t.message ?: t.javaClass.simpleName,
                    )
                }
            }
        }
    }

    /**
     * Build the request history: optionally prepend the session's
     * system prompt, then include every prior user/assistant message
     * whose content is non-empty, except the streaming placeholder.
     */
    private fun buildHistoryForRequest(session: Session, placeholderId: String): List<ChatMessage> {
        val out = mutableListOf<ChatMessage>()
        if (session.systemPrompt.isNotBlank()) {
            out += ChatMessage(
                id = "sys-${session.id}",
                role = Role.SYSTEM,
                content = session.systemPrompt.trim(),
            )
        }
        for (m in session.messages) {
            if (m.id == placeholderId) continue
            if (m.content.isBlank()) continue
            out += m
        }
        return out
    }
}
