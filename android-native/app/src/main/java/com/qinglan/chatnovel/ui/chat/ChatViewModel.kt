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
                // Seed the pendingQueue with the selected personas;
                // the run loop drains it as each turn finishes.
                val seedIds = _state.value.selectedPersonas.map { it.id }
                sessions.mutateOne(activeId) { s ->
                    s.copy(roundtable = s.roundtable.copy(pendingQueue = seedIds))
                }
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

    /**
     * Ask the LLM to extract memories the given persona should retain
     * from the active session's recent chat history, then append the
     * new (deduplicated) entries to the persona's memories pool.
     */
    fun extractMemoriesForPersona(personaId: String, onDone: (Int) -> Unit = {}) {
        if (_state.value.isGenerating) return
        val persona = _state.value.personas.firstOrNull { it.id == personaId } ?: return
        val history = _state.value.activeSession?.messages.orEmpty()
        if (history.none { it.content.isNotBlank() }) {
            _state.update { it.copy(error = "当前会话还没有可提取的对话") }
            return
        }
        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            _state.update { it.copy(isGenerating = true, error = null) }
            try {
                val prompt = com.qinglan.chatnovel.data.MemoryExtractor
                    .buildExtractionPrompt(persona, history, maxMemories = 5)
                val cfg = OpenAIClient.Config(
                    baseUrl = prefs.apiBaseUrl,
                    apiKey = prefs.apiKey,
                    model = persona.modelOverride?.takeIf { it.isNotBlank() } ?: prefs.modelId,
                )
                val reply = client.generate(
                    messages = listOf(
                        ChatMessage(id = "ex-${persona.id}", role = Role.USER, content = prompt),
                    ),
                    cfg = cfg,
                )
                val parsed = com.qinglan.chatnovel.data.MemoryExtractor.parseExtractedMemories(reply)
                val fresh = com.qinglan.chatnovel.data.MemoryExtractor
                    .dedupAgainst(persona.memories, parsed)
                if (fresh.isNotEmpty()) {
                    val entries = fresh.map {
                        com.qinglan.chatnovel.model.MemoryEntry.blank(it)
                    }
                    personaStore.mutate(personaId) { p ->
                        p.copy(memories = p.memories + entries,
                               updatedAt = System.currentTimeMillis())
                    }
                }
                onDone(fresh.size)
            } catch (t: Throwable) {
                _state.update { it.copy(error = t.message ?: t.javaClass.simpleName) }
            }
            _state.update { it.copy(isGenerating = false) }
        }
    }

    /**
     * Resume an interrupted roundtable round: re-runs the loop using
     * the persisted pendingQueue. No-op when nothing is waiting or
     * a generation is already in flight.
     */
    fun resumeRoundtable() {
        if (_state.value.isGenerating) return
        val activeId = _state.value.activeSession?.id ?: return
        val pending = sessions.get(activeId)?.roundtable?.pendingQueue.orEmpty()
        if (pending.isEmpty()) return
        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            _state.update { it.copy(isGenerating = true, error = null) }
            runRoundtableRound(prefs, activeId)
        }
    }

    /**
     * Kick off another roundtable round on the same selected personas,
     * without requiring a fresh user message — the model will see
     * the existing chat history and continue from there.
     */
    fun startAnotherRound() {
        if (_state.value.isGenerating) return
        val activeId = _state.value.activeSession?.id ?: return
        val selected = _state.value.selectedPersonas
        if (selected.isEmpty()) return
        viewModelScope.launch {
            val prefs = store.flow.first()
            if (!prefs.isApiReady()) {
                _state.update { it.copy(error = "未填写 API Key / Base URL") }
                return@launch
            }
            sessions.mutateOne(activeId) { s ->
                s.copy(roundtable = s.roundtable.copy(pendingQueue = selected.map { it.id }))
            }
            _state.update { it.copy(isGenerating = true, error = null) }
            runRoundtableRound(prefs, activeId)
        }
    }

    /** Replace the active session's manuscript text. */
    fun updateManuscript(text: String) {
        val activeId = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(activeId) {
                it.copy(manuscript = text, updatedAt = System.currentTimeMillis())
            }
        }
    }

    /**
     * Append a block to the manuscript, separated from any prior
     * content by a blank line. Useful for "send to manuscript" flows
     * from a writer persona's reply.
     */
    fun appendToManuscript(text: String) {
        if (text.isBlank()) return
        val activeId = _state.value.activeSession?.id ?: return
        viewModelScope.launch {
            sessions.mutateOne(activeId) { s ->
                val joined = if (s.manuscript.isBlank()) text.trim()
                             else s.manuscript.trimEnd() + "\n\n" + text.trim()
                s.copy(manuscript = joined, updatedAt = System.currentTimeMillis())
            }
        }
    }

    /**
     * Push the body of any message into the manuscript. UI calls this
     * from the per-message dropdown ("送入正文") so the user can
     * curate freely — pick the assistant replies that are worth
     * keeping in the long-form draft.
     */
    fun sendMessageToManuscript(messageId: String) {
        val session = _state.value.activeSession ?: return
        val target = session.messages.firstOrNull { it.id == messageId } ?: return
        appendToManuscript(target.content)
    }

    /** Recognise the "writer" persona by its roleLabel — mirrors the
     *  web app convention. */
    private fun isWriterPersona(p: Persona): Boolean =
        p.roleLabel.trim().equals("写手", ignoreCase = true) ||
        p.name.trim().equals("写手", ignoreCase = true)

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
                // Drain the persisted pendingQueue one persona at a
                // time. After each turn we write the remaining ids
                // back to disk so a stop() / process kill / phone
                // reboot leaves the round resumable.
                val totalAtStart = sessions.get(activeId)?.roundtable?.pendingQueue?.size ?: 0
                var processed = 0
                while (true) {
                    val snap = sessions.get(activeId) ?: break
                    val queueIds = snap.roundtable.pendingQueue
                    if (queueIds.isEmpty()) break
                    val nextId = queueIds.first()
                    val persona = _state.value.personas.firstOrNull { it.id == nextId }
                    // Unknown persona id — drop it and continue.
                    if (persona == null) {
                        sessions.mutateOne(activeId) { s ->
                            s.copy(roundtable = s.roundtable.copy(
                                pendingQueue = s.roundtable.pendingQueue.drop(1),
                            ))
                        }
                        continue
                    }
                    val replyText = runPersonaTurn(
                        prefs, activeId, persona,
                        roundIndex = processed,
                        totalSpeakers = totalAtStart.coerceAtLeast(processed + queueIds.size),
                        sessionSystemPrompt = snap.systemPrompt,
                    )
                    // Writer personas auto-append their prose to the manuscript so
                    // the user gets a built-up draft alongside the discussion.
                    if (isWriterPersona(persona) && replyText.isNotBlank()) {
                        sessions.mutateOne(activeId) { s ->
                            val joined = if (s.manuscript.isBlank()) replyText.trim()
                                         else s.manuscript.trimEnd() + "\n\n" + replyText.trim()
                            s.copy(manuscript = joined, updatedAt = System.currentTimeMillis())
                        }
                    }
                    // Parse @mentions from the reply; if any matches a
                    // persona that's still in the pendingQueue (and is
                    // not the one we just finished), move it to the
                    // head of the queue.
                    val mentioned = Roundtable.parseMentions(replyText, _state.value.personas)
                    sessions.mutateOne(activeId) { s ->
                        val rest = s.roundtable.pendingQueue.drop(1) // pop the persona we just ran
                        val mentionedIds = mentioned
                            .map { it.id }
                            .filter { id -> id in rest }
                            .distinct()
                        val rest2 = mentionedIds + rest.filterNot { it in mentionedIds }
                        s.copy(roundtable = s.roundtable.copy(pendingQueue = rest2))
                    }
                    processed += 1
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
            // Pick the most relevant memories using the user's last
            // message as the query — the most concrete signal the
            // persona can latch onto for the upcoming turn.
            val activeSnap = sessions.get(activeId)!!
            val lastUserText = activeSnap.messages
                .lastOrNull { it.role == Role.USER }?.content
                ?: ""
            val recalled = com.qinglan.chatnovel.model.MemoryRetrieval.pickRelevant(
                memories = persona.memories,
                query = lastUserText,
                limit = 5,
            )
            val turnSystem = Roundtable.composeSystemPrompt(
                sessionPrompt = sessionSystemPrompt,
                persona = persona,
                roundIndex = roundIndex,
                totalSpeakers = totalSpeakers,
                recalledMemories = recalled,
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
