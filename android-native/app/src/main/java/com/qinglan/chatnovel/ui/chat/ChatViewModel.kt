package com.qinglan.chatnovel.ui.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.qinglan.chatnovel.TBirdApplication
import com.qinglan.chatnovel.data.AppPrefs
import com.qinglan.chatnovel.data.PersonaStore
import com.qinglan.chatnovel.data.SessionStore
import com.qinglan.chatnovel.data.SettingsStore
import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Persona
import com.qinglan.chatnovel.model.Role
import com.qinglan.chatnovel.model.Roundtable
import com.qinglan.chatnovel.model.RoundtableConfig
import com.qinglan.chatnovel.model.Session
import com.qinglan.chatnovel.net.OpenAIClient
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChatUiState(
    val activeSession: Session? = null,
    val sessions: List<Session> = emptyList(),
    val personas: List<Persona> = emptyList(),
    val composer: String = "",
    val isGenerating: Boolean = false,
    val error: String? = null,
) {
    val messages: List<ChatMessage> get() = activeSession?.messages ?: emptyList()
    val systemPrompt: String get() = activeSession?.systemPrompt.orEmpty()
    val roundtable: RoundtableConfig get() = activeSession?.roundtable ?: RoundtableConfig()
    val selectedPersonas: List<Persona>
        get() = roundtable.personaIds.mapNotNull { id -> personas.firstOrNull { it.id == id } }
}

class ChatViewModel(
    private val store: SettingsStore = TBirdApplication.get().settingsStore,
    private val sessions: SessionStore = TBirdApplication.get().sessionStore,
    private val personaStore: PersonaStore = TBirdApplication.get().personaStore,
    private val client: OpenAIClient = OpenAIClient(),
) : ViewModel() {

    private val _state = MutableStateFlow(ChatUiState())
    val state: StateFlow<ChatUiState> = _state

    private var streamJob: Job? = null

    init {
        combine(
            sessions.sessions,
            sessions.activeId,
            personaStore.personas,
        ) { all, id, personas ->
            val active = id?.let { aid -> all.firstOrNull { it.id == aid } } ?: all.firstOrNull()
            if (active == null) {
                viewModelScope.launch { sessions.newSession() }
                ChatUiState(activeSession = null, sessions = all, personas = personas)
            } else {
                ChatUiState(
                    activeSession = active,
                    sessions = all,
                    personas = personas,
                )
            }
        }.onEach { snapshot ->
            _state.update { prev ->
                snapshot.copy(
                    composer = prev.composer,
                    isGenerating = prev.isGenerating,
                    error = prev.error,
                )
            }
        }.launchIn(viewModelScope)
    }

    fun updateComposer(text: String) { _state.update { it.copy(composer = text) } }

    fun switchSession(id: String) {
        if (_state.value.isGenerating) stop()
        viewModelScope.launch { sessions.setActive(id) }
    }

    fun newSession() {
        if (_state.value.isGenerating) stop()
        viewModelScope.launch { sessions.newSession() }
    }

    fun deleteSession(id: String) { viewModelScope.launch { sessions.delete(id) } }

    fun renameSession(id: String, title: String) {
        viewModelScope.launch { sessions.rename(id, title) }
    }

    fun setSystemPrompt(prompt: String) {
        val id = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(id) { it.copy(systemPrompt = prompt, updatedAt = System.currentTimeMillis()) }
        }
    }

    fun toggleRoundtable() {
        val id = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(id) { s ->
                s.copy(
                    roundtable = s.roundtable.copy(enabled = !s.roundtable.enabled),
                    updatedAt = System.currentTimeMillis(),
                )
            }
        }
    }

    fun toggleRoundtableMember(personaId: String) {
        val id = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(id) { s ->
                val list = s.roundtable.personaIds.toMutableList()
                if (personaId in list) list.remove(personaId) else list.add(personaId)
                s.copy(
                    roundtable = s.roundtable.copy(personaIds = list),
                    updatedAt = System.currentTimeMillis(),
                )
            }
        }
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
            sessions.mutateOne(activeId) { s ->
                val newMessages = s.messages + userMsg
                val newTitle = if (s.messages.isEmpty())
                    s.copy(messages = newMessages).deriveTitle() else s.title
                s.copy(
                    messages = newMessages,
                    title = newTitle,
                    updatedAt = System.currentTimeMillis(),
                )
            }
            _state.update { it.copy(composer = "", isGenerating = true, error = null) }

            val active = sessions.get(activeId) ?: run {
                _state.update { it.copy(isGenerating = false) }
                return@launch
            }
            if (active.roundtable.enabled && _state.value.selectedPersonas.isNotEmpty()) {
                runRoundtableRound(prefs, activeId)
            } else {
                val placeholder = ChatMessage.assistantPlaceholder()
                sessions.mutateOne(activeId) { it.copy(messages = it.messages + placeholder) }
                runSingleAssistant(prefs, activeId, placeholder.id)
            }
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

    /** Remove a single message from the active session. */
    fun deleteMessage(messageId: String) {
        val activeId = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(activeId) { s ->
                s.copy(
                    messages = s.messages.filterNot { it.id == messageId },
                    updatedAt = System.currentTimeMillis(),
                )
            }
        }
    }

    /**
     * Re-generate an assistant message in place. Drop that message and
     * every later message (they were predicated on it), then re-run
     * the same generation path: persona turn for roundtable replies,
     * single-assistant pipeline for plain chats.
     */
    fun regenerateMessage(messageId: String) {
        if (_state.value.isGenerating) return
        val activeId = _state.value.activeSession?.id ?: return
        val active = sessions.get(activeId) ?: return
        val target = active.messages.firstOrNull { it.id == messageId } ?: return
        if (target.role != Role.ASSISTANT) return

        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            // Truncate the session at and after the target message.
            val keep = active.messages.takeWhile { it.id != messageId }
            sessions.mutateOne(activeId) { s ->
                s.copy(messages = keep, updatedAt = System.currentTimeMillis())
            }
            _state.update { it.copy(isGenerating = true, error = null) }

            val personaId = target.speakerId
            val persona = personaId?.let { id -> _state.value.personas.firstOrNull { it.id == id } }
            if (persona != null) {
                val snap = sessions.get(activeId)!!
                runPersonaTurn(
                    prefs = prefs,
                    activeId = activeId,
                    persona = persona,
                    roundIndex = 0,
                    totalSpeakers = 1,
                    sessionSystemPrompt = snap.systemPrompt,
                )
            } else {
                val placeholder = ChatMessage.assistantPlaceholder()
                sessions.mutateOne(activeId) { it.copy(messages = it.messages + placeholder) }
                runSingleAssistant(prefs, activeId, placeholder.id)
            }
            _state.update { it.copy(isGenerating = false) }
        }
    }

    // ---------- single-assistant path ----------

    private fun runSingleAssistant(prefs: AppPrefs, activeId: String, placeholderId: String) {
        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            try {
                val active = sessions.get(activeId) ?: return@launch
                val history = buildSingleHistory(active, placeholderId)
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
                markStreamDone(activeId, placeholderId)
            } catch (t: Throwable) {
                markStreamFailed(activeId, placeholderId, t)
            }
            _state.update { it.copy(isGenerating = false) }
        }
    }

    private fun buildSingleHistory(session: Session, placeholderId: String): List<ChatMessage> {
        val out = mutableListOf<ChatMessage>()
        if (session.systemPrompt.isNotBlank()) {
            out += ChatMessage(id = "sys-${session.id}", role = Role.SYSTEM, content = session.systemPrompt.trim())
        }
        for (m in session.messages) {
            if (m.id == placeholderId) continue
            if (m.content.isBlank()) continue
            out += m
        }
        return out
    }

    // ---------- roundtable path ----------

    private fun runRoundtableRound(prefs: AppPrefs, activeId: String) {
        streamJob?.cancel()
        streamJob = viewModelScope.launch {
            try {
                val active = sessions.get(activeId)!!
                val initialOrder = active.roundtable.personaIds
                    .mapNotNull { pid -> _state.value.personas.firstOrNull { it.id == pid } }
                var queue: List<Persona> = initialOrder
                var idx = 0
                while (idx < queue.size) {
                    val persona = queue[idx]
                    val replyText = runPersonaTurn(prefs, activeId, persona, idx, queue.size, active.systemPrompt)
                    // Re-order remaining personas based on @mentions in the reply.
                    val mentioned = Roundtable.parseMentions(replyText, _state.value.personas)
                    queue = Roundtable.reorderForMentions(queue, idx, mentioned)
                    idx += 1
                }
            } catch (t: Throwable) {
                _state.update { it.copy(error = t.message ?: t.javaClass.simpleName) }
            }
            _state.update { it.copy(isGenerating = false) }
        }
    }

    /**
     * Run one persona's turn. Inserts a placeholder bubble tagged with
     * the speaker id/name, streams the reply into it, and returns the
     * final reply text (used by the caller to parse @mentions for
     * queue reordering).
     */
    private suspend fun runPersonaTurn(
        prefs: AppPrefs,
        activeId: String,
        persona: Persona,
        roundIndex: Int,
        totalSpeakers: Int,
        sessionSystemPrompt: String,
    ): String {
        val placeholder = ChatMessage.assistantPlaceholder(
            speakerId = persona.id,
            speakerName = persona.name,
        )
        sessions.mutateOne(activeId) { it.copy(messages = it.messages + placeholder) }
        try {
            val turnSystem = Roundtable.composeSystemPrompt(
                sessionPrompt = sessionSystemPrompt,
                persona = persona,
                roundIndex = roundIndex,
                totalSpeakers = totalSpeakers,
            )
            val history = buildRoundtableHistoryFor(persona, sessions.get(activeId)!!, placeholder.id, turnSystem)
            val cfg = OpenAIClient.Config(
                baseUrl = prefs.apiBaseUrl,
                apiKey = prefs.apiKey,
                model = persona.modelOverride?.takeIf { it.isNotBlank() } ?: prefs.modelId,
            )
            val collected = StringBuilder()
            client.generateStream(history, cfg).collect { delta ->
                collected.append(delta)
                sessions.mutateOne(activeId) { s ->
                    s.copy(messages = s.messages.map { m ->
                        if (m.id == placeholder.id) m.copy(content = m.content + delta) else m
                    })
                }
            }
            markStreamDone(activeId, placeholder.id)
            return collected.toString()
        } catch (t: Throwable) {
            markStreamFailed(activeId, placeholder.id, t)
            return ""
        }
    }

    /**
     * Build the message list for one persona's turn. The persona's
     * own system prompt comes first; the user's last message + every
     * prior assistant reply (tagged with its speaker name as a small
     * prefix so the model knows who said what) become the chat history.
     */
    private fun buildRoundtableHistoryFor(
        persona: Persona,
        session: Session,
        placeholderId: String,
        turnSystem: String,
    ): List<ChatMessage> {
        val out = mutableListOf<ChatMessage>()
        out += ChatMessage(id = "sys-${persona.id}", role = Role.SYSTEM, content = turnSystem)
        for (m in session.messages) {
            if (m.id == placeholderId) continue
            if (m.content.isBlank()) continue
            // Tag assistant messages with the speaker name so the model
            // can follow the conversation flow.
            val tagged = if (m.role == Role.ASSISTANT && !m.speakerName.isNullOrBlank()) {
                m.copy(content = "[${m.speakerName}] ${m.content}")
            } else m
            out += tagged
        }
        return out
    }

    // ---------- shared finalizers ----------

    private suspend fun markStreamDone(activeId: String, placeholderId: String) {
        sessions.mutateOne(activeId) { s ->
            s.copy(messages = s.messages.map { m ->
                if (m.id == placeholderId) m.copy(streaming = false) else m
            })
        }
    }

    private suspend fun markStreamFailed(activeId: String, placeholderId: String, t: Throwable) {
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
        _state.update { it.copy(error = t.message ?: t.javaClass.simpleName) }
    }
}
