// ===== GEMMA REMEMBER v3 — WEB VERSION =====

// ===== MEMORY =====
function getMemories() { try { return JSON.parse(localStorage.getItem('gm_people') || '[]'); } catch { return []; } }
function saveMemories(m) { localStorage.setItem('gm_people', JSON.stringify(m)); }
function getReminders() { try { return JSON.parse(localStorage.getItem('gm_reminders') || '[]'); } catch { return []; } }
function saveReminder(text) { const r = getReminders(); r.push({ text, ts: Date.now() }); localStorage.setItem('gm_reminders', JSON.stringify(r)); }

function addPerson(name, rel, story, photoB64) {
  const memories = getMemories();
  const existing = memories.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (rel) existing.rel = rel;
    if (story) existing.story = (existing.story ? existing.story + '. ' + story : story);
    if (photoB64) existing.photo = photoB64;
    existing.lastMentioned = Date.now();
    saveMemories(memories);
    return;
  }
  memories.push({
    name, rel: rel || '', story: story || '', photo: photoB64 || '',
    voiceClip: null,   // base64 audio recorded by family member
    videoClip: null,    // base64 video intro
    lastMentioned: Date.now(),
    visitLog: []        // [{ date, note }]
  });
  saveMemories(memories);
}

// Record a voice/video clip for a person
let mediaRecorder = null;
let recordingChunks = [];
let recordingFor = null;

async function startRecordingClip(personName, type) {
  const person = findPerson(personName);
  if (!person) { addMsg(`I don't know anyone named ${personName} yet.`, 'gemma'); return; }

  try {
    const constraints = type === 'video' ? { audio: true, video: { facingMode: 'user' } } : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    recordingFor = { person: personName, type };
    recordingChunks = [];

    mediaRecorder = new MediaRecorder(stream, { mimeType: type === 'video' ? 'video/webm' : 'audio/webm' });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordingChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordingChunks, { type: type === 'video' ? 'video/webm' : 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = reader.result.split(',')[1];
        const memories = getMemories();
        const p = memories.find(m => m.name.toLowerCase() === recordingFor.person.toLowerCase());
        if (p) {
          if (recordingFor.type === 'video') p.videoClip = b64;
          else p.voiceClip = b64;
          saveMemories(memories);
        }
        const msg = `Got it! I saved ${recordingFor.person}'s ${recordingFor.type} introduction. When someone asks about them, I can play it.`;
        addMsg(msg, 'gemma');
        speak(msg);
        saveToHistory('gemma', msg);
        recordingFor = null;
      };
      reader.readAsDataURL(blob);
    };

    mediaRecorder.start();
    const msg = `Recording ${type} for ${personName}. Say or show your introduction, then say "stop recording" or tap the mic button when done.`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
  } catch (e) {
    addMsg(`I couldn't access your ${type === 'video' ? 'camera' : 'microphone'}. Please check your permissions.`, 'gemma');
  }
}

function stopRecordingClip() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    const msg = "Recording saved!";
    addMsg(msg, 'gemma');
    return true;
  }
  return false;
}

function playPersonClip(personName) {
  const person = findPerson(personName);
  if (!person) return false;

  const clip = person.voiceClip || person.videoClip;
  if (!clip) return false;

  const isVideo = !!person.videoClip;
  const mimeType = isVideo ? 'video/webm' : 'audio/webm';
  const blob = new Blob([Uint8Array.from(atob(clip), c => c.charCodeAt(0))], { type: mimeType });
  const url = URL.createObjectURL(blob);

  if (isVideo) {
    // Show video in chat
    const videoHtml = `<video src="${url}" controls autoplay playsinline style="max-width:260px;border-radius:14px;"></video>`;
    addMsg(videoHtml, 'gemma', true);
  } else {
    const audio = new Audio(url);
    audio.play();
  }
  return true;
}

function getTimeSince(timestamp) {
  if (!timestamp) return '';
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
}

function findPerson(q) {
  const ql = q.toLowerCase();
  return getMemories().find(m => ql.includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(ql) || (m.rel && ql.includes(m.rel.toLowerCase())));
}

function peopleContext() {
  const m = getMemories();
  if (m.length === 0) return 'No people saved yet.';
  return m.map(p => {
    let line = `- ${p.name}${p.rel ? ' (' + p.rel + ')' : ''}: ${p.story || 'No details yet.'}`;
    if (p.lastMentioned) line += ` [Last mentioned: ${getTimeSince(p.lastMentioned)}]`;
    if (p.voiceClip) line += ' [Has voice intro]';
    if (p.videoClip) line += ' [Has video intro]';
    if (p.visitLog?.length) line += ` [${p.visitLog.length} visits logged]`;
    return line;
  }).join('\n');
}

// ===== API =====
function getApiKey() { return localStorage.getItem('gm_apiKey') || ''; }
function getMode() { return localStorage.getItem('gm_mode') || ''; }

const MODEL = 'gemma-4-26b-a4b-it';

async function aiGenerate(prompt, imageB64) {
  const key = getApiKey();
  if (!key) throw new Error('No API key');
  const parts = [{ text: prompt }];
  if (imageB64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageB64 } });
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 500, temperature: 0.7 } })
  });
  if (!resp.ok) throw new Error(`API ${resp.status}`);
  const data = await resp.json();
  return (data.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text).join('') || '';
}

// ===== TTS =====
let ttsEnabled = true;
let currentAudio = null;
const TTS_SERVER = '/tts';
const isNight = () => new Date().getHours() >= 21;

async function speak(text, onEnd) {
  if (!ttsEnabled || !text) { onEnd?.(); return; }
  const clean = text.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim();
  if (!clean) { onEnd?.(); return; }

  stopSpeaking();

  // Try Edge TTS server first
  try {
    const url = `${TTS_SERVER}?text=${encodeURIComponent(clean)}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const blob = await resp.blob();
      const audioUrl = URL.createObjectURL(blob);
      currentAudio = new Audio(audioUrl);
      currentAudio.playbackRate = isNight() ? 0.85 : 1.0;
      currentAudio.volume = isNight() ? 0.7 : 1.0;
      currentAudio.onended = () => { currentAudio = null; onEnd?.(); };
      currentAudio.onerror = () => { currentAudio = null; fallbackSpeak(clean, onEnd); };
      await currentAudio.play();
      return;
    }
  } catch (e) {
    console.warn('Edge TTS unavailable, using fallback:', e.message);
  }

  // Fallback: Web Speech API
  fallbackSpeak(clean, onEnd);
}

function fallbackSpeak(text, onEnd) {
  if (!('speechSynthesis' in window)) { onEnd?.(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = isNight() ? 0.75 : 0.95;
  u.pitch = isNight() ? 0.9 : 1.0;
  u.volume = isNight() ? 0.7 : 1.0;
  u.onend = () => onEnd?.();
  speechSynthesis.speak(u);
}

function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function toggleTTS() {
  ttsEnabled = !ttsEnabled;
  document.getElementById('ttsBtn').classList.toggle('muted', !ttsEnabled);
  if (!ttsEnabled) stopSpeaking();
}

// ===== NEBULA VISUALIZER =====
function drawStar(canvas, amplitude, glow) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 * 0.85;
  const t = Date.now() / 1000;

  // Dark space background
  ctx.fillStyle = '#050a18';
  ctx.fillRect(0, 0, w, h);

  const amp = amplitude || 0;
  const gl = glow || 0.5;
  const pulse = 0.3 + amp * 0.7;

  // Init particles
  if (!canvas._nebula) {
    canvas._stars = Array.from({ length: 60 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      size: 0.3 + Math.random() * 1.2, twinkle: Math.random() * Math.PI * 2
    }));
    canvas._tendrils = Array.from({ length: 40 }, () => ({
      angle: Math.random() * Math.PI * 2,
      length: 0.5 + Math.random() * 0.5,
      width: 2 + Math.random() * 6,
      speed: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      curl: (Math.random() - 0.5) * 2
    }));
    canvas._particles = Array.from({ length: 300 }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.05 + Math.random() * 1.0,
      size: 0.5 + Math.random() * 2,
      speed: 0.1 + Math.random() * 0.6,
      phase: Math.random() * Math.PI * 2,
      hue: 200 + Math.random() * 30
    }));
    canvas._nebula = true;
  }

  // Background stars
  canvas._stars.forEach(s => {
    const tw = Math.sin(t * 1.5 + s.twinkle) * 0.3 + 0.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size * tw, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,200,255,${0.3 * tw})`;
    ctx.fill();
  });

  // Nebula glow layers
  for (let i = 6; i >= 0; i--) {
    const gr = r * (0.3 + i * 0.12) * (0.9 + pulse * 0.15);
    const a = (0.06 - i * 0.007) * (0.5 + pulse * 0.5);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, gr);
    grad.addColorStop(0, `rgba(100,180,255,${a * 1.5})`);
    grad.addColorStop(0.5, `rgba(30,100,220,${a})`);
    grad.addColorStop(1, `rgba(10,30,80,0)`);
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Energy tendrils
  ctx.globalCompositeOperation = 'screen';
  canvas._tendrils.forEach(td => {
    const baseAngle = td.angle + Math.sin(t * td.speed + td.phase) * 0.3;
    const len = r * td.length * (0.7 + pulse * 0.4);

    ctx.beginPath();
    ctx.moveTo(cx, cy);

    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const frac = i / steps;
      const curl = Math.sin(frac * 4 + t * td.speed * 2 + td.phase) * r * 0.1 * td.curl * frac;
      const spread = Math.sin(frac * 3 + t + td.phase) * r * 0.05 * frac;
      const px = cx + Math.cos(baseAngle) * len * frac + Math.cos(baseAngle + Math.PI/2) * (curl + spread);
      const py = cy + Math.sin(baseAngle) * len * frac + Math.sin(baseAngle + Math.PI/2) * (curl + spread);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    const a = (0.15 + pulse * 0.2) * (1 - Math.abs(Math.sin(t * 0.5 + td.phase)) * 0.3);
    ctx.strokeStyle = `rgba(60,160,255,${a})`;
    ctx.lineWidth = td.width * (0.5 + pulse * 0.5);
    ctx.shadowColor = 'rgba(60,160,255,0.5)';
    ctx.shadowBlur = 8;
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  // Particles
  canvas._particles.forEach(p => {
    const breathe = Math.sin(t * p.speed + p.phase);
    const pr = p.radius * r * (0.85 + breathe * 0.15 * pulse);
    const wobble = amp > 0.1 ? Math.sin(t * 6 + p.phase * 3) * r * 0.03 * amp : 0;
    const drift = Math.sin(t * 0.3 + p.phase) * r * 0.02;

    const x = cx + Math.cos(p.angle + t * 0.02) * (pr + wobble + drift);
    const y = cy + Math.sin(p.angle + t * 0.02) * (pr + wobble + drift);

    const dist = pr / r;
    const alpha = (1 - dist * 0.7) * (0.2 + pulse * 0.5) * (0.5 + gl * 0.5);

    ctx.beginPath();
    ctx.arc(x, y, p.size * (0.7 + pulse * 0.4), 0, Math.PI * 2);
    const b = Math.round(200 + (1 - dist) * 55);
    const g = Math.round(120 + (1 - dist) * 80);
    ctx.fillStyle = `rgba(${Math.round(30 + (1-dist)*70)},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
    ctx.fill();
  });

  // Core glow
  const coreSize = r * 0.06 * (0.8 + pulse * 0.4);
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreSize * 4);
  coreGrad.addColorStop(0, `rgba(220,240,255,${0.8 * (0.5 + pulse * 0.5)})`);
  coreGrad.addColorStop(0.3, `rgba(100,180,255,${0.3 * (0.5 + pulse * 0.5)})`);
  coreGrad.addColorStop(1, 'rgba(20,60,120,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize * 4, 0, Math.PI * 2);
  ctx.fillStyle = coreGrad;
  ctx.fill();

  // Bright white center
  ctx.beginPath();
  ctx.arc(cx, cy, coreSize * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.9 * (0.5 + pulse * 0.5)})`;
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
}

// Animate small star canvases (splash, setup, header)
let starAnimFrame;
function animateStars() {
  ['splashStar', 'setupStar', 'headerStar'].forEach(id => {
    const c = document.getElementById(id);
    if (c && c.closest('.screen.active')) drawStar(c, voiceAmplitude, 0.7);
  });
  starAnimFrame = requestAnimationFrame(animateStars);
}

// ===== NAVIGATION =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function getStarted() {
  if (!getMode()) showScreen('setup');
  else startChat();
}

function pickMode(mode) {
  if (mode === 'api') {
    document.getElementById('modeCards').style.display = 'none';
    document.getElementById('apiSetup').style.display = '';
  } else {
    localStorage.setItem('gm_mode', 'local');
    startChat();
  }
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) return;
  localStorage.setItem('gm_apiKey', key);
  localStorage.setItem('gm_mode', 'api');
  startChat();
}

function startChat() {
  showScreen('chatScreen');
  const name = localStorage.getItem('gm_name');
  const memories = getMemories();
  updateStatus();

  const msgContainer = document.getElementById('chatMessages');
  if (msgContainer.children.length > 0) return;

  const history = getHistory();
  const today = new Date().toDateString();
  const todayMsgs = history.filter(m => new Date(m.ts).toDateString() === today);

  if (todayMsgs.length > 0) {
    todayMsgs.forEach(m => {
      const cleanText = m.text.replace(/\[SAVE:[^\]]*\]|\[UPDATE:[^\]]*\]|\[REMIND:[^\]]*\]/g, '').trim();
      if (cleanText) addMsg(cleanText, m.role === 'user' ? 'user' : 'gemma');
    });
    todayMsgs.forEach(m => chatHistory.push({ role: m.role, text: m.text }));
  } else if (!name) {
    // First time — warm intro
    setTimeout(() => {
      const welcome = `Hello there! I'm Gemma, and I'm so glad you're here.\n\nI'm your companion — I'm here to help you remember the people you love, the things that matter to you, and anything else you'd like to keep close.\n\nYou can talk to me anytime. Send me photos of your family, tell me stories, or just chat. I'll remember everything for you, so you never have to worry about forgetting.\n\nTo start, I'd love to know — what's your name?`;
      addMsg(welcome, 'gemma');
      saveToHistory('gemma', welcome);
      speak(welcome);
    }, 500);
  } else {
    setTimeout(() => {
      const tod = getTimeOfDay();
      const welcome = memories.length === 0
        ? `Good ${tod}, ${name}! It's nice to see you. Tell me about the people in your life — I'd love to remember them for you.`
        : `Good ${tod}, ${name}! I remember ${memories.length} ${memories.length === 1 ? 'person' : 'people'} so far. What's on your mind?`;
      addMsg(welcome, 'gemma');
      saveToHistory('gemma', welcome);
    }, 400);
  }
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ===== PERSISTENT HISTORY =====
function getHistory() { try { return JSON.parse(localStorage.getItem('gm_history') || '[]'); } catch { return []; } }
function saveToHistory(role, text) {
  const h = getHistory();
  h.push({ role, text, ts: Date.now() });
  // Keep last 500 messages
  if (h.length > 500) h.splice(0, h.length - 500);
  localStorage.setItem('gm_history', JSON.stringify(h));
}

function openHistory() {
  const panel = document.getElementById('historyPanel');
  panel.style.display = '';
  renderHistory();
}

function closeHistory() {
  document.getElementById('historyPanel').style.display = 'none';
}

function renderHistory() {
  const list = document.getElementById('historyList');
  const history = getHistory();
  list.innerHTML = '';

  if (history.length === 0) {
    list.innerHTML = '<p style="color:rgba(255,255,255,.3);text-align:center;padding:40px">No conversations yet.</p>';
    return;
  }

  // Remove existing summary if any
  const existingSummary = list.querySelector('.history-summary');
  if (existingSummary) existingSummary.remove();

  // Group by day
  const days = {};
  history.forEach(m => {
    const d = new Date(m.ts);
    const key = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!days[key]) days[key] = [];
    days[key].push(m);
  });

  // Render newest day first
  Object.entries(days).reverse().forEach(([day, msgs]) => {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'history-day';
    dayDiv.innerHTML = `<div class="history-day-label">${day}</div>`;

    msgs.forEach(m => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const time = new Date(m.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const roleLabel = m.role === 'user' ? localStorage.getItem('gm_name') || 'You' : 'Gemma';
      const cleanText = m.text.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '');
      item.innerHTML = `
        <div class="history-item-time">${time}</div>
        <div class="history-item-role">${roleLabel}</div>
        <div class="history-item-text">${cleanText}</div>
      `;
      dayDiv.appendChild(item);
    });

    list.appendChild(dayDiv);
  });
}

async function summarizeHistory() {
  const history = getHistory();
  if (history.length === 0) return;

  const btn = document.querySelector('.history-action-btn');
  btn.textContent = 'Summarizing...';
  btn.disabled = true;

  try {
    const name = localStorage.getItem('gm_name') || 'the user';
    // Take last 50 messages for summary
    const recent = history.slice(-50);
    const transcript = recent.map(m => {
      const role = m.role === 'user' ? name : 'Gemma';
      const text = m.text.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '');
      return `${role}: ${text}`;
    }).join('\n');

    const prompt = `Here is a conversation history between ${name} and Gemma (a memory companion for someone with memory challenges):

${transcript}

Write a brief, warm summary of what was discussed. Include:
1. Key people mentioned and what was learned about them
2. Any reminders or important things to remember
3. Topics and memories that came up

Keep it concise (3-5 short paragraphs). Write in a warm tone as if reminding ${name} of what they talked about. Start with "Here's what we've talked about..."`;

    const summary = await aiGenerate(prompt);

    // Show summary at top of history
    const list = document.getElementById('historyList');
    const existing = list.querySelector('.history-summary');
    if (existing) existing.remove();

    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'history-summary';
    summaryDiv.innerHTML = `<h3>Conversation Summary</h3><p>${summary.replace(/\n/g, '<br>')}</p>`;
    list.insertBefore(summaryDiv, list.firstChild);
  } catch (e) {
    console.error('Summary failed:', e);
  } finally {
    btn.textContent = 'Summarize all conversations';
    btn.disabled = false;
  }
}

// ===== CHAT =====
let pendingPhoto = null;
const chatHistory = [];

function handleFile(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    // Resize
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      const max = 512;
      if (w > h) { if (w > max) { h = h * max / w; w = max; } }
      else { if (h > max) { w = w * max / h; h = max; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      pendingPhoto = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      document.getElementById('previewImg').src = `data:image/jpeg;base64,${pendingPhoto}`;
      document.getElementById('photoPreview').style.display = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function clearPhoto() {
  pendingPhoto = null;
  document.getElementById('photoPreview').style.display = 'none';
}

function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  const hasPhoto = !!pendingPhoto;
  if (!text && !hasPhoto) return;
  input.value = '';

  // Show user message
  let userHtml = '';
  if (hasPhoto) userHtml += `<img src="data:image/jpeg;base64,${pendingPhoto}">`;
  if (text) userHtml += text;
  addMsg(userHtml, 'user', true);

  const sentPhoto = pendingPhoto;
  const sentText = text;
  clearPhoto();
  chatHistory.push({ role: 'user', text: sentText });
  saveToHistory('user', sentText);

  // Check if responding to a pending action (location, call, message)
  if (pendingAction && /^(yes|yeah|yep|please|ok|okay|do it|sure|send|call)/i.test(sentText.trim())) {
    executePendingAction();
    return;
  }
  if (pendingAction && /^(no|nope|nah|nevermind|cancel|don't|dont)/i.test(sentText.trim())) {
    pendingAction = null;
    pendingLocation = null;
    const msg = "No problem! I'm right here whenever you need me.";
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
    return;
  }

  // Check if responding to location prompt
  if (pendingLocation && /^(yes|yeah|yep|please|ok|okay|help|send|do it)/i.test(sentText.trim())) {
    sendLocationToFamily();
    return;
  }
  if (pendingLocation && /^(no|nope|nah|i'm fine|im fine|i'm ok|im ok|nevermind|cancel)/i.test(sentText.trim())) {
    pendingLocation = null;
    const msg = "Okay, no worries! I'm right here if you need me. You're doing great.";
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
    return;
  }

  // Check for call/text actions before sending to AI
  (async () => {
    if (!hasPhoto) {
      const handled = await handleContactAction(sentText);
      if (handled) return;
    }

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'msg-typing';
    typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    document.getElementById('chatMessages').appendChild(typing);
    scrollChat();

    try {
      const name = localStorage.getItem('gm_name') || 'friend';
      const recent = chatHistory.slice(-8).map(m => `${m.role === 'user' ? name : 'GEMMA'}: ${m.text}`).join('\n');
      const reminders = getReminders();
      const remCtx = reminders.length ? '\nREMINDERS:\n' + reminders.map(r => `- ${r.text}`).join('\n') : '';

      // Check if user is asking about a known person — include their photo for vision
      let personPhoto = null;
      if (!hasPhoto) {
        const memories = getMemories();
        for (const p of memories) {
          if (sentText.toLowerCase().includes(p.name.toLowerCase()) && p.photo) {
            personPhoto = p.photo;
            break;
          }
        }
      }

      const prompt = `You are Gemma, ${name}'s memory companion. Warm, brief, real. No robotic language.
You can help ${name} call or text anyone they've told you about — just suggest it naturally if it seems like they want to reach someone.

PEOPLE IN MEMORY:
${peopleContext()}
${remCtx}

RECENT CHAT:
${recent}

${name}: ${sentText || '(sent a photo)'}
${hasPhoto ? 'THE USER SENT A PHOTO WITH THIS MESSAGE. You MUST look at the actual image and describe what you literally see — how many people, their skin color, hair, age, clothing, expressions. Do NOT say you cannot see or describe it. You CAN see the image.' : ''}
${personPhoto ? 'A SAVED PHOTO OF THIS PERSON IS ATTACHED. Look at the image and describe what you see when asked about their appearance. Be specific — skin tone, hair, age, clothing.' : ''}

INSTRUCTIONS:
- If the user tells you their name (e.g. "I'm Maria" or "my name is John"), respond warmly and end with: [NAME:their_name]
- If ${name} introduces someone ("this is my daughter Sarah"), respond warmly, end with: [SAVE:name:relationship:details]
- If ${name} adds info about someone known, end with: [UPDATE:name:new info]
- If ${name} mentions a reminder, confirm, end with: [REMIND:text]
- If ${name} asks what someone looks like and you have their appearance description in memory, share it naturally.
- If ${name} sends a photo, actually describe what you see — skin tone, hair, clothing, expression. Be specific.
- If ${name} sends a photo and it matches someone in memory, warmly say who it is, their relationship, and mention when they were last talked about. If they have a voice/video intro, offer to play it.
- If ${name} asks "who is this?" about someone in memory, give a warm, personal answer: their name, relationship, a personal detail from their story, and when they last came up.
- You can suggest recording a voice or video intro for family members so ${name} can hear their voice.
- Otherwise respond naturally. 1-3 sentences max. ONLY use facts from memory or what ${name} just said.
- Be warm, patient, and reassuring. This person may have memory challenges. Make them feel safe and loved.

GEMMA:`;

      const imageToSend = hasPhoto ? sentPhoto : personPhoto;

      const reply = await aiGenerate(prompt, imageToSend || null);

      // Parse actions
      let clean = reply;

      // Name extraction
      const nameM = reply.match(/\[NAME:([^\]]*)\]/);
      if (nameM) {
        const userName = nameM[1].trim();
        localStorage.setItem('gm_name', userName);
        clean = clean.replace(nameM[0], '').trim();
      }

      const saveM = reply.match(/\[SAVE:([^:]*):([^:]*):([^\]]*)\]/);
      if (saveM) {
        let description = saveM[3].trim();
        if (hasPhoto && sentPhoto) {
          try {
            const desc = await aiGenerate(
              'Describe EVERYTHING you see in this photo. How many people? Their ages, gender, skin color, hair, clothing, facial expressions, posture. Describe the background too. Be very specific and detailed. 3-4 sentences.',
              sentPhoto
            );
            description = (description ? description + '. ' : '') + 'Photo description: ' + desc.trim();
          } catch (e) { console.warn('Vision description failed:', e); }
        }
        addPerson(saveM[1].trim(), saveM[2].trim(), description, hasPhoto ? sentPhoto : '');
        clean = reply.replace(saveM[0], '').trim();
      }
      const updM = reply.match(/\[UPDATE:([^:]*):([^\]]*)\]/);
      if (updM) {
        const p = findPerson(updM[1].trim());
        if (p) { p.story = (p.story ? p.story + '. ' + updM[2].trim() : updM[2].trim()); saveMemories(getMemories()); }
        clean = reply.replace(updM[0], '').trim();
      }
      const remM = reply.match(/\[REMIND:([^\]]*)\]/);
      if (remM) { saveReminder(remM[1].trim()); clean = reply.replace(remM[0], '').trim(); }

      typing.remove();
      chatHistory.push({ role: 'gemma', text: clean });
            // Update lastMentioned for any person referenced
      const allPeople = getMemories();
      let clipPlayed = false;
      allPeople.forEach(p => {
        if (clean.toLowerCase().includes(p.name.toLowerCase())) {
          p.lastMentioned = Date.now();
          // Auto-play voice clip if identifying someone from a photo
          if (hasPhoto && (p.voiceClip || p.videoClip) && !clipPlayed) {
            setTimeout(() => playPersonClip(p.name), 2000);
            clipPlayed = true;
          }
        }
      });
      saveMemories(allPeople);

      saveToHistory('gemma', clean);
      addMsg(clean, 'gemma');
      speak(clean);
      updateStatus();
    } catch (e) {
      typing.remove();
      addMsg("I'm having a bit of trouble right now. Can you try again?", 'gemma');
      console.error(e);
    }
  })();
}


function addMsg(content, role, isHtml) {
  const div = document.createElement('div');
  div.className = `msg msg-${role}`;
  if (isHtml || content.includes('<img')) {
    div.innerHTML = content;
  } else {
    // Convert links
    let processed = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    processed = processed.replace(/(https?:\/\/[^\s<]+)/g, url => {
      if (processed.includes(`href="${url}"`)) return url;
      return `<a href="${url}" target="_blank">${url}</a>`;
    });
    if (processed !== content) div.innerHTML = processed;
    else div.textContent = content;
  }
  document.getElementById('chatMessages').appendChild(div);
  scrollChat();
}

function scrollChat() {
  const c = document.getElementById('chatMessages');
  requestAnimationFrame(() => c.scrollTop = c.scrollHeight);
}

function updateStatus() {
  const n = getMemories().length;
  const el = document.getElementById('chatStatus');
  if (el) el.textContent = n > 0 ? `Remembering ${n} ${n === 1 ? 'person' : 'people'}` : 'Your memory companion';
}

// ===== LOCATION =====
let pendingLocation = null;

function shareLocation() {
  if (!navigator.geolocation) { addMsg("Location isn't available on this device.", 'gemma'); return; }

  // Get location silently first
  navigator.geolocation.getCurrentPosition(pos => {
    pendingLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const msg = "I can see where you are. Are you feeling lost or do you need help? I can send your location to your family right away. Just say yes if you'd like me to.";
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
  }, () => {
    addMsg("I couldn't find your location right now. Make sure location is turned on in your phone settings.", 'gemma');
  }, { enableHighAccuracy: true });
}

function sendLocationToFamily() {
  if (!pendingLocation) return;
  const { lat, lng } = pendingLocation;
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  const name = localStorage.getItem('gm_name') || 'Your loved one';
  const memories = getMemories();

  // Find family contacts (anyone with a phone number in their story)
  const familyWithPhone = memories.filter(m => {
    const story = (m.story || '').toLowerCase();
    return m.rel && /\d{3}.*\d{4}/.test(story);
  });

  // Get all family members for the SMS
  const familyNames = memories.filter(m => m.rel).map(m => m.name);
  const smsBody = encodeURIComponent(`Hi, this is Gemma Remember. ${name} may need help. Their current location: ${url}`);

  // Try to find phone numbers from stories
  const phones = [];
  memories.forEach(m => {
    const match = (m.story || '').match(/(\+?1?\d{10,12}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
    if (match) phones.push(match[0].replace(/[-.\s]/g, ''));
  });

  if (phones.length > 0) {
    // Open SMS with pre-filled message
    const smsUrl = `sms:${phones.join(',')}?body=${smsBody}`;
    window.open(smsUrl, '_blank');
    const response = `I've opened a message to your family with your location. You're safe — just stay right where you are. Someone will come find you soon.`;
    addMsg(response, 'gemma');
    speak(response);
    saveToHistory('gemma', response);
  } else if (familyNames.length > 0) {
    // We know family but no phone numbers
    const response = `I know your family — ${familyNames.join(', ')} — but I don't have their phone numbers yet. Can you tell me a phone number for one of them? For now, you're safe. Stay right where you are.`;
    addMsg(response, 'gemma');
    speak(response);
    saveToHistory('gemma', response);
  } else {
    // No family saved at all
    const response = `I don't have any family contacts saved yet. You can tell me about your family anytime and I'll remember them. For now, stay where you are — you're safe.`;
    addMsg(response, 'gemma');
    speak(response);
    saveToHistory('gemma', response);
  }

  pendingLocation = null;
}

// ===== MESSAGING & CALLING =====
let pendingAction = null; // { type: 'sms'|'call', person, phone, message }

function findPhoneForPerson(person) {
  const story = person.story || '';
  const match = story.match(/(\+?1?\d{10,12}|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})/);
  return match ? match[0].replace(/[-.\s]/g, '') : null;
}

function findPersonForAction(text) {
  const memories = getMemories();
  const tl = text.toLowerCase();
  for (const p of memories) {
    if (tl.includes(p.name.toLowerCase())) return p;
    if (p.rel && tl.includes(p.rel.toLowerCase())) return p;
  }
  return null;
}

async function handleContactAction(sentText) {
  const tl = sentText.toLowerCase();

  // Stop recording
  if (/\b(stop recording|done recording|finished recording)\b/i.test(tl)) {
    return stopRecordingClip();
  }

  // Record voice/video clip for someone
  if (/\b(record|save).*(voice|intro|clip|video|message)\b.*\b(for|from)\b/i.test(tl)) {
    const person = findPersonForAction(sentText);
    if (person) {
      const isVideo = /video/i.test(tl);
      await startRecordingClip(person.name, isVideo ? 'video' : 'voice');
      return true;
    }
  }

  // Play someone's clip
  if (/\b(play|hear|listen|watch).*(voice|intro|clip|video|message)\b/i.test(tl)) {
    const person = findPersonForAction(sentText);
    if (person) {
      const played = playPersonClip(person.name);
      if (!played) {
        const msg = `${person.name} hasn't recorded an introduction yet. A family member can record one by saying "record a voice clip for ${person.name}."`;
        addMsg(msg, 'gemma');
        speak(msg);
        saveToHistory('gemma', msg);
      }
      return true;
    }
  }

  const wantsCall = /\b(call|phone|ring|dial)\b/i.test(tl);
  const wantsText = /\b(text|message|send.*message|write.*to|tell.*that|sms)\b/i.test(tl);

  if (!wantsCall && !wantsText) return false;

  const person = findPersonForAction(sentText);
  if (!person) return false;

  const phone = findPhoneForPerson(person);

  if (wantsCall) {
    if (!phone) {
      const msg = `I'd love to call ${person.name} for you, but I don't have their phone number yet. Can you tell me their number?`;
      addMsg(msg, 'gemma');
      speak(msg);
      saveToHistory('gemma', msg);
      return true;
    }
    pendingAction = { type: 'call', person, phone };
    const msg = `I can call ${person.name} for you right now. Would you like me to?`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
    return true;
  }

  if (wantsText) {
    if (!phone) {
      const msg = `I'd like to message ${person.name} for you, but I don't have their number. Can you tell me?`;
      addMsg(msg, 'gemma');
      speak(msg);
      saveToHistory('gemma', msg);
      return true;
    }

    // Generate a message using AI
    const name = localStorage.getItem('gm_name') || 'your loved one';
    try {
      const prompt = `You are writing a short, warm text message from ${name} to ${person.name} (${person.rel || 'family'}).
The user said: "${sentText}"
Write ONLY the text message body — 1-2 sentences, warm and natural. No quotes, no explanation.`;
      const draft = await aiGenerate(prompt);
      pendingAction = { type: 'sms', person, phone, message: draft.trim() };

      const msg = `Here's what I'd send to ${person.name}:\n\n"${draft.trim()}"\n\nShould I send it?`;
      addMsg(msg, 'gemma');
      speak(`Here's what I'd send to ${person.name}: ${draft.trim()}. Should I send it?`);
      saveToHistory('gemma', msg);
    } catch (e) {
      const msg = `I had trouble writing that message. Can you tell me what you'd like to say to ${person.name}?`;
      addMsg(msg, 'gemma');
      speak(msg);
      saveToHistory('gemma', msg);
    }
    return true;
  }

  return false;
}

function executePendingAction() {
  if (!pendingAction) return;

  if (pendingAction.type === 'call') {
    window.open(`tel:${pendingAction.phone}`, '_self');
    const msg = `Calling ${pendingAction.person.name} now...`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
  } else if (pendingAction.type === 'sms') {
    const smsBody = encodeURIComponent(pendingAction.message);
    window.open(`sms:${pendingAction.phone}?body=${smsBody}`, '_blank');
    const msg = `I've opened the message to ${pendingAction.person.name}. You can review it and hit send.`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
  }

  pendingAction = null;
}

// ===== CHAT MIC (speech-to-text in chat input) =====
let chatMicActive = false;
let chatMicRecognition = null;

function toggleChatMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  if (chatMicActive) {
    chatMicRecognition?.stop();
    chatMicActive = false;
    document.getElementById('chatMicBtn')?.classList.remove('mic-active');
    return;
  }

  chatMicRecognition = new SR();
  chatMicRecognition.continuous = false;
  chatMicRecognition.interimResults = true;
  chatMicRecognition.lang = 'en-US';

  chatMicRecognition.onresult = e => {
    document.getElementById('msgInput').value = Array.from(e.results).map(r => r[0].transcript).join('');
  };
  chatMicRecognition.onend = () => {
    chatMicActive = false;
    document.getElementById('chatMicBtn')?.classList.remove('mic-active');
    const input = document.getElementById('msgInput');
    if (input?.value.trim()) sendMessage();
  };
  chatMicRecognition.onerror = () => {
    chatMicActive = false;
    document.getElementById('chatMicBtn')?.classList.remove('mic-active');
  };

  chatMicActive = true;
  document.getElementById('chatMicBtn')?.classList.add('mic-active');
  document.getElementById('msgInput').value = '';
  chatMicRecognition.start();
}

// ===== VOICE MODE =====
let voiceAmplitude = 0;
let sttRecognition = null;
let voiceActive = false;

function setVizState(state) {
  const frame = document.getElementById('vizFrame');
  if (frame?.contentWindow) frame.contentWindow.postMessage({ type: 'gemma_state', state }, '*');
}

function enterVoiceMode() {
  showScreen('voiceMode');
  voiceActive = true;
  setVizState('listening');
  startListening();
}

function exitVoiceMode() {
  voiceActive = false;
  stopListening();
  showScreen('chatScreen');
}

function startListening() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { document.getElementById('voiceStatus').textContent = 'Speech not supported'; return; }

  sttRecognition = new SR();
  sttRecognition.continuous = false;
  sttRecognition.interimResults = true;
  sttRecognition.lang = 'en-US';

  sttRecognition.onresult = e => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('voicePartial').textContent = transcript;
  };

  sttRecognition.onend = () => {
    voiceAmplitude = 0;
    const text = document.getElementById('voicePartial').textContent.trim();
    if (text && voiceActive) {
      document.getElementById('voiceStatus').textContent = 'Thinking...';
      document.getElementById('voicePartial').textContent = '';
      setVizState('thinking');
      chatHistory.push({ role: 'user', text });
      saveToHistory('user', text);
      addMsg(text, 'user');

      (async () => {
        try {
          const name = localStorage.getItem('gm_name') || 'friend';
          const prompt = `You are Gemma, ${name}'s companion. Be warm, brief.

PEOPLE: ${peopleContext()}
${name}: ${text}

Respond in 1-2 sentences. Natural, caring.
GEMMA:`;
          const reply = await aiGenerate(prompt);
          let clean = reply.replace(/\[SAVE:[^\]]*\]|\[UPDATE:[^\]]*\]|\[REMIND:[^\]]*\]/g, '').trim();
          // Parse save/update/remind same as chat
          const saveM = reply.match(/\[SAVE:([^:]*):([^:]*):([^\]]*)\]/);
          if (saveM) addPerson(saveM[1].trim(), saveM[2].trim(), saveM[3].trim());
          const remM = reply.match(/\[REMIND:([^\]]*)\]/);
          if (remM) saveReminder(remM[1].trim());

          chatHistory.push({ role: 'gemma', text: clean });
          saveToHistory('gemma', clean);
          addMsg(clean, 'gemma');
          document.getElementById('voiceStatus').textContent = 'Speaking...';
          setVizState('speaking');
          voiceAmplitude = 0.7;

          speak(clean, () => {
            voiceAmplitude = 0;
            if (voiceActive) {
              document.getElementById('voiceStatus').textContent = 'Listening...';
              setVizState('listening');
              startListening();
            }
          });
          updateStatus();
        } catch (e) {
          console.error(e);
          document.getElementById('voiceStatus').textContent = 'Error. Trying again...';
          if (voiceActive) setTimeout(startListening, 1500);
        }
      })();
    } else if (voiceActive) {
      // No speech detected, restart
      startListening();
    }
  };

  sttRecognition.onaudiostart = () => { voiceAmplitude = 0.3; setVizState('listening'); };
  sttRecognition.onsoundstart = () => { voiceAmplitude = 0.6; };
  sttRecognition.onsoundend = () => { voiceAmplitude = 0.1; };
  sttRecognition.onerror = e => {
    voiceAmplitude = 0;
    if (voiceActive && (e.error === 'no-speech' || e.error === 'aborted')) {
      startListening();
    } else {
      document.getElementById('voiceStatus').textContent = `Error: ${e.error}`;
    }
  };

  document.getElementById('voiceStatus').textContent = 'Listening...';
  sttRecognition.start();
}

function stopListening() {
  voiceAmplitude = 0;
  try { sttRecognition?.stop(); } catch {}
  try { speechSynthesis?.cancel(); } catch {}
}

// ===== INIT =====
document.getElementById('msgInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

window.addEventListener('DOMContentLoaded', () => {
  animateStars();
  if (getMode()) startChat();
});
