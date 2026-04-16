# Setup Wizard + Features Design Spec
**Date:** 2026-04-16
**Deadline:** May 18, 2026

---

## 1. Setup Wizard

After model download completes, guide caregiver + patient through initial setup.

**Flow:**
1. Screen: "Let's start with your name" → text input, "Next" button
2. Screen: "Nice to meet you, [name]! Now let's add the people in your life." → "Add a person" button
3. Add Person form: name (text), relationship (dropdown: daughter, son, husband, wife, granddaughter, grandson, friend, doctor, neighbor, pet, other), story (textarea, placeholder: "What should [patient] remember about this person?"), photos (gallery picker, multiple)
4. After saving: "Person added!" → "Add another person" or "All done"
5. "All done" → home screen

**Storage:** Each person → `MemoryPlugin.addProfile({ name, relationship, story, photoBase64, caption })`
Patient name → stored in localStorage as `patientName`, used in greetings and prompts.

**Nav:** `showScreen('setupWizard')` after model download. Wizard screens are sub-views within one `#setupWizard` screen div, toggled via JS.

---

## 2. Voice Toggle (Prominent)

- Large, obvious toggle switch in the header bar, visible on ALL screens (home, chat, identify)
- Icon: speaker on/off
- Persisted in localStorage so it survives app restart
- Current implementation already has a small toggle — replace with a larger, more accessible version
- Minimum touch target: 48x48dp

---

## 3. Edge TTS + Voice Selector

**Online mode (default):**
- Use Edge TTS API (`/api/tts` or direct edge-tts) for high-quality voices
- Voice selector dropdown in settings/about screen
- Voices: at minimum "Ava" (warm female), "Andrew" (warm male), "Emma" (British female)
- Selected voice stored in localStorage

**Offline fallback:**
- When Edge TTS fails (no connection), fall back to Android native TTS via `TextToSpeech.speak()`
- No user action needed — automatic failover
- The existing `speak()` function already has this pattern — enhance it with voice selection

**Implementation note:** Edge TTS requires a server endpoint. Since this app is offline-first, Edge TTS only works when online. The Capacitor TTS plugin is the primary voice. Edge TTS is a nice-to-have when connected. For the hackathon, prioritize making native TTS sound good with rate/pitch tuning, and add Edge TTS if time permits.

**Revised approach:** Use Android native TTS as primary (always works offline). Add voice selection from available system voices. Skip Edge TTS server dependency for v1.

---

## 4. Auto-Learning from Chat

After each chat exchange where Gemma responds about a person:

1. Gemma generates the warm response (existing flow)
2. A silent second call: `GemmaPlugin.generate({ systemPrompt: EXTRACT_PROMPT, query: conversationContext })`
3. Extract prompt: "Extract any NEW facts mentioned in this conversation about [person]. Return JSON: { personName, newFacts: string } or { noNewFacts: true }"
4. If new facts found → `MemoryPlugin.updateStory({ id, appendText })` → appends to existing story
5. New photos uploaded via "Who is this?" → embedding stored, linked to matched profile

**New plugin method needed:** `MemoryPlugin.updateStory({ id, appendText })` — appends text to a profile's story field.

---

## 5. Reminders

**Data model — new SQLite table:**
```sql
CREATE TABLE reminders (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    date TEXT,           -- ISO date "2026-04-20" or null for recurring-only
    time TEXT,           -- "14:00" or null
    recurring TEXT,      -- "daily", "weekly", "monthly", or null
    category TEXT,       -- "medication", "appointment", "birthday", "other"
    active INTEGER DEFAULT 1
);
```

**New plugin methods:**
- `MemoryPlugin.addReminder({ text, date, time, recurring, category })`
- `MemoryPlugin.getReminders()` → returns all active reminders
- `MemoryPlugin.deleteReminder({ id })`

**How Gemma uses reminders:**
- On every chat query, `getReminders()` is called
- Today's reminders + overdue reminders are injected into the prompt context alongside family memories:
  ```
  TODAY'S REMINDERS:
  - Take evening medication (daily, 6:00 PM)
  - Dr. Chen appointment (2:00 PM today)
  - Maya's birthday is tomorrow!
  ```
- Gemma naturally weaves them into responses

**Caregiver UI — add reminders:**
- New "Reminders" tab in bottom nav (or section in settings)
- Simple form: text, category dropdown, date picker, time picker, recurring toggle
- List of active reminders with delete button

---

## 6. Changes Summary

**New HTML screens/sections:**
- `#setupWizard` — multi-step wizard (name → add people → done)
- Reminders tab/section — add/view/delete reminders

**app.js changes:**
- Setup wizard logic (sub-screen navigation, form handling, gallery picker)
- Enhanced `speak()` with voice selection from system voices
- Auto-learning extraction after chat responses
- Reminders injection into chat prompts
- Larger voice toggle

**MemoryPlugin.kt changes:**
- `updateStory({ id, appendText })` method
- `addReminder()`, `getReminders()`, `deleteReminder()` methods
- New `reminders` table in MemoryDB.kt

**style.css changes:**
- Wizard screen styles
- Larger voice toggle
- Reminders list/form styles
