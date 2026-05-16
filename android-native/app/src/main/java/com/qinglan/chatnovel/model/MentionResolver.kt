package com.qinglan.chatnovel.model

/**
 * Pure logic for the @-mention picker in the composer.
 *
 * The composer needs to:
 *   1. Detect when the user has just typed an `@` and is still
 *      filling in the name (caret inside the partial fragment).
 *   2. Show a filtered list of personas matching the partial.
 *   3. Replace the `@partial` with `@<full-name> ` once a chip is
 *      tapped.
 *
 * This file owns the small text-manipulation kernel so the Composable
 * stays declarative + we can unit-test the parsing rules without a
 * device.
 */
object MentionResolver {

    /** Recognised name chars: ASCII alphanumerics + underscore +
     *  hyphen + CJK unified ideographs (mirrors web app behaviour). */
    private val NAME_CHAR = Regex("[A-Za-z0-9_\\-\\u4e00-\\u9fff]")

    /**
     * Active mention fragment, if any. Returned only when:
     *   - the caret is somewhere after an `@`
     *   - between the `@` and the caret there are 0+ name chars
     *     (no whitespace, no punctuation that would end the mention)
     *
     * Returned tuple:
     *   - start: index of the `@`
     *   - end:   index of the caret (= start + 1 + partial.length)
     *   - partial: the user-typed name fragment (may be empty)
     */
    data class Fragment(val start: Int, val end: Int, val partial: String)

    fun activeMention(text: String, caret: Int): Fragment? {
        if (caret <= 0 || caret > text.length) return null
        // Walk backwards from caret looking for either `@` or the
        // first non-name char.
        var i = caret - 1
        while (i >= 0) {
            val ch = text[i]
            if (ch == '@') {
                val partial = text.substring(i + 1, caret)
                return Fragment(start = i, end = caret, partial = partial)
            }
            if (!ch.toString().matches(NAME_CHAR)) return null
            i -= 1
        }
        return null
    }

    /**
     * Filter a list of personas against the active fragment.
     * Case-insensitive prefix match on name; empty partial = full
     * list. The cap keeps the dropdown short on devices with many
     * personas.
     */
    fun candidatesFor(
        personas: List<Persona>,
        partial: String,
        limit: Int = 6,
    ): List<Persona> {
        if (personas.isEmpty()) return emptyList()
        val needle = partial.trim().lowercase()
        if (needle.isEmpty()) return personas.take(limit)
        return personas
            .filter { it.name.lowercase().startsWith(needle) || it.name.lowercase().contains(needle) }
            .take(limit)
    }

    /**
     * Replace the active fragment (`@partial`) with `@<full-name> `
     * and return both the new text and the new caret position.
     */
    data class Insertion(val newText: String, val newCaret: Int)

    fun insertMention(text: String, fragment: Fragment, persona: Persona): Insertion {
        val insert = "@${persona.name} "
        val newText = text.substring(0, fragment.start) + insert + text.substring(fragment.end)
        val newCaret = fragment.start + insert.length
        return Insertion(newText, newCaret)
    }
}
