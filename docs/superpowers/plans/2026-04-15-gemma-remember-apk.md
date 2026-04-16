# Gemma Remember APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package the existing Gemma Remember web app as a signed Android APK with on-device Gemma 2B (MediaPipe LLM Inference) replacing keyword matching, and MediaPipe ImageEmbedder replacing random photo identification — fully offline after a one-time ~1.5 GB model download.

**Architecture:** Capacitor 6 wraps `gemma-remember-edit/` web assets (copied to `gemma-remember-apk/src/`). Two Kotlin plugins (`GemmaPlugin`, `MemoryPlugin`) bridge JavaScript to MediaPipe LLM Inference and ImageEmbedder. Family profiles live in SQLite with pre-computed image embeddings; cosine similarity computed in Kotlin at query time. Text search uses keyword matching against stored story text (sufficient for dementia-care structured data). All assets offline after first launch.

**Tech Stack:** Node.js 20+, Capacitor 6, Kotlin 1.9, Android API 26+, MediaPipe Tasks Android (`tasks-genai:0.10.21`, `tasks-vision:0.10.21`), SQLite (raw `SQLiteOpenHelper`), `@capacitor-community/text-to-speech`

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `gemma-remember-apk/package.json` | Create | Capacitor npm project |
| `gemma-remember-apk/capacitor.config.json` | Create | Capacitor config |
| `gemma-remember-apk/src/index.html` | Copy + modify | Add modelSetup screen |
| `gemma-remember-apk/src/app.js` | Copy + 5 edits | Wire plugins, replace AI |
| `gemma-remember-apk/src/style.css` | Copy | Unchanged |
| `gemma-remember-apk/src/assets/` | Copy | Images |
| `android/app/build.gradle` | Modify | MediaPipe + TTS deps, signing |
| `android/app/src/main/AndroidManifest.xml` | Modify | Permissions |
| `android/app/src/main/java/com/gemmaremember/MainActivity.kt` | Modify | Register plugins |
| `android/app/src/main/java/com/gemmaremember/GemmaPlugin.kt` | Create | LLM Inference bridge |
| `android/app/src/main/java/com/gemmaremember/MemoryDB.kt` | Create | SQLite schema + CRUD |
| `android/app/src/main/java/com/gemmaremember/MemoryPlugin.kt` | Create | Embeddings + search bridge |
| `android/app/src/main/assets/mobilenet_v3_small_075_224_embedder.tflite` | Download | Image embedder model |
| `android/app/src/androidTest/java/com/gemmaremember/GemmaPluginTest.kt` | Create | Plugin tests |
| `android/app/src/androidTest/java/com/gemmaremember/MemoryPluginTest.kt` | Create | Plugin tests |

---

## Task 1: Scaffold Capacitor project and copy web assets

**Files:**
- Create: `gemma-remember-apk/package.json`
- Create: `gemma-remember-apk/capacitor.config.json`
- Create: `gemma-remember-apk/src/` (copied from `gemma-remember-edit/`)

- [ ] **Step 1: Create project and install dependencies**

```bash
cd /home/javier/Documents/apex-20260414T062318Z-3-001
mkdir gemma-remember-apk && cd gemma-remember-apk
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor-community/text-to-speech
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 2: Create `capacitor.config.json`**

```json
{
  "appId": "com.gemmaremember.app",
  "appName": "Gemma Remember",
  "webDir": "src",
  "android": {
    "allowMixedContent": false,
    "minWebViewVersion": 60
  },
  "plugins": {
    "TextToSpeech": {
      "language": "en-US"
    }
  }
}
```

- [ ] **Step 3: Copy web assets**

```bash
mkdir -p src
cp ../gemma-remember-edit/index.html src/
cp ../gemma-remember-edit/app.js src/
cp ../gemma-remember-edit/style.css src/
cp ../gemma-remember-edit/responses.json src/
cp -r ../gemma-remember-edit/assets src/
```

- [ ] **Step 4: Initialize Capacitor and add Android**

```bash
npx cap init "Gemma Remember" "com.gemmaremember.app" --web-dir src
npx cap add android
```

Expected: `android/` directory created.

- [ ] **Step 5: Verify `MainActivity.kt` exists**

```bash
ls android/app/src/main/java/com/gemmaremember/
```

Expected: `MainActivity.kt` listed.

- [ ] **Step 6: Initialize git and commit**

```bash
git init
echo "node_modules/\nandroid/.gradle/\nandroid/build/\n*.apk\n*.jks" > .gitignore
git add .
git commit -m "feat: scaffold Capacitor project with web assets"
```

---

## Task 2: Configure Android build dependencies and permissions

**Files:**
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Add dependencies to `android/app/build.gradle`**

Find `dependencies {` and add inside it (keep existing Capacitor lines):

```gradle
    // TTS plugin
    implementation "com.capacitorjs.plugins:text-to-speech:1.1.2"

    // MediaPipe Tasks
    implementation "com.google.mediapipe:tasks-genai:0.10.21"
    implementation "com.google.mediapipe:tasks-vision:0.10.21"

    // Tests
    androidTestImplementation "androidx.test.ext:junit:1.1.5"
    androidTestImplementation "androidx.test.espresso:espresso-core:3.5.1"
```

Also ensure `minSdk 26` in `defaultConfig {}`:

```gradle
    defaultConfig {
        minSdk 26
        targetSdk 34
        // ... keep existing fields
    }
```

- [ ] **Step 2: Add permissions to `AndroidManifest.xml`**

Inside `<manifest>` before `<application>`:

```xml
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
        android:maxSdkVersion="32" />
```

- [ ] **Step 3: Verify debug build**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 4: Commit**

```bash
git add android/app/build.gradle android/app/src/main/AndroidManifest.xml
git commit -m "feat: add MediaPipe and TTS dependencies, set minSdk 26"
```

---

## Task 3: Implement GemmaPlugin.kt

**Files:**
- Create: `android/app/src/main/java/com/gemmaremember/GemmaPlugin.kt`
- Create: `android/app/src/androidTest/java/com/gemmaremember/GemmaPluginTest.kt`

- [ ] **Step 1: Write the failing test**

Create `android/app/src/androidTest/java/com/gemmaremember/GemmaPluginTest.kt`:

```kotlin
package com.gemmaremember

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class GemmaPluginTest {

    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun isModelReady_returnsFalse_whenModelFileAbsent() {
        File(context.filesDir, "gemma2b.task").delete()
        assertFalse(GemmaPlugin.isModelReady(context))
    }

    @Test
    fun isModelReady_returnsTrue_whenModelFilePresent() {
        val f = File(context.filesDir, "gemma2b.task")
        f.writeText("placeholder")
        assertTrue(GemmaPlugin.isModelReady(context))
        f.delete()
    }
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.GemmaPluginTest" 2>&1 | tail -15
```

Expected: FAIL with `Unresolved reference: GemmaPlugin`

- [ ] **Step 3: Implement `GemmaPlugin.kt`**

Create `android/app/src/main/java/com/gemmaremember/GemmaPlugin.kt`:

```kotlin
package com.gemmaremember

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
                        .setTopK(40)
                        .setTemperature(0.7f)
                        .setRandomSeed(42)
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.GemmaPluginTest" 2>&1 | tail -10
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/gemmaremember/GemmaPlugin.kt \
        android/app/src/androidTest/java/com/gemmaremember/GemmaPluginTest.kt
git commit -m "feat: GemmaPlugin — MediaPipe LLM Inference with model download"
```

---

## Task 4: Implement MemoryDB.kt — SQLite schema and profile CRUD

**Files:**
- Create: `android/app/src/main/java/com/gemmaremember/MemoryDB.kt`
- Create: `android/app/src/androidTest/java/com/gemmaremember/MemoryDBTest.kt`

- [ ] **Step 1: Write the failing test**

Create `android/app/src/androidTest/java/com/gemmaremember/MemoryDBTest.kt`:

```kotlin
package com.gemmaremember

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MemoryDBTest {

    private lateinit var db: MemoryDB

    @Before fun setUp() {
        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        ctx.deleteDatabase("memory.db")
        db = MemoryDB(ctx)
    }

    @After fun tearDown() { db.close() }

    @Test
    fun addProfile_storesAndRetrievesProfile() {
        db.addProfile("p1", "Sarah", "daughter",
            "Sarah bakes cookies every Christmas.", "", "Sarah at graduation")
        val profiles = db.getAllProfiles()
        assertEquals(1, profiles.size)
        assertEquals("Sarah", profiles[0]["name"])
        assertEquals("daughter", profiles[0]["relationship"])
    }

    @Test
    fun getAllProfiles_empty_whenNoneAdded() {
        assertEquals(0, db.getAllProfiles().size)
    }

    @Test
    fun deleteProfile_removesProfile() {
        db.addProfile("p1", "Robert", "husband", "Robert loved fishing.", "", "")
        db.deleteProfile("p1")
        assertEquals(0, db.getAllProfiles().size)
    }

    @Test
    fun storeAndRetrieveEmbedding_roundTrips() {
        db.addProfile("p1", "Sarah", "daughter", "story", "", "")
        val original = floatArrayOf(1f, 2f, 3f)
        db.storeEmbedding("e1", "p1", "image", original)
        val retrieved = db.getAllEmbeddings("image")
        assertEquals(1, retrieved.size)
        assertEquals("p1", retrieved[0].first)
        assertArrayEquals(original, retrieved[0].second, 0.001f)
    }
}
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.MemoryDBTest" 2>&1 | tail -10
```

Expected: FAIL with `Unresolved reference: MemoryDB`

- [ ] **Step 3: Implement `MemoryDB.kt`**

Create `android/app/src/main/java/com/gemmaremember/MemoryDB.kt`:

```kotlin
package com.gemmaremember

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.nio.ByteBuffer

class MemoryDB(context: Context) :
    SQLiteOpenHelper(context, "memory.db", null, 1) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                relationship TEXT,
                story TEXT,
                photo_path TEXT,
                caption TEXT
            )
        """)
        db.execSQL("""
            CREATE TABLE embeddings (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                type TEXT NOT NULL,
                embedding BLOB NOT NULL,
                FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            )
        """)
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        db.execSQL("DROP TABLE IF EXISTS embeddings")
        db.execSQL("DROP TABLE IF EXISTS profiles")
        onCreate(db)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        db.setForeignKeyConstraintsEnabled(true)
    }

    fun addProfile(id: String, name: String, relationship: String,
                   story: String, photoPath: String, caption: String) {
        writableDatabase.insertOrThrow("profiles", null, ContentValues().apply {
            put("id", id); put("name", name); put("relationship", relationship)
            put("story", story); put("photo_path", photoPath); put("caption", caption)
        })
    }

    fun getAllProfiles(): List<Map<String, String>> {
        val result = mutableListOf<Map<String, String>>()
        readableDatabase.query("profiles", null, null, null, null, null, null).use { c ->
            while (c.moveToNext()) {
                result.add(mapOf(
                    "id" to (c.getString(c.getColumnIndexOrThrow("id")) ?: ""),
                    "name" to (c.getString(c.getColumnIndexOrThrow("name")) ?: ""),
                    "relationship" to (c.getString(c.getColumnIndexOrThrow("relationship")) ?: ""),
                    "story" to (c.getString(c.getColumnIndexOrThrow("story")) ?: ""),
                    "photo_path" to (c.getString(c.getColumnIndexOrThrow("photo_path")) ?: ""),
                    "caption" to (c.getString(c.getColumnIndexOrThrow("caption")) ?: "")
                ))
            }
        }
        return result
    }

    fun deleteProfile(id: String) {
        writableDatabase.delete("profiles", "id = ?", arrayOf(id))
    }

    fun storeEmbedding(id: String, profileId: String, type: String, embedding: FloatArray) {
        val buf = ByteBuffer.allocate(embedding.size * 4)
        embedding.forEach { buf.putFloat(it) }
        writableDatabase.insertOrThrow("embeddings", null, ContentValues().apply {
            put("id", id); put("profile_id", profileId)
            put("type", type); put("embedding", buf.array())
        })
    }

    fun getAllEmbeddings(type: String): List<Pair<String, FloatArray>> {
        val result = mutableListOf<Pair<String, FloatArray>>()
        readableDatabase.query("embeddings", null,
            "type = ?", arrayOf(type), null, null, null).use { c ->
            while (c.moveToNext()) {
                val profileId = c.getString(c.getColumnIndexOrThrow("profile_id"))
                val blob = c.getBlob(c.getColumnIndexOrThrow("embedding"))
                val buf = ByteBuffer.wrap(blob)
                val floats = FloatArray(blob.size / 4) { buf.float }
                result.add(profileId to floats)
            }
        }
        return result
    }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.MemoryDBTest" 2>&1 | tail -10
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/gemmaremember/MemoryDB.kt \
        android/app/src/androidTest/java/com/gemmaremember/MemoryDBTest.kt
git commit -m "feat: MemoryDB — SQLite schema with profile CRUD and embedding storage"
```

---

## Task 5: Implement MemoryPlugin.kt — image embedding, cosine search, text search

**Files:**
- Create: `android/app/src/main/java/com/gemmaremember/MemoryPlugin.kt`
- Download: `android/app/src/main/assets/mobilenet_v3_small_075_224_embedder.tflite`
- Create: `android/app/src/androidTest/java/com/gemmaremember/MemoryPluginTest.kt`

- [ ] **Step 1: Download the image embedder model asset**

```bash
mkdir -p android/app/src/main/assets
curl -L -o android/app/src/main/assets/mobilenet_v3_small_075_224_embedder.tflite \
  "https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small_075_224_embedder/float32/1/mobilenet_v3_small_075_224_embedder.tflite"
ls -lh android/app/src/main/assets/mobilenet_v3_small_075_224_embedder.tflite
```

Expected: file ~2.5 MB.

- [ ] **Step 2: Write the failing test**

Create `android/app/src/androidTest/java/com/gemmaremember/MemoryPluginTest.kt`:

```kotlin
package com.gemmaremember

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MemoryPluginTest {

    @Test
    fun cosineSimilarity_identicalVectors_returnsOne() {
        val a = floatArrayOf(1f, 0f, 0f)
        assertEquals(1.0f, MemoryPlugin.cosineSimilarity(a, a), 0.001f)
    }

    @Test
    fun cosineSimilarity_orthogonalVectors_returnsZero() {
        val a = floatArrayOf(1f, 0f)
        val b = floatArrayOf(0f, 1f)
        assertEquals(0.0f, MemoryPlugin.cosineSimilarity(a, b), 0.001f)
    }

    @Test
    fun cosineSimilarity_oppositeVectors_returnsNegativeOne() {
        val a = floatArrayOf(1f, 0f)
        val b = floatArrayOf(-1f, 0f)
        assertEquals(-1.0f, MemoryPlugin.cosineSimilarity(a, b), 0.001f)
    }
}
```

- [ ] **Step 3: Run test — verify it fails**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.MemoryPluginTest" 2>&1 | tail -10
```

Expected: FAIL with `Unresolved reference: MemoryPlugin`

- [ ] **Step 4: Implement `MemoryPlugin.kt`**

Create `android/app/src/main/java/com/gemmaremember/MemoryPlugin.kt`:

```kotlin
package com.gemmaremember

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
        val opts = ImageEmbedderOptions.builder()
            .setBaseOptions(BaseOptions.builder()
                .setModelAssetPath("mobilenet_v3_small_075_224_embedder.tflite")
                .build())
            .setQuantize(false)
            .build()
        imageEmbedder = ImageEmbedder.createFromOptions(context, opts)
    }

    @PluginMethod
    fun getAllProfiles(call: PluginCall) {
        val arr = JSArray()
        db.getAllProfiles().forEach { p ->
            arr.put(JSObject().apply {
                put("id", p["id"]); put("name", p["name"])
                put("relationship", p["relationship"]); put("story", p["story"])
                put("photo_path", p["photo_path"]); put("caption", p["caption"])
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
                db.addProfile(id, name, relationship, story, "", caption)
                if (photoBase64.isNotBlank()) {
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

    private fun embedBase64(base64: String): FloatArray {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        val mpImage = BitmapImageBuilder(bitmap).build()
        return imageEmbedder!!.embed(mpImage)
            .embeddingResult().embeddings()[0].floatEmbedding().toFloatArray()
    }
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd android && ./gradlew connectedAndroidTest \
  --tests "com.gemmaremember.MemoryPluginTest" 2>&1 | tail -10
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/gemmaremember/MemoryPlugin.kt \
        android/app/src/main/assets/mobilenet_v3_small_075_224_embedder.tflite \
        android/app/src/androidTest/java/com/gemmaremember/MemoryPluginTest.kt
git commit -m "feat: MemoryPlugin — image embedding, cosine search, text search"
```

---

## Task 6: Register plugins in MainActivity.kt

**Files:**
- Modify: `android/app/src/main/java/com/gemmaremember/MainActivity.kt`

- [ ] **Step 1: Register both plugins**

Replace the full contents of `MainActivity.kt`:

```kotlin
package com.gemmaremember

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(GemmaPlugin::class.java)
        registerPlugin(MemoryPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

- [ ] **Step 2: Verify debug build succeeds**

```bash
cd android && ./gradlew assembleDebug 2>&1 | tail -5
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/gemmaremember/MainActivity.kt
git commit -m "feat: register GemmaPlugin and MemoryPlugin in MainActivity"
```

---

## Task 7: Modify src/app.js — 5 targeted edits

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add plugin references and system prompt at top of file**

After the first line (`// ===== DATA =====`), insert:

```javascript
// ===== CAPACITOR PLUGINS =====
const GemmaPlugin = window.Capacitor?.Plugins?.GemmaPlugin ?? null;
const MemoryPlugin = window.Capacitor?.Plugins?.MemoryPlugin ?? null;
const TextToSpeech = window.Capacitor?.Plugins?.TextToSpeech ?? null;

const SYSTEM_PROMPT = `You are Memory Anchor, a warm and patient companion for someone with dementia.
RULES:
- ONLY use the facts from RETRIEVED MEMORIES below.
- NEVER invent names, dates, or stories not in the memories.
- If confidence is low, say gently: "I'm not sure — could you tell me more about them?"
- Speak simply and warmly. Use the person's name early.
- Reference specific shared memories to spark recognition.`;
```

- [ ] **Edit 1: Replace `speak()` — swap Vercel TTS for Android TTS**

Find and replace the entire `speak()` function (~lines 18–44):

```javascript
async function speak(text) {
  if (!ttsEnabled || !text) return;
  stopSpeaking();
  try {
    if (TextToSpeech) {
      await TextToSpeech.speak({ text, lang: 'en-US', rate: 0.9 });
    } else if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  } catch (err) {
    console.error('TTS error:', err);
  }
}
```

- [ ] **Edit 2: Replace `loadData()` — load from MemoryPlugin instead of responses.json**

Find and replace the `loadData()` function:

```javascript
async function loadData() {
  if (MemoryPlugin) {
    const { profiles } = await MemoryPlugin.getAllProfiles();
    DATA = { photo_queries: {}, text_queries: {} };
    profiles.forEach(p => { DATA.photo_queries[p.id] = p; });
  } else {
    const res = await fetch('responses.json');
    DATA = await res.json();
  }
  renderFamily();
  setTimeOfDay();
}
```

- [ ] **Edit 3: Replace `sendMessage()` — call Gemma instead of keyword matching**

Find and replace the `sendMessage()` function:

```javascript
function sendMessage() {
  const text = qInput.value.trim();
  if (!text || !DATA) return;
  qInput.value = '';

  const empty = document.querySelector('.chat-empty');
  if (empty) empty.style.display = 'none';
  const sug = document.getElementById('askChips');
  if (sug) sug.style.display = 'none';

  addMessage(text, 'user');

  const typing = document.createElement('div');
  typing.className = 'msg-typing';
  typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  messagesEl.appendChild(typing);
  scrollChat();

  (async () => {
    typing.remove();
    try {
      let responseText;
      if (GemmaPlugin && MemoryPlugin) {
        const { matches, found } = await MemoryPlugin.findByText({ query: text });
        const context = found
          ? matches.map((m, i) =>
              `Memory ${i+1}:\n  Name: ${m.name}\n  Relationship: ${m.relationship}\n  Story: ${m.story}\n  Caption: ${m.caption}`
            ).join('\n\n')
          : 'No matching family memories found.';
        const prompt = `RETRIEVED MEMORIES:\n${context}\n\nUSER'S QUESTION: ${text}\n\nRespond warmly, grounding every fact in the retrieved memories above.`;
        const { text: reply } = await GemmaPlugin.generate({
          systemPrompt: SYSTEM_PROMPT, query: prompt, maxTokens: 300
        });
        responseText = reply;
      } else {
        responseText = findResponse(text).text;
      }
      addMessage(responseText, 'bot', null);
      speak(responseText);
    } catch (e) {
      addMessage("I'm having trouble remembering right now. Please try again.", 'bot', null);
      console.error(e);
    }
  })();
}
```

- [ ] **Edit 4: Replace `doIdentify()` — call MemoryPlugin + Gemma instead of random pick**

Find and replace the `doIdentify()` function (the one that does `setTimeout` with random key):

```javascript
async function doIdentify() {
  if (!DATA) return;
  const loading = document.getElementById('loading');
  loading.hidden = false;

  try {
    // preview.src is a data URL like "data:image/jpeg;base64,..."
    const imageBase64 = preview.src.split(',')[1];

    let name, relationship, responseText;

    if (GemmaPlugin && MemoryPlugin && imageBase64) {
      const match = await MemoryPlugin.findByImage({ imageBase64 });
      if (!match.found) {
        responseText = "I'm not sure who this is. Would you like to tell me about them so I can remember next time?";
        name = "Unknown";
        relationship = "";
      } else {
        name = match.name;
        relationship = match.relationship;
        const context = `Memory:\n  Name: ${match.name}\n  Relationship: ${match.relationship}\n  Story: ${match.story}\n  Caption: ${match.caption}`;
        const prompt = `RETRIEVED MEMORIES:\n${context}\n\nUSER'S QUESTION: Who is this person in the photo? Tell me something warm about them.\n\nRespond warmly.`;
        const { text: reply } = await GemmaPlugin.generate({
          systemPrompt: SYSTEM_PROMPT, query: prompt, maxTokens: 250
        });
        responseText = reply;
      }
    } else {
      // Browser fallback
      const keys = Object.keys(DATA.photo_queries);
      const key = keys[Math.floor(Math.random() * keys.length)];
      const p = DATA.photo_queries[key];
      name = p.name; relationship = p.relationship; responseText = p.response;
    }

    document.getElementById('resultName').textContent = name;
    document.getElementById('resultRel').textContent = relationship;
    document.getElementById('resultText').textContent = responseText;

    document.getElementById('identifyResult').hidden = false;
    document.getElementById('identifyActions').hidden = true;
    speak(responseText);
  } catch (e) {
    document.getElementById('resultText').textContent =
      "I had trouble recognizing that photo. Please try again.";
    console.error(e);
  } finally {
    loading.hidden = true;
  }
}
```

- [ ] **Edit 5: Add first-launch model check in DOMContentLoaded**

Find the existing `window.addEventListener('DOMContentLoaded', ...)` or `window.onload` at the bottom of `app.js`. Replace it with:

```javascript
window.addEventListener('DOMContentLoaded', async () => {
  initTTS();
  if (GemmaPlugin) {
    const { ready } = await GemmaPlugin.isModelReady();
    if (!ready) {
      showScreen('modelSetup');
      return;
    }
  }
  await loadData();
});
```

- [ ] **Step 2: Verify browser fallback works**

```bash
cd gemma-remember-apk
python3 -m http.server 8080 --directory src &
sleep 1
curl -s http://localhost:8080/index.html | grep -c "modelSetup"
kill %1
```

Expected: `1` (the setup screen exists in HTML)

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: wire app.js — Gemma LLM, MemoryPlugin, Android TTS, first-launch check"
```

---

## Task 8: Add Model Setup screen to index.html and style.css

**Files:**
- Modify: `src/index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Add setup screen to `index.html`**

After the closing `</div>` of the splash screen and before `<!-- ===== HOME ===== -->`, insert:

```html
    <!-- ===== MODEL SETUP ===== -->
    <div id="modelSetup" class="screen">
      <div class="splash-inner">
        <div class="splash-logo">
          <div class="logo-ring"></div>
          <svg class="logo-icon" width="74" height="74" viewBox="0 0 168 168" fill="none">
            <circle cx="84" cy="84" r="56" stroke="#4285F4" stroke-opacity="0.45" stroke-width="2"/>
            <path d="M84 28C84 58.93 109.07 84 140 84C109.07 84 84 109.07 84 140C84 109.07 58.93 84 28 84C58.93 84 84 58.93 84 28Z" fill="#4285F4"/>
          </svg>
        </div>
        <h1 class="splash-title">One-Time Setup</h1>
        <p class="splash-sub">Downloading Gemma 2B (~1.5 GB)<br>Please stay on Wi-Fi. This only happens once.</p>
        <div class="setup-progress" id="setupProgressArea" hidden>
          <div class="progress-bar-track">
            <div class="progress-bar-fill" id="modelProgressBar" style="width:0%"></div>
          </div>
          <p class="progress-label" id="modelProgressLabel">Starting…</p>
        </div>
        <button class="btn-primary btn-xl" id="startDownloadBtn"
                onclick="startModelDownload()">Download Now</button>
        <p class="splash-powered">Powered by Gemma 2B &middot; Runs offline after setup</p>
      </div>
    </div>
```

- [ ] **Step 2: Add setup styles to `style.css`**

Append at end of `src/style.css`:

```css
/* ===== MODEL SETUP SCREEN ===== */
.setup-progress { width: 100%; max-width: 320px; margin: 24px auto; }
.progress-bar-track {
  width: 100%; height: 8px;
  background: #e8eaed; border-radius: 4px; overflow: hidden;
}
.progress-bar-fill {
  height: 100%; background: #4285F4;
  border-radius: 4px; transition: width 0.3s ease;
}
.progress-label {
  text-align: center; font-size: 13px;
  color: #5f6368; margin-top: 8px;
}
```

- [ ] **Step 3: Add `startModelDownload()` to `src/app.js`**

Append to end of `src/app.js`:

```javascript
// ===== MODEL SETUP =====
async function startModelDownload() {
  const btn = document.getElementById('startDownloadBtn');
  const progressArea = document.getElementById('setupProgressArea');
  const bar = document.getElementById('modelProgressBar');
  const label = document.getElementById('modelProgressLabel');

  btn.disabled = true;
  btn.textContent = 'Downloading…';
  progressArea.hidden = false;

  if (!GemmaPlugin) {
    // Browser mode — skip download
    label.textContent = 'Browser mode — no download needed.';
    setTimeout(async () => { await loadData(); showScreen('home'); }, 1200);
    return;
  }

  GemmaPlugin.addListener('downloadProgress', ({ percent, downloaded, total }) => {
    const pct = percent >= 0 ? percent : Math.round((downloaded / total) * 100);
    bar.style.width = pct + '%';
    const mb = Math.round(downloaded / 1024 / 1024);
    const totalMb = Math.round(total / 1024 / 1024);
    label.textContent = `${mb} MB / ${totalMb} MB (${pct}%)`;
  });

  try {
    await GemmaPlugin.downloadModel({
      url: 'https://storage.googleapis.com/mediapipe-models/llm_inference/gemma-2b-it-cpu-int4/float32/1/gemma-2b-it-cpu-int4.bin'
    });
    bar.style.width = '100%';
    label.textContent = 'Download complete! Setting up…';
    await loadData();
    showScreen('home');
  } catch (e) {
    label.textContent = 'Download failed. Check your connection and try again.';
    btn.disabled = false;
    btn.textContent = 'Retry';
    console.error(e);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/index.html src/style.css src/app.js
git commit -m "feat: model setup screen with progress bar and download flow"
```

---

## Task 9: Sync and build release APK

**Files:**
- Modify: `android/app/build.gradle` (signing config)
- Output: `android/app/build/outputs/apk/release/app-release.apk`

- [ ] **Step 1: Sync Capacitor web assets**

```bash
cd gemma-remember-apk && npx cap sync android
```

Expected: `✔ Copying web assets` and `✔ Updating Android plugins`

- [ ] **Step 2: Generate release keystore**

```bash
keytool -genkeypair -v \
  -keystore gemma-remember-release.jks \
  -alias gemmaremember \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Javier G, OU=App, O=GemmaRemember, L=US, S=US, C=US" \
  -storepass GemmaRemember2026 \
  -keypass GemmaRemember2026
```

Expected: `Generating 2,048 bit RSA key pair and self-signed certificate`

Save passwords to the project `credentials` file.

- [ ] **Step 3: Add signing config to `android/app/build.gradle`**

Inside `android { }`, before `buildTypes { }`, add:

```gradle
    signingConfigs {
        release {
            storeFile file("../../../../gemma-remember-release.jks")
            storePassword "GemmaRemember2026"
            keyAlias "gemmaremember"
            keyPassword "GemmaRemember2026"
        }
    }
```

Inside `buildTypes { release { } }`, add:

```gradle
            signingConfig signingConfigs.release
            minifyEnabled false
```

- [ ] **Step 4: Build release APK**

```bash
cd gemma-remember-apk/android && ./gradlew assembleRelease 2>&1 | tail -10
```

Expected: `BUILD SUCCESSFUL`

- [ ] **Step 5: Verify APK**

```bash
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

Expected: 80–150 MB

- [ ] **Step 6: Install and smoke-test on device**

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.gemmaremember.app/.MainActivity
```

Expected: App launches showing Model Setup screen.

- [ ] **Step 7: Final commit**

```bash
git add android/app/build.gradle
git commit -m "build: release signing config — APK ready for Kaggle submission"
```
