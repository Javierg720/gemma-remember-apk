# Gemma Remember — Kaggle Submission Write-Up

**Gemma 4 for Good Hackathon 2026**

[Live Demo](https://gemma-remember-apk.vercel.app) · [Download APK](https://github.com/Javierg720/gemma-remember-apk/releases/latest) · [Kaggle Notebook](notebooks/gemma-remember-rag-for-dementia-care.ipynb)

---

## The Story

My grandmother used to know everyone in our family by heart. The names of her seven grandchildren, the year each of us was born, the song she used to sing my mother to sleep. Then one day she looked at me and asked, politely, who I was.

Dementia doesn't take memories all at once. It takes them in pieces — and the cruelest part isn't the forgetting. It's the shame. The look on her face when she realized she should know me but didn't. The apology she kept offering for something that wasn't her fault.

**Gemma Remember** is the app I wish she'd had. A patient, voice-first companion that holds her memories for her, and gives them back gently — without judgment, without "as I mentioned earlier," without making her feel like she's failing a test.

It runs **fully on-device on Gemma 4**, because medical memory data should never leave the phone of a vulnerable person.

---

## What We Built

A complete, shipping product across three surfaces — all powered by Gemma 4:

| Surface | Model | Use case |
|---|---|---|
| **Android APK** (Capacitor + LiteRT) | Gemma 4 E2B on-device | Offline, private, runs on a $200 phone |
| **Web app** (Vercel) | Gemma 4 26B A4B via Gemini API | Try-it-now, no install |
| **Kaggle notebook** | Gemma 4 E2B + E4B + CLIP | Multimodal RAG research |

- **Live demo:** https://gemma-remember-apk.vercel.app
- **APK:** https://github.com/Javierg720/gemma-remember-apk/releases/latest
- **Code:** https://github.com/Javierg720/gemma-remember-apk (Apache 2.0)

---

## The Innovation: Multimodal RAG > Fine-Tuning

Most assistants for dementia patients try to fine-tune a model on a generic "caregiver dataset." That's the wrong approach for a deeply personal disease.

**Each patient's memories are unique.** Sarah's granddaughter is named Emma. John's son is named David. You can't fine-tune for that — you'd need to retrain the model every time a family adds a photo.

We built a **multimodal RAG pipeline** instead:

- **CLIP embeddings** index every family photo + caption the caregiver adds
- **ChromaDB** stores them locally (no cloud, no leak)
- At conversation time, Gemma 4 retrieves the relevant memory before responding
- New family members can be added in 10 seconds — no GPU, no retraining

| | Fine-tuning | Multimodal RAG (ours) |
|---|---|---|
| Adding a new person | Retrain (hours, $$) | Snap a photo (seconds, free) |
| Privacy | Data leaves device | Stays on phone |
| Updates | Brittle | Instant |
| Per-patient personalization | Impossible at scale | Built-in |

---

## Why Gemma 4 Specifically

This project does not work on any other model. Here's why:

1. **Gemma 4 E2B runs on-device via LiteRT.** Medical data — your mother's face, your father's voice, your child's name — cannot go to a server. Gemma is the only frontier-quality model with a real on-device runtime (LiteRT) and an open license that lets us ship it in a free APK.
2. **Gemma 4 is multimodal.** We pass photo + caption + memory context in a single call. CLIP indexes the image; Gemma understands it.
3. **Apache 2.0 license** lets caregivers modify it. A son who knows Python can fine-tune the tone for his own father.
4. **E2B → E4B flexibility.** Low-end phones get E2B (fits in 4GB RAM). Tablets get E4B. Same code path.

---

## Dementia-Informed Design

Every visual choice in Gemma Remember is grounded in cognitive accessibility research for people with dementia, mild cognitive impairment, and aging-related vision and motor decline. This isn't a generic chat UI — it's a calming environment built to *reduce* cognitive load, not add to it.

### Color: Teal and Blue-Green
The listening orb pulses in **teal / blue-green**, not red, yellow, or high-contrast purple. Research on dementia care environments shows blue-green tones promote **mental stimulation without agitation**, lower heart rate, and are among the last colors the aging eye loses sensitivity to. Red reads as alarm. Yellow reads as warning. Teal reads as *safe*.

### Shapes: Round and Simple
Every interactive element — the orb, the avatar, the action buttons, the send button — is a **circle**. No sharp corners. No nested cards. No layered shadows. Sharp geometry and visual clutter cause **disorientation** in patients with spatial-processing decline. Round, simple, isolated shapes give the eye a single thing to focus on.

### Oversized Touch Targets
Every button is **far larger than standard mobile UI guidelines** — well past the 44pt Apple / 48dp Android minimums. Aging hands lose fine-motor precision; arthritis, tremors, and reduced proprioception all make small targets frustrating or impossible. The mic, camera, photo, location, and send buttons are sized so that a shaky tap from any part of the fingertip lands cleanly. **Misses cause shame; we designed misses out.**

### High-Contrast, Large Type
Body text is set well above default reading sizes, with high contrast against pale backgrounds. Aging eyes lose contrast sensitivity before they lose acuity, so we prioritized **clear black-on-white type** over decorative grayscale. No thin fonts. No light-gray captions. If a sentence matters, it's readable from arm's length.

### One Action at a Time
The home screen presents **four icons**: camera, photo, location, microphone. That's it. No menus, no settings panel, no notifications, no badges. Anything that doesn't help the user *right now* is hidden. A patient who picks up the phone confused should not also be confused by the app.

### Voice-First, Not Text-First
The mic is always one tap away. Typing is the *fallback*, not the default. Patients with dementia often retain spoken language longer than fine-motor typing skills, so the orb is the primary interaction — large, central, glowing softly so they know exactly where to tap.

### Calm Confirmation, Not Alerts
When the SOS flow detects "I'm lost," the app does not flash a red banner or vibrate aggressively. It asks, gently:

> *"I have your location. Are you lost? Should I send it to your emergency contact?"*

A patient in distress responds to **calm**, not urgency. The two-step confirmation also prevents false alarms from accidental keyword matches.

This is **not decoration** — it's the difference between an app a dementia patient can actually use and one that adds to their distress. Most "AI for accessibility" submissions stop at the model. We designed every pixel as if my grandmother were holding the phone.

---

## Voice: Layered TTS for Every Environment

Gemma Remember speaks aloud in every mode — but the *how* changes based on what's available, so the user always hears a voice they can trust.

| Environment | Primary TTS | Why |
|---|---|---|
| **Web (online)** | Microsoft Edge TTS — *Emma* voice | Highest-quality neural voice, warm and feminine, served via our Vercel Python serverless function (`api/tts.py`) |
| **Web (offline / fallback)** | Web Speech API | Built into every modern browser; zero install, zero cost |
| **Android APK (offline)** | Built-in Android TTS engine | Ships with every Android device since 2.1 — works on the cheapest phone, with no network, forever |

This means **the app never goes silent**. A patient using the APK on a $200 phone in airplane mode still hears Gemma respond out loud. A caregiver demoing the web app in their kitchen hears the premium Emma voice. A tablet with no internet falls back gracefully without breaking the experience.

### Why This Matters for Dementia Care
Patients with cognitive decline often **lose reading comprehension before they lose listening comprehension**. A silent app — or one that requires a Wi-Fi connection to speak — fails the exact users it was built for. By layering three independent TTS engines (cloud premium → browser native → on-device Android), we guarantee voice output **anywhere, anytime, on any device**.

Combined with on-device Gemma 4 E2B inference via LiteRT, this means the entire experience — the model, the memory, *and* the voice — runs **fully offline on Android**. No subscription. No network. No data leaving the phone.

That's not a demo. That's a product a real family can rely on.

---

## Technical Highlights

- **`GemmaPlugin.kt`** — Custom Capacitor plugin that wraps Google's LiteRT-LM engine via reflection, downloads `gemma-4-E2B-it.litertlm` (~2.6 GB) from HuggingFace on first launch, and runs entirely offline thereafter.
- **`MemoryDB.kt`** — Room database for persistent person/photo/memory storage on Android.
- **Action-tag protocol** — Gemma emits inline tags like `[SOS:name:phone]` that the app parses post-generation to trigger GPS share, call, or pre-written messages. No tool-call API needed; works on every Gemma deployment.
- **Honest-by-design system prompt** — Hard-coded rules prevent the model from falsely claiming it "sent" a message. The app *opens* the SMS composer; the user always confirms.
- **Repeat-question tolerance** — Custom prompt scaffolding means Gemma never says "as I told you" — every ask gets a fresh, patient answer. Tested with simulated repeat-asking sessions.
- **Voice-first UX** — Edge TTS Emma voice on web, Web Speech API + Android native TTS as offline fallbacks. Calm orb visualizer instead of a chat box.

---

## What This Means for a Real Caregiver

A daughter installs the APK on her father's old Android phone. She spends 15 minutes adding photos: herself, her brother, the grandkids, the dog. She types one or two memories per person.

That night, her dad asks the phone, *"Who is the little girl in this picture?"*

Gemma answers: *"That's Emma — your granddaughter. She turned six last year. Her birthday party was at your house, and she wore the blue dress you like."*

He smiles. He doesn't have to feel ashamed for asking. He doesn't have to call his daughter at midnight. The memory is there for him, in his pocket, on a model that never sends his data anywhere.

That's what Gemma 4 makes possible. That's what we built.

---

## Reproducibility

The notebook (`notebooks/gemma-remember-rag-for-dementia-care.ipynb`) runs end-to-end on Kaggle's free GPU. It:

1. Downloads Gemma 4 E2B + E4B from KaggleHub
2. Generates a mock family dataset (photos + captions)
3. Indexes them with CLIP into ChromaDB
4. Demonstrates retrieval + Gemma generation on real queries
5. Benchmarks E2B (on-device candidate) vs E4B (cloud)

Every cell is annotated. Every claim has code behind it.

---

**Built for the Gemma 4 for Good Hackathon 2026. Made with care, for the people we don't want to forget.**
