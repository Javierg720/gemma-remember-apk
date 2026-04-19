package com.gemmaremember.app

import android.graphics.BitmapFactory
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.imageembedder.ImageEmbedder
import com.google.mediapipe.tasks.vision.imageembedder.ImageEmbedder.ImageEmbedderOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID
import kotlin.math.sqrt

@CapacitorPlugin(name = "MemoryPlugin")
class MemoryPlugin : Plugin() {

    private lateinit var db: MemoryDB
    private var imageEmbedder: ImageEmbedder? = null

    companion object {
        const val CONFIDENCE_THRESHOLD = 0.70f

        fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
            var dot = 0f; var normA = 0f; var normB = 0f
            for (i in a.indices) {
                dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
            }
            return if (normA == 0f || normB == 0f) 0f
                   else dot / (sqrt(normA) * sqrt(normB))
        }
    }

    override fun load() {
        db = MemoryDB(context)
        try {
            val opts = ImageEmbedderOptions.builder()
                .setBaseOptions(BaseOptions.builder()
                    .setModelAssetPath("mobilenet_v3_small_075_224_embedder.tflite")
                    .build())
                .setQuantize(false)
                .build()
            imageEmbedder = ImageEmbedder.createFromOptions(context, opts)
        } catch (e: Throwable) {
            android.util.Log.w("MemoryPlugin", "ImageEmbedder unavailable: ${e.message}")
            imageEmbedder = null
        }
    }

    @PluginMethod
    fun getAllProfiles(call: PluginCall) {
        val arr = JSArray()
        db.getAllProfiles().forEach { p ->
            val photoPath = p["photo_path"] ?: ""
            var photoBase64 = ""
            if (photoPath.isNotBlank()) {
                try {
                    val file = java.io.File(photoPath)
                    if (file.exists()) {
                        photoBase64 = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)
                    }
                } catch (_: Exception) {}
            }
            arr.put(JSObject().apply {
                put("id", p["id"]); put("name", p["name"])
                put("relationship", p["relationship"]); put("story", p["story"])
                put("photo_path", p["photo_path"]); put("caption", p["caption"])
                put("photoBase64", photoBase64)
            })
        }
        call.resolve(JSObject().apply { put("profiles", arr) })
    }

    @PluginMethod
    fun addProfile(call: PluginCall) {
        val name = call.getString("name") ?: return call.reject("name required")
        val relationship = call.getString("relationship") ?: ""
        val story = call.getString("story") ?: ""
        val photoBase64 = call.getString("photoBase64") ?: ""
        val caption = call.getString("caption") ?: ""

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val id = UUID.randomUUID().toString()
                var photoPath = ""
                if (photoBase64.isNotBlank()) {
                    val bytes = Base64.decode(photoBase64, Base64.DEFAULT)
                    val photoFile = java.io.File(context.filesDir, "photos/${id}.jpg")
                    photoFile.parentFile?.mkdirs()
                    photoFile.writeBytes(bytes)
                    photoPath = photoFile.absolutePath
                }
                db.addProfile(id, name, relationship, story, photoPath, caption)
                if (photoBase64.isNotBlank() && imageEmbedder != null) {
                    val embedding = embedBase64(photoBase64)
                    db.storeEmbedding(UUID.randomUUID().toString(), id, "image", embedding)
                }
                call.resolve(JSObject().apply { put("id", id) })
            } catch (e: Exception) {
                call.reject("addProfile failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun deleteProfile(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        db.deleteProfile(id)
        call.resolve()
    }

    @PluginMethod
    fun findByImage(call: PluginCall) {
        val imageBase64 = call.getString("imageBase64")
            ?: return call.reject("imageBase64 required")

        if (imageEmbedder == null) {
            call.resolve(JSObject().apply { put("found", false); put("confidence", 0.0) })
            return
        }

        CoroutineScope(Dispatchers.Default).launch {
            try {
                val queryEmb = embedBase64(imageBase64)
                val all = db.getAllEmbeddings("image")

                if (all.isEmpty()) {
                    call.resolve(JSObject().apply { put("found", false); put("confidence", 0.0) })
                    return@launch
                }

                var bestId = ""; var bestScore = -1f
                for ((profileId, emb) in all) {
                    val score = cosineSimilarity(queryEmb, emb)
                    if (score > bestScore) { bestScore = score; bestId = profileId }
                }

                if (bestScore < CONFIDENCE_THRESHOLD) {
                    call.resolve(JSObject().apply { put("found", false); put("confidence", bestScore) })
                    return@launch
                }

                val match = db.getAllProfiles().firstOrNull { it["id"] == bestId }
                call.resolve(JSObject().apply {
                    put("found", true); put("confidence", bestScore)
                    put("name", match?.get("name") ?: "")
                    put("relationship", match?.get("relationship") ?: "")
                    put("story", match?.get("story") ?: "")
                    put("caption", match?.get("caption") ?: "")
                })
            } catch (e: Exception) {
                call.reject("findByImage failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun findByText(call: PluginCall) {
        val query = call.getString("query") ?: return call.reject("query required")
        CoroutineScope(Dispatchers.IO).launch {
            val q = query.lowercase().split(" ").filter { it.length > 2 }
            val profiles = db.getAllProfiles()
            val ranked = profiles.map { p ->
                val haystack = listOf(p["name"], p["relationship"], p["story"], p["caption"])
                    .joinToString(" ").lowercase()
                val score = q.sumOf { word ->
                    if (haystack.contains(word)) 1.0 else 0.0
                }
                p to score
            }.filter { it.second > 0 }.sortedByDescending { it.second }.take(3)

            val arr = JSArray()
            ranked.forEach { (p, score) ->
                arr.put(JSObject().apply {
                    put("name", p["name"]); put("relationship", p["relationship"])
                    put("story", p["story"]); put("caption", p["caption"])
                    put("score", score)
                })
            }
            call.resolve(JSObject().apply {
                put("matches", arr); put("found", ranked.isNotEmpty())
            })
        }
    }

    @PluginMethod
    fun updateStory(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        val appendText = call.getString("appendText") ?: return call.reject("appendText required")
        db.updateStory(id, appendText)
        call.resolve()
    }

    @PluginMethod
    fun addReminder(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text required")
        val date = call.getString("date")
        val time = call.getString("time")
        val recurring = call.getString("recurring")
        val category = call.getString("category")
        val id = java.util.UUID.randomUUID().toString()
        db.addReminder(id, text, date, time, recurring, category)
        call.resolve(JSObject().apply { put("id", id) })
    }

    @PluginMethod
    fun getReminders(call: PluginCall) {
        val reminders = db.getReminders()
        val arr = JSArray()
        reminders.forEach { r ->
            arr.put(JSObject().apply {
                put("id", r["id"]); put("text", r["text"])
                put("date", r["date"]); put("time", r["time"])
                put("recurring", r["recurring"]); put("category", r["category"])
            })
        }
        call.resolve(JSObject().apply { put("reminders", arr) })
    }

    @PluginMethod
    fun deleteReminder(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        db.deleteReminder(id)
        call.resolve()
    }

    private fun embedBase64(base64: String): FloatArray {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val mpImage = BitmapImageBuilder(bitmap).build()
        // floatEmbedding() returns float[] directly in tasks-vision 0.10.21
        return imageEmbedder!!.embed(mpImage)
            .embeddingResult().embeddings()[0].floatEmbedding()
    }
}
