// ===== DATA =====
// ===== CAPACITOR PLUGINS =====
const GemmaPlugin = window.Capacitor?.Plugins?.GemmaPlugin ?? null;
const MemoryPlugin = window.Capacitor?.Plugins?.MemoryPlugin ?? null;
const TextToSpeech = window.Capacitor?.Plugins?.TextToSpeech ?? null;

const SYSTEM_PROMPT = `You are Gemma, a warm and patient companion for someone with dementia.
RULES:
- ONLY use the facts from RETRIEVED MEMORIES below.
- NEVER invent names, dates, or stories not in the memories.
- If confidence is low, say gently: "I'm not sure — could you tell me more about them?"
- Speak simply and warmly. Use the person's name early.
- Reference specific shared memories to spark recognition.`;

let DATA = null;
let currentPerson = null;
let currentScreenId = 'splash';

// ===== TEXT-TO-SPEECH (Edge TTS Ava Multilingual) =====
let ttsEnabled = true;
let currentAudio = null;

function initTTS() {
  console.log('TTS initialized: Edge TTS Ava Multilingual');
}

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

function base64ToBlob(base64, mimeType) {
  const bytes = atob(base64);
  const buffer = new ArrayBuffer(bytes.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}

function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  const btn = document.getElementById('ttsToggle');
  if (btn) {
    btn.classList.toggle('muted', !ttsEnabled);
    btn.title = ttsEnabled ? 'Mute voice' : 'Unmute voice';
  }
  if (!ttsEnabled) stopSpeaking();
}

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
  setPatientGreeting();
}

function setTimeOfDay() {
  const h = new Date().getHours();
  const el = document.getElementById('timeOfDay');
  if (h < 12) el.textContent = 'morning';
  else if (h < 17) el.textContent = 'afternoon';
  else el.textContent = 'evening';
}

function setPatientGreeting() {
  const name = localStorage.getItem('patientName');
  if (name) {
    const sub = document.querySelector('.greeting-sub');
    if (sub) sub.textContent = `How can I help you remember, ${name}?`;
  }
}

// ===== NAVIGATION =====
const TAB_SCREENS = ['home', 'family', 'identify', 'ask', 'about'];

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentScreenId = id;

  // Update tab bar active states
  document.querySelectorAll('.tab-bar .tab').forEach(t => {
    t.classList.remove('active');
    if (t.querySelector('span') && t.querySelector('span').textContent.toLowerCase() === id) {
      t.classList.add('active');
    }
  });
}

function setupSwipeNavigation() {
  const app = document.getElementById('app');
  if (!app) return;

  let startX = 0;
  let startY = 0;
  let startTarget = null;

  app.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    startTarget = event.target;
  }, { passive: true });

  app.addEventListener('touchend', (event) => {
    if (!startTarget || event.changedTouches.length !== 1) return;
    if (!TAB_SCREENS.includes(currentScreenId)) return;

    const endX = event.changedTouches[0].clientX;
    const endY = event.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const minSwipeDistance = 50;
    const horizontalBias = 1.25;

    if (absX < minSwipeDistance || absX < absY * horizontalBias) return;

    // Avoid hijacking normal interactions.
    if (startTarget.closest('input,textarea,button,[contenteditable="true"],.family-scroll,.chips,.suggestions,#chat')) {
      return;
    }

    const currentIndex = TAB_SCREENS.indexOf(currentScreenId);
    if (currentIndex === -1) return;

    const isSwipeLeft = dx < 0;
    const nextIndex = isSwipeLeft ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= TAB_SCREENS.length) return;

    showScreen(TAB_SCREENS[nextIndex]);
  }, { passive: true });
}

function setupFamilySwipeScroll() {
  const scroller = document.getElementById('familyScroll');
  if (!scroller) return;

  let touchStartX = 0;
  let startScrollLeft = 0;
  let isDragging = false;
  let moved = false;

  scroller.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1) return;
    isDragging = true;
    moved = false;
    touchStartX = event.touches[0].clientX;
    startScrollLeft = scroller.scrollLeft;
  }, { passive: true });

  scroller.addEventListener('touchmove', (event) => {
    if (!isDragging || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - touchStartX;
    if (Math.abs(dx) > 4) moved = true;
    scroller.scrollLeft = startScrollLeft - dx;
  }, { passive: true });

  scroller.addEventListener('touchend', () => {
    isDragging = false;
  }, { passive: true });

  // If user dragged, suppress click-through on family cards at touch release.
  scroller.addEventListener('click', (event) => {
    if (!moved) return;
    event.preventDefault();
    event.stopPropagation();
    moved = false;
  }, true);
}

// ===== FAMILY RENDERING =====
function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase();
}

function getAvatarGradient(color) {
  // Darken the color slightly for better contrast with white text
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);
  const darker = `rgb(${Math.max(0,r-40)},${Math.max(0,g-40)},${Math.max(0,b-40)})`;
  return `linear-gradient(135deg, ${color}, ${darker})`;
}

function avatarImagePath(key) {
  return `assets/family/${key}.png`;
}

function buildAvatarMarkup(key, person) {
  const initials = getInitials(person.name);
  const bg = getAvatarGradient(person.color);
  const img = avatarImagePath(key);
  return `<div class="avatar" style="background:${bg}">
    <img src="${img}" alt="${person.name}" loading="lazy" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
    <span class="avatar-fallback">${initials}</span>
  </div>`;
}

function renderFamily() {
  if (!DATA) return;
  const people = DATA.photo_queries;

  // Home scroll
  const scroll = document.getElementById('familyScroll');
  scroll.innerHTML = '';
  for (const [key, p] of Object.entries(people)) {
    const el = document.createElement('button');
    el.className = 'family-thumb';
    el.onclick = () => showPerson(key);
    el.innerHTML = `
      ${buildAvatarMarkup(key, p)}
      <span>${p.name}</span>
    `;
    scroll.appendChild(el);
  }

  // Family grid
  const grid = document.getElementById('familyGrid');
  grid.innerHTML = '';
  for (const [key, p] of Object.entries(people)) {
    const el = document.createElement('button');
    el.className = 'family-card';
    el.onclick = () => showPerson(key);
    el.innerHTML = `
      ${buildAvatarMarkup(key, p)}
      <h4>${p.name}</h4>
      <span>${p.relationship}</span>
    `;
    grid.appendChild(el);
  }
}

function showPerson(key) {
  if (!DATA) return;
  const p = DATA.photo_queries[key];
  if (!p) return;
  currentPerson = key;

  document.getElementById('personHeaderName').textContent = p.name;
  document.getElementById('personName').textContent = p.name;
  document.getElementById('personRel').textContent = p.relationship;
  document.getElementById('personStory').textContent = p.story;
  document.getElementById('personAskName').textContent = p.name;

  const avatar = document.getElementById('personAvatar');
  const initials = getInitials(p.name);
  avatar.style.background = getAvatarGradient(p.color);
  avatar.innerHTML = `
    <img src="${avatarImagePath(key)}" alt="${p.name}" onload="this.nextElementSibling.style.display='none'" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
    <span class="avatar-fallback">${initials}</span>
  `;

  const list = document.getElementById('personMemories');
  list.innerHTML = '';
  for (const cap of p.captions) {
    const li = document.createElement('li');
    li.textContent = cap;
    list.appendChild(li);
  }

  showScreen('person');
}

function goAskAbout() {
  if (!currentPerson || !DATA) return;
  const p = DATA.photo_queries[currentPerson];
  showScreen('ask');
  setTimeout(() => {
    const input = document.getElementById('qInput');
    input.value = `Tell me about ${p.name}`;
    sendMessage();
  }, 350);
}

// ===== IDENTIFY (photo) =====
const fileInput = document.getElementById('fileInput');
const preview = document.getElementById('preview');
const uploadPrompt = document.getElementById('uploadPrompt');
const uploadZone = document.getElementById('uploadZone');
const btnIdentify = document.getElementById('btnIdentify');

fileInput.addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    preview.src = e.target.result;
    preview.hidden = false;
    uploadPrompt.hidden = true;
    uploadZone.classList.add('has-image');
    btnIdentify.disabled = false;
  };
  reader.readAsDataURL(file);
});

async function doIdentify() {
  if (!DATA) return;
  const loading = document.getElementById('loading');
  loading.hidden = false;

  try {
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
    // Auto-learn: if user uploaded a new photo of a known person, the embedding is already stored
    // No additional extraction needed for photo identify — the match itself is the learning
  } catch (e) {
    document.getElementById('resultText').textContent =
      "I had trouble recognizing that photo. Please try again.";
    console.error(e);
  } finally {
    loading.hidden = true;
  }
}

function resetIdentify() {
  preview.hidden = true;
  preview.src = '';
  uploadPrompt.hidden = false;
  uploadZone.classList.remove('has-image');
  btnIdentify.disabled = true;
  fileInput.value = '';
  document.getElementById('identifyResult').hidden = true;
  document.getElementById('identifyActions').hidden = false;
}

// ===== ASK / CHAT =====
const qInput = document.getElementById('qInput');
const messagesEl = document.getElementById('messages');

qInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') sendMessage();
});

function goAsk(text) {
  showScreen('ask');
  setTimeout(() => {
    qInput.value = text;
    sendMessage();
  }, 350);
}

function sendFromChip(el) {
  const text = el.textContent;
  qInput.value = text;
  sendMessage();
}

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
      let matches = [];
      let found = false;

      if (GemmaPlugin && MemoryPlugin) {
        const result = await MemoryPlugin.findByText({ query: text });
        matches = result.matches || [];
        found = result.found;

        // Get profile IDs for auto-learning
        if (found && matches.length > 0) {
          const { profiles } = await MemoryPlugin.getAllProfiles();
          matches.forEach(m => {
            const profile = profiles.find(p => p.name === m.name);
            if (profile) m.id = profile.id;
          });
        }

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

      // === AUTO-LEARN: extract new facts from the conversation ===
      if (GemmaPlugin && MemoryPlugin && found && matches.length > 0) {
        try {
          const topMatch = matches[0];
          const extractPrompt = `You just had this conversation:
USER: ${text}
GEMMA: ${responseText}

The user was talking about ${topMatch.name} (${topMatch.relationship}).
Their current known story: "${topMatch.story}"

Extract ONLY genuinely NEW facts mentioned in the USER's message that are NOT already in the known story.
If there are new facts, respond with ONLY the new facts as a brief sentence to append.
If there are NO new facts, respond with exactly: NO_NEW_FACTS`;

          const { text: extracted } = await GemmaPlugin.generate({
            systemPrompt: 'You are a fact extractor. Be precise. Only extract genuinely new information.',
            query: extractPrompt, maxTokens: 100
          });

          if (extracted && !extracted.includes('NO_NEW_FACTS') && extracted.trim().length > 5) {
            await MemoryPlugin.updateStory({
              id: topMatch.id || '',
              appendText: extracted.trim()
            });
            console.log('Auto-learned:', extracted.trim());
          }
        } catch (e) {
          console.error('Auto-learn failed (non-blocking):', e);
        }
      }
    } catch (e) {
      addMessage("I'm having trouble remembering right now. Please try again.", 'bot', null);
      console.error(e);
    }
  })();
}

function findResponse(query) {
  const q = query.toLowerCase().trim();

  // Direct match in text queries
  for (const [key, val] of Object.entries(DATA.text_queries)) {
    if (q.includes(key) || key.includes(q)) {
      return { text: val.response, personKey: val.match || null };
    }
  }

  // Fuzzy: search for person names
  for (const [key, person] of Object.entries(DATA.photo_queries)) {
    if (q.includes(person.name.toLowerCase())) {
      return { text: person.response, personKey: key };
    }
  }

  // Keyword matching
  const keywords = {
    'cookie': 'sarah', 'bak': 'sarah', 'daughter': 'sarah',
    'dog': 'buddy', 'pet': 'buddy', 'golden': 'buddy', 'retriever': 'buddy',
    'doctor': 'dr_chen', 'clinic': 'dr_chen', 'tuesday': 'dr_chen', 'checkup': 'dr_chen',
    'granddaughter': 'maya', 'nana': 'maya', 'draw': 'maya',
    'husband': 'robert', 'wedding': 'robert', 'fish': 'robert', 'rose': 'robert', 'moon river': 'robert',
    'best friend': 'best_friend_linda', 'linda': 'best_friend_linda', 'friend': 'best_friend_linda',
    'quilting': 'margaret', 'quilt': 'margaret',
    'son': 'arki', 'jack': 'arki', 'birdhouse': 'arki', 'carpenter': 'arki',
    'jazz': 'uncle_joe', 'fedora': 'uncle_joe', 'uncle': 'uncle_joe',
    'lisa': 'lisa', 'daughter-in-law': 'lisa', 'lemon cake': 'lisa',
    'neighbor': 'neighbor_tom', 'next door': 'neighbor_tom', 'tom': 'neighbor_tom',
    'mailman': 'mailman_mike', 'mail carrier': 'mailman_mike', 'mail': 'mailman_mike', 'package': 'mailman_mike', 'mike': 'mailman_mike',
  };

  for (const [kw, personKey] of Object.entries(keywords)) {
    if (q.includes(kw)) {
      return { text: DATA.photo_queries[personKey].response, personKey };
    }
  }

  // Default
  return {
    text: "I'm not quite sure about that. Could you try asking in a different way? For example, you can ask me about your family members by name, or about your daily routines.",
    personKey: null
  };
}

function addMessage(text, type, personKey = null) {
  const div = document.createElement('div');
  div.className = `msg msg-${type}`;

  if (type === 'bot' && personKey && DATA?.photo_queries?.[personKey]) {
    const person = DATA.photo_queries[personKey];
    const img = document.createElement('img');
    img.className = 'msg-person-photo';
    img.src = avatarImagePath(personKey);
    img.alt = person.name;
    div.appendChild(img);
  }

  const textNode = document.createElement('div');
  textNode.textContent = text;
  div.appendChild(textNode);

  // Add speaker button for bot messages
  if (type === 'bot') {
    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-btn';
    speakBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>';
    speakBtn.onclick = () => speak(text);
    div.appendChild(speakBtn);

    // Auto-speak bot responses
    speak(text);
  }

  messagesEl.appendChild(div);
  scrollChat();
}

function scrollChat() {
  const chat = document.getElementById('chat');
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
}

// ===== INIT =====
setupSwipeNavigation();
setupFamilySwipeScroll();

window.addEventListener('DOMContentLoaded', async () => {
  initTTS();
  if (GemmaPlugin) {
    const { ready } = await GemmaPlugin.isModelReady();
    if (!ready) {
      showScreen('modelSetup');
      return;
    }
  }
  if (!localStorage.getItem('patientName')) {
    showScreen('setupWizard');
  } else {
    await loadData();
  }
});

// ===== SETUP WIZARD =====
let wizPhotos = []; // base64 strings from file picker

function wizardNext1() {
  const name = document.getElementById('patientNameInput').value.trim();
  if (!name) { document.getElementById('patientNameInput').focus(); return; }
  localStorage.setItem('patientName', name);
  document.getElementById('wizPatientName').textContent = name;
  // Update home greeting
  const greetSub = document.querySelector('.greeting-sub');
  if (greetSub) greetSub.textContent = `How can I help you remember, ${name}?`;
  wizShowStep('wizStep2');
}

function wizShowStep(stepId) {
  document.querySelectorAll('.wiz-step').forEach(s => s.classList.remove('active'));
  document.getElementById(stepId).classList.add('active');
}

function wizShowAddPerson() {
  // Reset form
  document.getElementById('personNameInput').value = '';
  document.getElementById('personRelInput').value = '';
  document.getElementById('personStoryInput').value = '';
  document.getElementById('personPhotoInput').value = '';
  document.getElementById('photoPreviewRow').innerHTML = '';
  document.getElementById('photoLabel').textContent = 'Choose photo(s)';
  wizPhotos = [];
  wizShowStep('wizStep2b');
}

function wizBackToPeople() {
  wizShowStep('wizStep2');
}

// Photo picker handler
document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('personPhotoInput');
  if (photoInput) {
    photoInput.addEventListener('change', function() {
      const files = Array.from(this.files);
      document.getElementById('photoLabel').textContent = `${files.length} photo(s) selected`;
      const row = document.getElementById('photoPreviewRow');
      row.innerHTML = '';
      wizPhotos = [];
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          wizPhotos.push(e.target.result.split(',')[1]); // base64
          const img = document.createElement('img');
          img.src = e.target.result;
          row.appendChild(img);
        };
        reader.readAsDataURL(file);
      });
    });
  }
});

async function wizSavePerson() {
  const name = document.getElementById('personNameInput').value.trim();
  const rel = document.getElementById('personRelInput').value;
  const story = document.getElementById('personStoryInput').value.trim();

  if (!name) { document.getElementById('personNameInput').focus(); return; }

  const btn = document.querySelector('#wizStep2b .btn-primary');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    if (MemoryPlugin) {
      // Save with first photo (if any)
      await MemoryPlugin.addProfile({
        name, relationship: rel, story,
        photoBase64: wizPhotos[0] || '', caption: ''
      });
      // If multiple photos, add extra embeddings (future enhancement)
    }

    // Add to people list UI
    const list = document.getElementById('wizPeopleList');
    const card = document.createElement('div');
    card.className = 'wiz-person-card';
    const imgSrc = wizPhotos[0] ? `data:image/jpeg;base64,${wizPhotos[0]}` : '';
    card.innerHTML = `
      ${imgSrc ? `<img src="${imgSrc}" alt="${name}">` : ''}
      <div class="wpc-info">
        <div class="wpc-name">${name}</div>
        <div class="wpc-rel">${rel}</div>
      </div>
    `;
    list.appendChild(card);

    // Show "All done" button
    document.getElementById('wizDoneBtn').style.display = '';

    wizBackToPeople();
  } catch (e) {
    console.error('Failed to save person:', e);
    alert('Failed to save. Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function wizardDone() {
  await loadData();
  showScreen('home');
}

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
    label.textContent = 'Browser mode — no download needed.';
    setTimeout(async () => {
      if (!localStorage.getItem('patientName')) {
        showScreen('setupWizard');
      } else {
        await loadData();
        showScreen('home');
      }
    }, 1200);
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
      url: 'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it.litertlm'
    });
    bar.style.width = '100%';
    label.textContent = 'Download complete! Setting up…';
    // Check if wizard has been completed
    if (!localStorage.getItem('patientName')) {
      showScreen('setupWizard');
    } else {
      await loadData();
      showScreen('home');
    }
  } catch (e) {
    label.textContent = 'Download failed. Check your connection and try again.';
    btn.disabled = false;
    btn.textContent = 'Retry';
    console.error(e);
  }
}
