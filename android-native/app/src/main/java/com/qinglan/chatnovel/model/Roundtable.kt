package com.qinglan.chatnovel.model

/**
 * Pure helpers for roundtable turn-taking. No state, no DOM — these
 * are the testable kernels that the [com.qinglan.chatnovel.ui.chat.
 * ChatViewModel] uses when running a multi-AI round.
 */
object Roundtable {

    /**
     * Parse `@aliasName` mentions out of a body of text. Aliases match
     * against a known persona set; the result preserves first-mention
     * order with duplicates removed.
     *
     * Recognised name chars: ASCII alphanumerics + underscore + hyphen
     * + CJK unified ideographs. Mirrors the web app regex.
     */
    fun parseMentions(text: String, personas: List<Persona>): List<Persona> {
        if (text.isEmpty() || personas.isEmpty()) return emptyList()
        val byName = personas.associateBy { normalize(it.name) }
        val seen = LinkedHashSet<String>()
        val out = mutableListOf<Persona>()
        val re = Regex("@([A-Za-z0-9_\\-\\u4e00-\\u9fff]+)")
        for (m in re.findAll(text)) {
            val key = normalize(m.groupValues[1])
            val target = byName[key] ?: continue
            if (seen.add(target.id)) out += target
        }
        return out
    }

    private fun normalize(name: String): String = name.trim().lowercase()

    /**
     * Move mentioned-but-already-spoken personas after the current
     * speaker. Mirrors the web app's "mention reorders the queue"
     * rule: if the order is A,B,C and A's message mentions C, the
     * remaining queue becomes [C, B]. Mentions of personas NOT in the
     * remaining queue are appended (within the same round).
     *
     * - currentIndex: index of the persona that just spoke in [order].
     * - mentioned: personas referenced by @ in their reply (parse
     *   first via [parseMentions]).
     */
    fun reorderForMentions(
        order: List<Persona>,
        currentIndex: Int,
        mentioned: List<Persona>,
    ): List<Persona> {
        if (currentIndex < 0 || currentIndex >= order.size) return order
        val before = order.subList(0, currentIndex + 1)
        val rest = order.subList(currentIndex + 1, order.size).toMutableList()
        // Move every mention to the head of rest, preserving mention order.
        val toMove = mentioned
            .map { it.id }
            .distinct()
            .filter { id -> id !in before.map { it.id } }
        // Strip them from rest first
        val rest2 = rest.filterNot { it.id in toMove }.toMutableList()
        // Then insert in the mention order at index 0
        val resolved = toMove.mapNotNull { id -> order.firstOrNull { it.id == id } }
        return before + resolved + rest2
    }

    /**
     * Build the persona's per-turn system prompt: combine the
     * session's system prompt, the persona's own prompt, and a
     * speaker-context hint.
     */
    fun composeSystemPrompt(
        sessionPrompt: String,
        persona: Persona,
        roundIndex: Int,
        totalSpeakers: Int,
        recalledMemories: List<MemoryEntry> = emptyList(),
    ): String {
        val parts = mutableListOf<String>()
        if (sessionPrompt.isNotBlank()) parts += sessionPrompt.trim()
        parts += "你扮演的角色是「${persona.name}」（${persona.roleLabel}）。"
        if (persona.prompt.isNotBlank()) parts += persona.prompt.trim()
        if (recalledMemories.isNotEmpty()) {
            val list = recalledMemories.joinToString("\n") { "- ${it.content.trim()}" }
            parts += "你长期记得的事实：\n$list"
        }
        parts += "当前轮次第 ${roundIndex + 1}/$totalSpeakers 位发言。" +
                "请直接用第一人称发言，不要复读其他人的话；不要署名，不要写场记。"
        return parts.joinToString("\n\n")
    }
}
