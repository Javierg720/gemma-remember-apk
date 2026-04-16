package com.gemmaremember.app

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Conversation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.net.URL

@CapacitorPlugin(name = "GemmaPlugin")
class GemmaPlugin : Plugin() {

    private var engine: Engine? = null

    companion object {
        const val MODEL_FILENAME = "gemma4-e2b.litertlm"
        const val MODEL_URL =
            "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/" +
            "resolve/main/gemma-4-E2B-it.litertlm"

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
                conn.setRequestProperty("User-Agent", "GemmaRemember/1.0")
                val total = conn.contentLengthLong
                conn.getInputStream().use { input ->
                    FileOutputStream(dest).use { output ->
                        val buf = ByteArray(65536)
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
                // Clean up partial download
                File(context.filesDir, MODEL_FILENAME).delete()
                call.reject("Download failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun generate(call: PluginCall) {
        val systemPrompt = call.getString("systemPrompt") ?: ""
        val query = call.getString("query")
            ?: return call.reject("query required")

        if (!isModelReady(context)) {
            call.reject("Model not ready. Download first.")
            return
        }

        CoroutineScope(Dispatchers.Default).launch {
            try {
                val eng = engine ?: run {
                    val config = EngineConfig(modelPath = modelPath(context))
                    Engine(config).also {
                        it.initialize()
                        engine = it
                    }
                }
                eng.createConversation().use { conversation ->
                    val fullPrompt = if (systemPrompt.isNotBlank())
                        "$systemPrompt\n\n$query" else query
                    val response = conversation.sendMessage(fullPrompt)
                    val result = JSObject()
                    result.put("text", response)
                    call.resolve(result)
                }
            } catch (e: Exception) {
                call.reject("Generation failed: ${e.message}")
            }
        }
    }
}
