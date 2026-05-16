package com.qinglan.chatnovel.net

import com.qinglan.chatnovel.model.ChatMessage
import com.qinglan.chatnovel.model.Role
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

/**
 * Minimal OpenAI-compatible Chat Completions client backed by
 * java.net.HttpURLConnection.
 *
 *   - generateStream(...) returns a Flow<String> of incremental
 *     content deltas as they arrive on the SSE stream.
 *   - generate(...) returns a single full assistant string.
 *
 * No third-party HTTP client / kotlinx.coroutines.flow.callbackFlow
 * is required, so the dependency footprint stays tiny.
 */
class OpenAIClient(
    private val json: Json = Json { ignoreUnknownKeys = true; isLenient = true },
) {
    data class Config(
        val baseUrl: String,
        val apiKey: String,
        val model: String,
        val temperature: Double = 0.7,
    )

    fun generateStream(messages: List<ChatMessage>, cfg: Config): Flow<String> = flow {
        val url = URL(cfg.baseUrl.trimEnd('/') + "/chat/completions")
        val body = jsonBody(messages, cfg, stream = true)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer ${cfg.apiKey}")
            setRequestProperty("Accept", "text/event-stream")
            connectTimeout = 30_000
            readTimeout = 120_000
        }
        conn.outputStream.use { it.write(body.toByteArray(StandardCharsets.UTF_8)) }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        BufferedReader(InputStreamReader(stream, StandardCharsets.UTF_8)).use { reader ->
            if (code !in 200..299) {
                val errorBody = reader.readText()
                throw RuntimeException("HTTP $code: ${errorBody.take(400)}")
            }
            var line: String? = reader.readLine()
            while (line != null) {
                if (line.startsWith("data:")) {
                    val payload = line.removePrefix("data:").trim()
                    if (payload == "[DONE]") break
                    if (payload.isNotEmpty()) {
                        val delta = extractDelta(payload) ?: ""
                        if (delta.isNotEmpty()) emit(delta)
                    }
                }
                line = reader.readLine()
            }
        }
        conn.disconnect()
    }.flowOn(Dispatchers.IO)

    private fun extractDelta(payload: String): String? = runCatching {
        val obj = json.parseToJsonElement(payload).jsonObject
        obj["choices"]?.jsonArray?.firstOrNull()?.jsonObject
            ?.get("delta")?.jsonObject
            ?.get("content")?.jsonPrimitive?.contentOrNull
    }.getOrNull()

    /**
     * Non-streaming convenience: collect the entire response as one
     * string. Built on top of [generateStream] so we don't duplicate
     * SSE parsing.
     */
    suspend fun generate(messages: List<ChatMessage>, cfg: Config): String {
        val sb = StringBuilder()
        generateStream(messages, cfg).collect { sb.append(it) }
        return sb.toString()
    }

    private fun jsonBody(messages: List<ChatMessage>, cfg: Config, stream: Boolean): String {
        val msgArr = buildJsonArray {
            for (m in messages) {
                add(buildJsonObject {
                    put("role", JsonPrimitive(when (m.role) {
                        Role.USER -> "user"
                        Role.ASSISTANT -> "assistant"
                        Role.SYSTEM -> "system"
                    }))
                    put("content", JsonPrimitive(m.content))
                })
            }
        }
        val obj = buildJsonObject {
            put("model", JsonPrimitive(cfg.model))
            put("temperature", JsonPrimitive(cfg.temperature))
            put("stream", JsonPrimitive(stream))
            put("messages", msgArr)
        }
        return json.encodeToString(JsonObject.serializer(), obj)
    }
}
