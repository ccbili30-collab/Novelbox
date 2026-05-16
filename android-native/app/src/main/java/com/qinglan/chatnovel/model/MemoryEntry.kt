package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

/**
 * A single fact / preference / observation attached to a persona.
 *
 * Designed to be small and dense so a handful of entries can be
 * concatenated into the persona's per-turn system prompt without
 * blowing the token budget.
 *
 * - id: stable identifier (for delete / dedup).
 * - content: the actual snippet text the persona will recall.
 * - createdAt: ms epoch, used for recency tie-breakers.
 * - pinned: when true the entry is always included regardless of
 *   relevance scoring. Useful for "core" facts like the persona's
 *   relationship to the user.
 */
@Serializable
data class MemoryEntry(
    val id: String,
    val content: String,
    val createdAt: Long = System.currentTimeMillis(),
    val pinned: Boolean = false,
) {
    companion object {
        fun blank(content: String = ""): MemoryEntry = MemoryEntry(
            id = "m-${System.nanoTime()}",
            content = content,
        )
    }
}

/**
 * Pure retrieval kernel for picking memory entries to inject into a
 * persona's system prompt.
 *
 * Phase 11 scope is intentionally simple: every entry gets a score
 * combining
 *   - pinned bonus (huge, so pinned entries always make it)
 *   - case-insensitive substring overlap with the query
 *   - recency tie-breaker
 * The top K entries are returned; if K > available, all are
 * returned in descending score / recency order.
 */
object MemoryRetrieval {

    fun pickRelevant(
        memories: List<MemoryEntry>,
        query: String,
        limit: Int = 5,
    ): List<MemoryEntry> {
        if (memories.isEmpty() || limit <= 0) return emptyList()
        val q = query.trim().lowercase()
        // Score = pinned*1000 + overlap*10 + recencyRank
        val scored = memories.withIndex().map { (idx, m) ->
            val pinnedScore = if (m.pinned) 1000 else 0
            val overlap = if (q.isEmpty()) 0
                          else countSubstringHits(m.content.lowercase(), q)
            // Higher createdAt → higher recencyRank.
            val recency = m.createdAt / 1_000  // seconds since epoch as the rank
            (idx to m) to (pinnedScore + overlap * 10 + recency)
        }
        return scored
            .sortedByDescending { it.second }
            .map { it.first.second }
            .take(limit)
    }

    /**
     * Count "shared n-gram" hits between a memory body and a query.
     * For ASCII queries we split on whitespace and count every
     * occurrence (not just first) of each word ≥ 2 chars. For CJK
     * queries we sliding-window match 2-char substrings. Simple but
     * works without external NLP deps.
     */
    private fun countSubstringHits(body: String, query: String): Int {
        if (body.isEmpty() || query.isEmpty()) return 0
        val words = query.split(' ', '\n', '\t').filter { it.length >= 2 }
        var ascii = 0
        for (w in words) ascii += occurrences(body, w)
        var cjk = 0
        if (query.length >= 2) {
            for (i in 0..query.length - 2) {
                val gram = query.substring(i, i + 2)
                if (gram.any { it.code in 0x4E00..0x9FFF }) {
                    cjk += occurrences(body, gram)
                }
            }
        }
        return ascii + cjk
    }

    /** Count non-overlapping occurrences of [needle] in [haystack]. */
    private fun occurrences(haystack: String, needle: String): Int {
        if (needle.isEmpty()) return 0
        var count = 0
        var i = 0
        while (true) {
            val pos = haystack.indexOf(needle, i)
            if (pos < 0) break
            count += 1
            i = pos + needle.length
        }
        return count
    }
}
