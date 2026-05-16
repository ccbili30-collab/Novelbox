package com.qinglan.chatnovel.model

import kotlinx.serialization.Serializable

/**
 * A roundtable participant — the native equivalent of the web app's
 * "creator / 议员" concept. Each persona has its own name + role
 * label + system prompt; they share the session's API config but
 * may override the model id.
 *
 * Persisted under [PersonaStore].
 *
 * Slim by design: the web prototype carries memory streams, per-
 * persona avatar dataURLs and per-persona API providers; Phase 3
 * brings only name + prompt + optional model override. The richer
 * features will land in Phase 4+ once the roundtable flow is stable.
 */
@Serializable
data class Persona(
    val id: String,
    val name: String,
    val roleLabel: String = "议员",
    val prompt: String = "",
    /** Optional per-persona model override; falls back to AppPrefs.modelId. */
    val modelOverride: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = createdAt,
) {
    companion object {
        fun blank(name: String = "新议员"): Persona = Persona(
            id = "p-${System.nanoTime()}",
            name = name,
        )

        /** A small library of starter personas mirroring the web app's
         *  sealed-creator presets. Shipped on first launch so users
         *  see a populated roundtable. */
        val DEFAULTS: List<Persona> = listOf(
            Persona(
                id = "p-setting",
                name = "设定师",
                roleLabel = "设定",
                prompt = "你是一位擅长世界观与设定的写作伙伴。回答时聚焦逻辑闭环、规则可证、设定相互呼应。短句即可。"
            ),
            Persona(
                id = "p-plot",
                name = "剧情师",
                roleLabel = "剧情",
                prompt = "你是一位精通故事张力与转折的写作伙伴。回答时给出冲突→选择→代价三段式，不写整段文。"
            ),
            Persona(
                id = "p-style",
                name = "文风师",
                roleLabel = "文风",
                prompt = "你是一位敏锐的文体编辑。回答时只指出文风问题与修改方向，不替作者写整段。"
            ),
            Persona(
                id = "p-skeptic",
                name = "怀疑型主创",
                roleLabel = "质疑",
                prompt = "你善于质疑设定漏洞与情感失真。每次回应只给一个最尖锐的问题，不要给答案。"
            ),
        )
    }
}
