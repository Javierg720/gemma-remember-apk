package com.gemmaremember.app

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.net.URL

@CapacitorPlugin(name = "GemmaPlugin")
class GemmaPlugin : Plugin() {

    private var llm: LlmInference? = null

    companion object {
        const val MODEL_FILENAME = "gemma2b.task"
        const val MODEL_URL =
            "https://storage.googleapis.com/mediapipe-models/llm_inference/" +
            "gemma-2b-it-cpu-int4/float32/1/gemma-2b-it-cpu-int4.bin"

        fun isModelReady(context: Context): Boolean =
            File(context.filesDir, MODEL_FILENAME).exists()

        fun modelPath(context: Context): String =
            File(context.filesDir, MODEL_FILENAME).absolutePath
    }

    @PluginMethod
    fun isModelReady(call: PluginCall) {
        val result = JSObject()
        result.put("ready", isModelReady(context))
        call.resolve(result)
    }

    @PluginMethod
    fun downloadModel(call: PluginCall) {
        val url = call.getString("url") ?: MODEL_URL
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val dest = File(context.filesDir, MODEL_FILENAME)
                val conn = URL(url).openConnection()
                val total = conn.contentLengthLong
                conn.getInputStream().use { input ->
                    FileOutputStream(dest).use { output ->
                        val buf = ByteArray(8192)
                        var downloaded = 0L
                        var n: Int
                        while (input.read(buf).also { n = it } >= 0) {
                            output.write(buf, 0, n)
                            downloaded += n
                            val pct = if (total > 0) (downloaded * 100 / total).toInt() else -1
                            val evt = JSObject()
                            evt.put("percent", pct)
                            evt.put("downloaded", downloaded)
                            evt.put("total", total)
                            notifyListeners("downloadProgress", evt)
                        }
                    }
                }
                val result = JSObject()
                result.put("success", true)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Download failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val systemPrompt = call.getString("systemPrompt") ?: ""
        val query = call.getString("query")
            ?: return call.reject("query required")
        val maxTokens = call.getInt("maxTokens") ?: 512

        if (!isModelReady(context)) {
            call.reject("Model not ready. Download first.")
            return
        }

        CoroutineScope(Dispatchers.Default).launch {
            try {
                val lm = llm ?: run {
                    val opts = LlmInferenceOptions.builder()
                        .setModelPath(modelPath(context))
                        .setMaxTokens(maxTokens)
                        .setMaxTopK(40)
                        .build()
                    LlmInference.createFromOptions(context, opts).also { llm = it }
                }
                val fullPrompt = if (systemPrompt.isNotBlank())
                    "$systemPrompt\n\n$query" else query
                val response = lm.generateResponse(fullPrompt)
                val result = JSObject()
                result.put("text", response)
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Generation failed: ${e.message}")
            }
        }
    }
}
