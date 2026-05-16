package com.qinglan.chatnovel.data

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.MemoryEntry
import com.qinglan.chatnovel.model.Persona
import com.qinglan.chatnovel.model.Role
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

/**
 * Pure helpers for the "ask the LLM to extract memories" feature.
 *
 *  - buildExtractionPrompt(persona, history): assembles the user-side
 *    prompt we ship to chat completions.
 *  - parseExtractedMemories(text): best-effort parse of the LLM's
 *    response into a list of memory snippets. Accepts:
 *      1. A JSON array of strings, e.g. ["fact one", "fact two"]
 *      2. Newline-separated lines, optionally prefixed by a bullet
 *         marker ('-', '*', '•') or a number ('1.', '2)')
 *    Empties and duplicates (case-insensitive) are removed.
 *  - dedupAgainst(existing, candidates): drop snippets that are
 *    already present in the persona's memory pool.
 */
object MemoryExtractor {

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun buildExtractionPrompt(
        persona: Persona,
        history: List<ChatMessage>,
        maxMemories: Int = 5,
    ): String {
        val trimmedHistory = history
            .filter { it.content.isNotBlank() }
            .takeLast(20) // cap so the request stays cheap
            .joinToString("\n") { m ->
                val who = when (m.role) {
                    Role.USER -> "用户"
                    Role.ASSISTANT -> m.speakerName?.takeIf { it.isNotBlank() } ?: "助手"
                    Role.SYSTEM -> "系统"
                }
                "[$who] ${m.content.trim()}"
            }
        val existing = if (persona.memories.isEmpty()) ""
                       else persona.memories.joinToString("\n") { "- ${it.content}" }
        return buildString {
            append("你是「${persona.name}」（${persona.roleLabel}）。")
            append("回顾下面的对话片段，提炼出最多 $maxMemories 条你应该长期记住的关键事实，")
            append("用来在以后类似情境中保持角色一致。")
            appendLine()
            appendLine()
            appendLine("已有记忆（请不要重复）：")
            appendLine(existing.ifEmpty { "（暂无）" })
            appendLine()
            appendLine("对话片段：")
            appendLine(trimmedHistory.ifEmpty { "（无）" })
            appendLine()
            appendLine("严格按下面的 JSON 格式输出，不要任何解释、不要 markdown：")
            appendLine("[\"事实 1\", \"事实 2\", \"事实 3\"]")
            appendLine("如果没有值得记忆的内容，输出空数组：[]")
        }
    }

    fun parseExtractedMemories(text: String, maxMemories: Int = 5): List<String> {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return emptyList()
        // 1. JSON array path: find the first '[' and last ']' and try.
        val firstOpen = trimmed.indexOf('[')
        val lastClose = trimmed.lastIndexOf(']')
        if (firstOpen >= 0 && lastClose > firstOpen) {
            val slice = trimmed.substring(firstOpen, lastClose + 1)
            val parsed = runCatching {
                json.parseToJsonElement(slice).jsonArray.mapNotNull {
                    it.jsonPrimitive.contentOrNull?.trim()
                }
            }.getOrNull()
            if (parsed != null) {
                return tidy(parsed, maxMemories)
            }
        }
        // 2. Line-by-line fallback: strip bullet / numeric prefixes.
        val lines = trimmed.lines()
            .map { stripBulletPrefix(it) }
            .filter { it.isNotBlank() }
        return tidy(lines, maxMemories)
    }

    fun dedupAgainst(existing: List<MemoryEntry>, candidates: List<String>): List<String> {
        val seen = existing.map { it.content.trim().lowercase() }.toMutableSet()
        val out = mutableListOf<String>()
        for (c in candidates) {
            val key = c.trim().lowercase()
            if (key.isEmpty()) continue
            if (seen.add(key)) out += c.trim()
        }
        return out
    }

    private fun tidy(items: List<String>, maxMemories: Int): List<String> {
        val seen = mutableSetOf<String>()
        val out = mutableListOf<String>()
        for (s in items) {
            val cleaned = s.trim()
                .trim('"', '\'')
                .trim()
            if (cleaned.isEmpty()) continue
            val key = cleaned.lowercase()
            if (seen.add(key)) out += cleaned
            if (out.size >= maxMemories) break
        }
        return out
    }

    private fun stripBulletPrefix(line: String): String {
        val t = line.trim()
        if (t.isEmpty()) return t
        // Bullets: '- ', '* ', '• '
        val bulletStripped = t.removePrefix("- ").removePrefix("* ").removePrefix("• ")
        if (bulletStripped !== t) return bulletStripped.trim()
        // Numeric: '1. ', '2) ', '12. '
        val numberMatch = Regex("^(\\d+)([.)])\\s*").find(t)
        if (numberMatch != null) return t.substring(numberMatch.range.last + 1).trim()
        return t
    }
}
