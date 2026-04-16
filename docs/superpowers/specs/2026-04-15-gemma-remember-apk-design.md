# Gemma Remember — Android APK Design Spec
**Date:** 2026-04-15  
**Competition:** Kaggle Gemma 4 for Good Hackathon (Health track)  
**Deadline:** May 18, 2026  

---

## 1. Overview

Convert the existing Gemma Remember web app (`gemma-remember-edit/`) into a signed Android APK using Capacitor. All AI runs on-device after a one-time model download — no internet required for normal use.

The app helps dementia patients recognize family members using:
- **CLIP TFLite** for photo-to-photo similarity (image embedding)
- **SQLite** as a local vector store (cosine similarity)
- **Gemma 2B** (MediaPipe LLM Inference) for warm, grounded responses
- **Android native TTS** for spoken output

---

## 2. Architecture

```
gemma-remember-apk/
├── android/                          ← Capacitor native Android project
│   └── app/src/main/
│       ├── java/.../
│       │   ├── GemmaPlugin.kt        ← MediaPipe LLM Inference bridge
│       │   └── MemoryPlugin.kt       ← CLIP + SQLite vector store bridge
│       └── assets/
│           ├── clip_vit_b32_int8.tflite  ← CLIP image encoder (~22MB, bundled)
│           └── minilm_l6_v2.tflite       ← Text encoder (~23MB, bundled)
├── src/                              ← Web layer (Capacitor web assets)
│   ├── index.html                    ← Unchanged (add setup screen)
│   ├── app.js                        ← 5 targeted changes (see §5)
│   ├── style.css                     ← Unchanged
│   └── (responses.json removed)      ← Data moves to SQLite
├── capacitor.config.json
└── package.json
```

### On-device model stack

| Component | Model | Size | How delivered |
|---|---|---|---|
| Image embedding | CLIP ViT-B-32 TFLite (INT8) | ~22 MB | Bundled in APK |
| Text embedding | MiniLM-L6-v2 TFLite | ~23 MB | Bundled in APK |
| Vector store | SQLite + cosine SQL | ~0 MB | Created at setup |
| LLM | Gemma 2B MediaPipe `.task` | ~1.5 GB | Downloaded first launch |
| TTS | Android TTS engine | 0 MB | Built into OS |

---

## 3. Native Plugins (Kotlin)

### GemmaPlugin.kt
Wraps MediaPipe `LlmInference` API.

| Method | Signature | Description |
|---|---|---|
| `isModelReady` | `() → bool` | Check if .task file is present |
| `downloadModel` | `(url, progressCallback)` | Download Gemma 2B .task to app storage |
| `generate` | `(systemPrompt, query, maxTokens) → string` | Single-shot inference |
| `generateStream` | `(systemPrompt, query, tokenCallback)` | Streaming tokens to JS |

**System prompt template (injected by app.js):**
```
You are Memory Anchor, a warm and patient companion for someone with dementia.
RULES:
- ONLY use facts from RETRIEVED MEMORIES below.
- NEVER invent names, dates, or stories.
- If confidence is low, say gently: "I'm not sure — could you tell me more?"
- Speak simply and warmly. Use the person's name early.
- Reference specific shared memories to spark recognition.
```

### MemoryPlugin.kt
Wraps CLIP TFLite + SQLite.

| Method | Signature | Description |
|---|---|---|
| `initDB` | `()` | Create SQLite tables on first run |
| `addProfile` | `(name, relationship, story, photos[])` | CLIP-embed photos, store vectors |
| `getAllProfiles` | `() → Profile[]` | Return all family members as JSON |
| `findByImage` | `(imageBase64) → Match` | CLIP embed → cosine search → top match + confidence |
| `findByText` | `(query) → Match[]` | Sentence embed → cosine search → top 3 matches |
| `deleteProfile` | `(id)` | Remove a family member |

**SQLite schema:**
```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT, relationship TEXT, story TEXT,
  photo_path TEXT, caption TEXT
);
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles(id),
  type TEXT,          -- 'image' or 'text'
  embedding BLOB      -- float32 array, serialized
);
```

**Confidence threshold:** matches below 0.70 cosine similarity trigger the safety "I don't recognize" response (mirrors notebook Step 9).

---

## 4. Data Flows

### "Who is this?" (photo query)
```
User uploads photo
  → MemoryPlugin.findByImage(base64)
    → CLIP TFLite encodes query image → 512-dim embedding
    → cosine similarity against stored embeddings in SQLite
    → returns { personId, confidence, metadata }
  → if confidence < 0.70 → show "I'm not sure" (no Gemma call)
  → if confidence ≥ 0.70:
    → build context: name + relationship + story + captions
    → GemmaPlugin.generate(SYSTEM_PROMPT, question + context)
    → display response + TextToSpeech.speak(response)
```

### "Ask a question" (text query)
```
User types question
  → MemoryPlugin.findByText(query)
    → MiniLM encodes query → cosine search → top 3 matches
    → returns [{ confidence, metadata }, ...]
  → build context string from top matches
  → GemmaPlugin.generate(SYSTEM_PROMPT, query + context)
  → display response + TextToSpeech.speak(response)
```

---

## 5. Changes to app.js (5 targeted edits)

| # | Current behavior | New behavior |
|---|---|---|
| 1 | `fetch('/api/tts', ...)` | `TextToSpeech.speak({ text, lang: 'en-US' })` |
| 2 | `fetch('responses.json')` then `renderFamily()` | `MemoryPlugin.getAllProfiles()` then `renderFamily()` |
| 3 | `findResponse(query)` — keyword matching | `MemoryPlugin.findByText(query)` → `GemmaPlugin.generate(...)` |
| 4 | Identify: random person from `photo_queries` | `MemoryPlugin.findByImage(base64)` → `GemmaPlugin.generate(...)` |
| 5 | Splash `Get Started` → home | Check `GemmaPlugin.isModelReady()` → if false, show Download screen first |

---

## 6. First-Launch Experience

New screen: **Model Setup** (shown once if Gemma .task file absent):
1. "Setting up Memory Anchor for the first time (~1.5 GB)"
2. Progress bar (streams download progress from `GemmaPlugin.downloadModel`)
3. On complete → "Ready! Let's get started" → home screen

CLIP + MiniLM models are bundled in the APK (~63 MB total) — no download needed.

---

## 7. Build & Output

- **Framework:** Capacitor 6 + Android Gradle
- **Min Android API:** 26 (Android 8.0 Oreo)
- **Target API:** 34
- **APK size:** ~110 MB (APK) + 1.5 GB model (downloaded separately)
- **Dependencies:**
  - `@capacitor/core`, `@capacitor/android`
  - `@capacitor-community/text-to-speech`
  - MediaPipe Tasks LLM (Android AAR)
  - TensorFlow Lite (Android AAR)
- **Output:** `android/app/build/outputs/apk/release/app-release.apk`

---

## 8. Testing

- **Unit:** GemmaPlugin.generate with a known family context → assert non-empty response
- **Unit:** MemoryPlugin.findByImage with stored photo → assert confidence ≥ 0.9 for exact match
- **Unit:** MemoryPlugin.findByText("who bakes cookies") → assert top match is Sarah
- **Integration:** Full flow — photo upload → identify → Gemma response → TTS
- **Safety:** Unknown face → assert confidence < 0.70 → gentle fallback message
- **Manual:** Test on physical Android device (API 30+, 4GB RAM minimum)
