// ===== GEMMA REMEMBER v3 — WEB VERSION =====

// ===== MEMORY =====
function getMemories() { try { return JSON.parse(localStorage.getItem('gm_people') || '[]'); } catch { return []; } }
function saveMemories(m) { localStorage.setItem('gm_people', JSON.stringify(m)); }
// Legacy text-only reminders helper kept for backward read; new typed reminders are at the bottom of the file.
function getReminders() { return getRawReminders(); }

// Strip AI-generated photo description sentences from a story field.
// Splits on sentence boundaries and drops ones that match a photo-description fingerprint.
function stripPhotoDescriptions(story) {
  if (!story) return story;
  const photoDescPatterns = [
    /^Photo description:/i,
    /^(He|She|They)\s+(gazes|stands|sits|poses|appears|is positioned|is wearing|wears|has)\b/i,
    /\b(He|She|They) (?:gazes|stares|looks) (?:directly|straight) at the camera\b/i,
    /\b(checkered|plaid|striped|button-down|button up|polo|collared)\s+(shirt|blouse|top)\b/i,
    /\bfacial expression\b/i,
    /\bheadshot\b/i,
    /\bposture\b/i,
    /\b(solid|plain|neutral)\s+(color\s+)?background\b/i,
    /\bagainst (?:a|the)\s+(?:plain|solid|white|gray|grey|black|colored|neutral)\s+(?:background|backdrop|wall)/i,
    /\bThe (?:man|woman|boy|girl|person|individual|subject)\s+(?:is|has|stands|wears|gazes|appears|features)\b/i,
    /\bA (?:young|middle-aged|elderly)\s+(?:adult\s+)?(?:male|female|man|woman)\s+with\b/i,
    /\b(?:short|long|curly|straight|wavy|cropped)\s+(?:brown|black|blonde|gray|grey|red|dark|light)\s+hair\b/i,
    /\b(?:fair|tan|olive|dark|light|pale)\s+(?:skin|complexion)\b/i,
    /\bThis (?:photo|image|picture) (?:features|shows|depicts|contains)\b/i,
    /\bIn (?:the|this) (?:photo|image|picture)\b/i,
    /\bstandard headshot\b/i,
    /\b(?:single|one)\s+(?:young|adult|elderly)?\s*(?:man|woman|male|female|person)\s+with\b/i,
    /\bgazes? (?:directly|straight)\b/i,
    /\bcalm,?\s+neutral\b/i,
    /^\.?\s*The (?:background|backdrop|setting) (?:is|appears|features)\b/i,
    /\bstudio (?:backdrop|background)\b/i,
    /\b(?:simple|plain),?\s+solid,?\s+(?:dark|light)?\s*(?:gray|grey|white|black|colored)\b/i,
    /\bdark\s+gray\s+(?:studio|backdrop|background)/i,
  ];
  return story
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s && !photoDescPatterns.some(p => p.test(s)))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Re-run the cleanup whenever this version bumps
const PHOTO_DESC_CLEANUP_VERSION = '4';
function cleanupOldPhotoDescriptions() {
  if (localStorage.getItem('gm_photo_desc_cleanup_v') === PHOTO_DESC_CLEANUP_VERSION) return;
  const memories = (() => { try { return JSON.parse(localStorage.getItem('gm_people') || '[]'); } catch { return []; } })();
  let changed = false;
  memories.forEach(p => {
    if (!p.story) return;
    const cleaned = stripPhotoDescriptions(p.story);
    if (cleaned !== p.story) { p.story = cleaned; changed = true; }
  });
  if (changed) localStorage.setItem('gm_people', JSON.stringify(memories));
  localStorage.setItem('gm_photo_desc_cleanup_v', PHOTO_DESC_CLEANUP_VERSION);
}

function addPerson(name, rel, story, photoB64) {
  const memories = getMemories();
  const cleanStory = stripPhotoDescriptions(story || '');
  const existing = memories.find(m => m.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (rel) existing.rel = rel;
    if (cleanStory) existing.story = stripPhotoDescriptions(existing.story ? existing.story + '. ' + cleanStory : cleanStory);
    if (photoB64) existing.photo = photoB64;
    existing.lastMentioned = Date.now();
    saveMemories(memories);
    return;
  }
  memories.push({
    name, rel: rel || '', story: cleanStory, photo: photoB64 || '',
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
  const mode = getMode();
  const GemmaPlugin = window.Capacitor?.Plugins?.GemmaPlugin;

  // Local mode: use on-device Gemma via Capacitor plugin
  if (mode === 'local' && GemmaPlugin) {
    try {
      const { text } = await GemmaPlugin.generate({ systemPrompt: '', query: prompt });
      return text;
    } catch (e) {
      console.warn('Local Gemma failed, falling back to API:', e);
      // Fall through to API
    }
  }

  // API mode (or local fallback)
  const key = getApiKey();
  if (!key) throw new Error('No AI available');
  const parts = [{ text: prompt }];
  if (imageB64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageB64 } });
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 180, temperature: 0.7 } })
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
    return;
  }

  // Local mode — only works in the APK with GemmaPlugin
  const GemmaPlugin = window.Capacitor?.Plugins?.GemmaPlugin;
  if (!GemmaPlugin) {
    alert("On-Device mode only works in the Android app. Please use Cloud mode in the browser, or install the APK to download Gemma 4 to your phone.");
    return;
  }

  // In APK: kick off the model download
  localStorage.setItem('gm_mode', 'local');
  startLocalDownload(GemmaPlugin);
}

async function startLocalDownload(GemmaPlugin) {
  // Replace mode cards with a download progress UI
  document.getElementById('modeCards').innerHTML = `
    <div style="padding:24px;background:#fff;border:2px solid #d4e0f7;border-radius:18px;text-align:center;">
      <h3 style="color:#0d3268;font-size:1.1rem;margin-bottom:12px;">Downloading Gemma 4...</h3>
      <p style="color:#5088c3;font-size:.9rem;margin-bottom:16px;">~2.6 GB. Stay on Wi-Fi. This only happens once.</p>
      <div style="width:100%;height:12px;background:#eef3ff;border-radius:6px;overflow:hidden;">
        <div id="dlBar" style="width:0%;height:100%;background:#4285F4;transition:width .3s;"></div>
      </div>
      <p id="dlLabel" style="margin-top:10px;color:#5088c3;font-size:.85rem;">Starting...</p>
    </div>
  `;

  try {
    const { ready } = await GemmaPlugin.isModelReady();
    if (!ready) {
      GemmaPlugin.addListener('downloadProgress', ({ percent, downloaded, total }) => {
        const pct = percent >= 0 ? percent : Math.round((downloaded / total) * 100);
        document.getElementById('dlBar').style.width = pct + '%';
        const mb = Math.round(downloaded / 1024 / 1024);
        const totalMb = Math.round(total / 1024 / 1024);
        document.getElementById('dlLabel').textContent = `${mb} MB / ${totalMb} MB (${pct}%)`;
      });
      await GemmaPlugin.downloadModel({});
    }
    document.getElementById('dlLabel').textContent = 'Ready!';
    setTimeout(() => startChat(), 800);
  } catch (e) {
    document.getElementById('dlLabel').textContent = 'Download failed. Tap a mode above to retry.';
    console.error(e);
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
  const sessionStart = parseInt(localStorage.getItem('gm_session_start') || '0', 10);
  const todayMsgs = history.filter(m =>
    new Date(m.ts).toDateString() === today && m.ts >= sessionStart
  );

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
      const welcome = `Hey ${name}, glad to see you again. What can I help you remember today?`;
      addMsg(welcome, 'gemma');
      saveToHistory('gemma', welcome);
      speak(welcome);
    }, 400);
  }
}

function startNewChat() {
  if (!confirm("Start a new chat? Your past conversations will still be in History, and Gemma will still remember everyone she knows.")) return;
  // Mark a fresh session start — past msgs stay in gm_history but won't paint into today's chat view
  localStorage.setItem('gm_session_start', Date.now().toString());
  // Reset in-memory short-term context
  chatHistory.length = 0;
  // Clear chat DOM
  const msgs = document.getElementById('chatMessages');
  if (msgs) msgs.innerHTML = '';
  stopSpeaking();
  // Close any open panels
  closeReminders?.();
  closeHistory?.();
  // Fresh greeting
  const name = localStorage.getItem('gm_name');
  setTimeout(() => {
    const welcome = name
      ? `Hey ${name}, glad to see you again. What can I help you remember today?`
      : `Hello — I'm Gemma. What's your name?`;
    addMsg(welcome, 'gemma');
    saveToHistory('gemma', welcome);
    speak(welcome);
  }, 250);
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

  // SOS confirmation — user said yes to sending location
  if (pendingLocation && /^(yes|yeah|yep|please|ok|okay|help|send|do it|sure)/i.test(sentText.trim())) {
    sendLocationToEmergencyContact();
    return;
  }
  if (pendingLocation && /^(no|nope|nah|i'm fine|im fine|i'm ok|im ok|nevermind|cancel)/i.test(sentText.trim())) {
    pendingLocation = null;
    const msg = "Okay, I'm right here with you. You're safe.";
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
    return;
  }

  // Detect "I'm lost" in the message — skip AI, ask one confirmation question
  if (!pendingLocation && /\b(i('m| am) lost|i don'?t know where|can'?t find (my way|home|where)|help me (get )?home|where am i)\b/i.test(sentText)) {
    const sos = getSosContact();
    const sosName = sos ? sos.name : 'your emergency contact';
    navigator.geolocation?.getCurrentPosition(pos => {
      pendingLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    }, null, { enableHighAccuracy: true, timeout: 8000 });
    const msg = `I'm right here with you. Are you lost? Should I send your location to ${sosName}?`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
    return;
  }

  (async () => {

    // Typing indicator
    const typing = document.createElement('div');
    typing.className = 'msg-typing';
    typing.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    document.getElementById('chatMessages').appendChild(typing);
    scrollChat();

    try {
      const name = localStorage.getItem('gm_name') || 'friend';
      const recent = chatHistory.slice(-8).map(m => `${m.role === 'user' ? name : 'GEMMA'}: ${m.text}`).join('\n');
      const remCtx = (() => {
        try {
          const upcoming = getUpcomingReminders(8);
          if (!upcoming.length) return '';
          return '\nUPCOMING REMINDERS:\n' + upcoming.map(({ reminder, next }) => {
            const when = next.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
            return `- ${reminder.title || reminder.text || '(reminder)'} [${reminder.type || 'note'} · ${when}]`;
          }).join('\n');
        } catch { return ''; }
      })();

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

LENGTH RULE — STRICT: Reply in 1-2 short sentences. Never more than 2. Do NOT explain, restate, or list. If a question can be answered in 5 words, answer in 5 words. Old people get tired by long messages — short is kind.

CRITICAL HONESTY RULES — NEVER VIOLATE:
- You are a chat app. You CANNOT send texts, make calls, or contact anyone on your own.
- The ONLY way a message or call actually happens is if you emit an action tag (see below) that the app executes.
- NEVER say "I sent it", "I'm sending", "I just texted", "I called", "I'm calling", "I told them", "I let them know", "Help is on the way", or anything that implies you contacted someone. These are lies — real harm for a dementia patient who may be lost or in distress.
- If ${name} asks you to text or call someone you have NO phone number for, TELL THE TRUTH: "I don't have their number yet — can you tell me it, or would you like to call 911?" Never pretend.
- If ${name} seems lost, distressed, or in an emergency: tell them clearly to call 911, and offer to open the phone dialer. Do not pretend help is already coming.

ORIENTATION: Naturally weave in the current day, time, and season when it feels right — not every message, but when greeting or when ${name} seems uncertain. Example: "It's Wednesday morning, a nice spring day." Never be condescending about it.

REPEAT QUESTIONS: ${name} may ask the same question many times. NEVER say "as I mentioned" or "like I said" or "I already told you." Answer every time with the same warmth and patience as if it's the first time. This is not forgetfulness — this is how their mind works, and they deserve full respect every time.

EMERGENCY CONTACT: ${(() => { const s = getSosContact(); return s ? `${s.name} (${s.phone})` : 'not set yet'; })()}

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
- If ${name} introduces someone ("this is my daughter Sarah"), respond warmly, end with: [SAVE:name:relationship:details]. The "details" field MUST be a short personal note of what ${name} actually said about them (e.g. "lives in Phoenix, calls every Sunday"). NEVER describe physical appearance from a photo — no hair, skin, clothing, posture, expression, or background. Just personal facts ${name} shared.
- If ${name} adds info about someone known, end with: [UPDATE:name:new info]
- If ${name} asks WHO someone is — "who is my son", "who is Emma", "show me my daughter" — emit [SHOW:name_or_relationship] (e.g. [SHOW:son], [SHOW:Emma], [SHOW:daughter]). The app will display their photo and play their voice clip if available. Keep your spoken reply short and warm.
- If ${name} asks to be reminded of ANYTHING — pills/medication, doctor appointments, birthdays, parties, errands — emit [REMIND:type:title:datetime:recurrence:personId].
  · type = medication | appointment | birthday | party | note
  · title = short description (e.g. "Take Lipitor", "Dr. Smith", "Emma's birthday")
  · datetime = ISO 8601 if you can compute it, OR a natural phrase like "tomorrow 8am", "today 9:30pm", "next monday 9am". Today is ${new Date().toISOString().slice(0,10)} (${new Date().toLocaleDateString('en-US', { weekday:'long' })}).
  · recurrence = once | daily | weekly | yearly. Default daily for medication, yearly for birthdays.
  · personId = the person's name from memory if relevant (e.g. for a birthday party). Empty if none.
  Examples: [REMIND:medication:Take Lipitor:8am:daily:] or [REMIND:party:Emma's 7th birthday:Saturday 2pm:once:Emma] or [REMIND:appointment:Dr. Smith:tomorrow 10am:once:].
- If ${name} mentions an emergency contact ("my emergency contact is Maria at 555-1234"), save it and end with: [SOS:name:phone]
- You CANNOT text or call anyone. The ONLY emergency action is the location button (the pin icon) or saying "I'm lost" — that opens the SMS composer with ${name}'s location pre-filled for their emergency contact. Never claim otherwise.
- If ${name} seems in distress or lost, gently remind them to tap the location pin or say "I'm lost".
- If ${name} asks what someone looks like and you have their appearance description in memory, share it naturally.
- If ${name} sends a photo, actually describe what you see — skin tone, hair, clothing, expression. Be specific.
- If ${name} sends a photo and it matches someone in memory, warmly say who it is, their relationship, and mention when they were last talked about. If they have a voice/video intro, offer to play it.
- If ${name} asks "who is this?" about someone in memory, give a warm, personal answer: their name, relationship, a personal detail from their story, and when they last came up.
- You can suggest recording a voice or video intro for family members so ${name} can hear their voice.
- Otherwise respond naturally. 1-2 short sentences MAX. ONLY use facts from memory or what ${name} just said.
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
        const description = saveM[3].trim();
        addPerson(saveM[1].trim(), saveM[2].trim(), description, hasPhoto ? sentPhoto : '');
        clean = reply.replace(saveM[0], '').trim();
      }
      const updM = reply.match(/\[UPDATE:([^:]*):([^\]]*)\]/);
      if (updM) {
        const p = findPerson(updM[1].trim());
        if (p) { p.story = (p.story ? p.story + '. ' + updM[2].trim() : updM[2].trim()); saveMemories(getMemories()); }
        clean = reply.replace(updM[0], '').trim();
      }
      // [REMIND:type:title:datetime:recurrence:personId] — all but type:title are optional
      const remM = reply.match(/\[REMIND:([^\]]*)\]/);
      if (remM) {
        const parts = remM[1].split(':').map(s => s.trim());
        if (parts.length >= 2 && /^(medication|appointment|birthday|party|note)$/i.test(parts[0])) {
          // Rich format
          const type = parts[0].toLowerCase();
          const title = parts[1];
          const dtRaw = parts[2] || '';
          const recurrence = parts[3] || (type === 'medication' ? 'daily' : type === 'birthday' || type === 'party' ? 'yearly' : 'once');
          const personId = parts[4] || null;
          const datetime = parseFlexibleDatetime(dtRaw);
          const r = addReminder({ type, title, datetime, recurrence, personId });
          clean = clean.replace(remM[0], '').trim();
          // Render the new reminder card inline
          setTimeout(() => showReminderCard(r), 200);
        } else {
          // Legacy: just text
          saveReminder(remM[1].trim());
          clean = clean.replace(remM[0], '').trim();
        }
      }

      // [SHOW:name|relationship] — pop a person card with photo + voice clip into the chat
      const showM = reply.match(/\[SHOW:([^\]]*)\]/);
      if (showM) {
        const target = showM[1].trim();
        clean = clean.replace(showM[0], '').trim();
        setTimeout(() => {
          const ok = showPersonCard(target);
          if (!ok) {
            const msg = `I don't have a picture of your ${target} yet — would you like to add one?`;
            addMsg(msg, 'gemma');
            speak(msg);
            saveToHistory('gemma', msg);
          }
        }, 200);
      }

      const sosM = reply.match(/\[SOS:([^:]*):([^\]]*)\]/);
      if (sosM) {
        saveSosContact(sosM[1].trim(), sosM[2].trim().replace(/[-.\s]/g, ''));
        clean = clean.replace(sosM[0], '').trim();
      }

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
  const el = document.getElementById('chatStatus');
  if (el) el.textContent = 'Your memory companion';
}

// ===== LOCATION =====
let pendingLocation = null;

function shareLocation() {
  if (!navigator.geolocation) { addMsg("Location isn't available on this device.", 'gemma'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    pendingLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const sos = getSosContact();
    const sosName = sos ? sos.name : 'your emergency contact';
    const msg = `I have your location. Are you lost? Should I send it to ${sosName}?`;
    addMsg(msg, 'gemma');
    speak(msg);
    saveToHistory('gemma', msg);
  }, () => {
    addMsg("I couldn't get your location. Make sure location is turned on in your phone settings.", 'gemma');
  }, { enableHighAccuracy: true, timeout: 8000 });
}

function getSosContact() {
  try { return JSON.parse(localStorage.getItem('gm_sos') || 'null'); } catch { return null; }
}
function saveSosContact(name, phone) {
  localStorage.setItem('gm_sos', JSON.stringify({ name, phone }));
}

function sendLocationToEmergencyContact() {
  const sos = getSosContact();
  const userName = localStorage.getItem('gm_name') || 'your loved one';

  if (!sos) {
    const msg = "I don't have an emergency contact saved yet. Please tell me: who should I call if you need help? Say something like \"my emergency contact is John at 555-1234\".";
    addMsg(msg, 'gemma'); speak(msg); saveToHistory('gemma', msg);
    pendingLocation = null;
    return;
  }

  const getAndSend = (loc) => {
    const url = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
    const body = encodeURIComponent(`${userName} may be lost and needs help. Location: ${url}`);
    window.open(`sms:${sos.phone}?body=${body}`, '_blank');
    const msg = `I've opened a text to ${sos.name} with your location. Tap send, then stay right where you are. Someone is coming.`;
    addMsg(msg, 'gemma'); speak(msg); saveToHistory('gemma', msg);
    pendingLocation = null;
  };

  if (pendingLocation) {
    getAndSend(pendingLocation);
  } else {
    navigator.geolocation?.getCurrentPosition(
      pos => getAndSend({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        const msg = `I can't get your location right now. Call ${sos.name} directly at ${sos.phone}.`;
        addMsg(msg, 'gemma'); speak(msg); saveToHistory('gemma', msg);
        pendingLocation = null;
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }
}

// ===== MESSAGING & CALLING =====

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
  voiceActive = true;
  showScreen('voiceMode');
  setVizState('listening');
  try { startListening(); } catch(e) { console.error('STT failed:', e); }
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

// =====================================================================
// ===== REMINDERS v2 — typed reminders with scheduled notifications ====
// =====================================================================
//
// Schema: { id, type, title, datetime (ISO), recurrence, personId, notifications[], createdAt }
// type:        'medication' | 'appointment' | 'birthday' | 'party' | 'note'
// recurrence:  'once' | 'daily' | 'weekly' | 'yearly'
// personId:    person.name (we use name as id since names are unique in addPerson)
// notifications: array of { offsetMin, fired, label }
//
// Old-format reminders ({text, ts}) remain readable; they're rendered as 'note' type.

const REM_KEY = 'gm_reminders';
const FIRED_KEY = 'gm_fired_notifications';   // {[reminderId+occurrence]: true}
const PENDING_NOTICE_KEY = 'gm_pending_notice'; // last notification user hasn't seen

function newReminderId() { return 'r_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

function getRawReminders() { try { return JSON.parse(localStorage.getItem(REM_KEY) || '[]'); } catch { return []; } }
function saveRawReminders(arr) { localStorage.setItem(REM_KEY, JSON.stringify(arr)); }

// Default notification offsets per type (in minutes; negative = before)
function defaultNotifications(type) {
  switch (type) {
    case 'medication':  return [{ offsetMin: 0, fired: false, label: 'now' }];
    case 'appointment': return [
      { offsetMin: 0, fired: false, label: 'now' },
      { offsetMin: -180, fired: false, label: '3 hours before' }
    ];
    case 'birthday':    return [
      { offsetMin: -1440, fired: false, label: 'day before' },
      { offsetMin: 0, fired: false, label: 'morning of' }
    ];
    case 'party':       return [
      { offsetMin: -1440, fired: false, label: 'day before' },
      { offsetMin: -480, fired: false, label: 'morning of' },
      { offsetMin: -180, fired: false, label: '3 hours before' }
    ];
    default: return [{ offsetMin: 0, fired: false, label: 'at time' }];
  }
}

function addReminder({ type, title, datetime, recurrence, personId }) {
  const rems = getRawReminders();
  const r = {
    id: newReminderId(),
    type: type || 'note',
    title: title || '',
    datetime: datetime || new Date().toISOString(),
    recurrence: recurrence || (type === 'birthday' ? 'yearly' : type === 'medication' ? 'daily' : 'once'),
    personId: personId || null,
    notifications: defaultNotifications(type),
    createdAt: Date.now()
  };
  rems.push(r);
  saveRawReminders(rems);
  scheduleAllNotifications();
  return r;
}

// Legacy: keep the old text-based saveReminder working
function saveReminder(text) {
  const rems = getRawReminders();
  rems.push({ id: newReminderId(), type: 'note', title: text, text, ts: Date.now(), createdAt: Date.now() });
  saveRawReminders(rems);
  scheduleAllNotifications();
}

function deleteReminder(id) {
  saveRawReminders(getRawReminders().filter(r => r.id !== id));
  scheduleAllNotifications();
}

function updateReminder(id, patch) {
  const rems = getRawReminders();
  const r = rems.find(x => x.id === id);
  if (!r) return;
  Object.assign(r, patch);
  saveRawReminders(rems);
  scheduleAllNotifications();
}

// Returns the next occurrence Date for a reminder based on recurrence
// Parse the model's datetime string. Accepts ISO, "YYYY-MM-DD HH:MM", or a few natural-language hints.
// On ambiguity, returns ISO of best guess; on failure, defaults to "in 1 hour".
function parseFlexibleDatetime(s) {
  if (!s) return new Date(Date.now() + 3600000).toISOString();
  const trimmed = s.trim();

  // Direct ISO / Date.parse
  const direct = Date.parse(trimmed);
  if (!isNaN(direct)) return new Date(direct).toISOString();

  const now = new Date();
  const lower = trimmed.toLowerCase();

  // "tomorrow [at] 8am" / "today 9:30pm" / "tonight 9pm"
  const dayWord = /^(today|tonight|tomorrow|day after tomorrow)/.exec(lower);
  if (dayWord) {
    const d = new Date(now);
    if (dayWord[1] === 'tomorrow') d.setDate(d.getDate() + 1);
    if (dayWord[1] === 'day after tomorrow') d.setDate(d.getDate() + 2);
    if (dayWord[1] === 'tonight') d.setHours(20, 0, 0, 0);
    const time = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower.slice(dayWord[0].length));
    if (time) {
      let hour = parseInt(time[1], 10);
      const min = parseInt(time[2] || '0', 10);
      const ampm = time[3];
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      d.setHours(hour, min, 0, 0);
    }
    return d.toISOString();
  }

  // "next monday 8am" — pick next weekday
  const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const nextDay = /^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/.exec(lower);
  if (nextDay) {
    const target = weekdays.indexOf(nextDay[1]);
    const d = new Date(now);
    const diff = (target + 7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + diff);
    const time = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower.slice(nextDay[0].length));
    if (time) {
      let hour = parseInt(time[1], 10);
      const min = parseInt(time[2] || '0', 10);
      if (time[3] === 'pm' && hour < 12) hour += 12;
      if (time[3] === 'am' && hour === 12) hour = 0;
      d.setHours(hour, min, 0, 0);
    } else {
      d.setHours(9, 0, 0, 0);
    }
    return d.toISOString();
  }

  // Plain time today: "8am", "9:30pm"
  const timeOnly = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(lower);
  if (timeOnly) {
    const d = new Date(now);
    let hour = parseInt(timeOnly[1], 10);
    const min = parseInt(timeOnly[2] || '0', 10);
    if (timeOnly[3] === 'pm' && hour < 12) hour += 12;
    if (timeOnly[3] === 'am' && hour === 12) hour = 0;
    d.setHours(hour, min, 0, 0);
    if (d <= now) d.setDate(d.getDate() + 1); // assume tomorrow if already past
    return d.toISOString();
  }

  // Fallback: 1 hour from now
  return new Date(Date.now() + 3600000).toISOString();
}

function nextOccurrence(reminder, after = new Date()) {
  if (!reminder.datetime) return null;
  let dt = new Date(reminder.datetime);
  if (isNaN(dt.getTime())) return null;
  if (dt > after) return dt;
  switch (reminder.recurrence) {
    case 'daily':
      while (dt <= after) dt = new Date(dt.getTime() + 86400000);
      return dt;
    case 'weekly':
      while (dt <= after) dt = new Date(dt.getTime() + 7 * 86400000);
      return dt;
    case 'yearly':
      while (dt <= after) {
        const next = new Date(dt);
        next.setFullYear(next.getFullYear() + 1);
        dt = next;
      }
      return dt;
    default:
      return null; // 'once' and already past
  }
}

function getUpcomingReminders(limit = 10) {
  const now = new Date();
  return getRawReminders()
    .map(r => {
      const next = r.text && !r.type ? null : nextOccurrence(r, now);
      return { reminder: r, next };
    })
    .filter(x => x.next)
    .sort((a, b) => a.next - b.next)
    .slice(0, limit);
}

function getTodayReminders() {
  const now = new Date();
  const eod = new Date(now);
  eod.setHours(23, 59, 59, 999);
  return getRawReminders()
    .map(r => ({ reminder: r, next: nextOccurrence(r, now) }))
    .filter(x => x.next && x.next <= eod);
}

// =====================================================================
// ===== NOTIFICATIONS — schedule + dispatch ============================
// =====================================================================

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

let webNotificationTimers = [];

async function ensureNotificationPermission() {
  if (isNative()) {
    try {
      const LN = window.Capacitor.Plugins.LocalNotifications;
      if (LN) {
        const { display } = await LN.requestPermissions();
        return display === 'granted';
      }
    } catch (e) { console.warn('Native notif permission failed:', e); }
    return false;
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  } catch { return false; }
}

function notificationKey(reminderId, occurrenceMs, offsetMin) {
  return `${reminderId}__${occurrenceMs}__${offsetMin}`;
}

function getFiredMap() { try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; } }
function markFired(key) {
  const m = getFiredMap();
  m[key] = Date.now();
  // prune entries older than 30 days
  const cutoff = Date.now() - 30 * 86400000;
  Object.keys(m).forEach(k => { if (m[k] < cutoff) delete m[k]; });
  localStorage.setItem(FIRED_KEY, JSON.stringify(m));
}

function clearWebTimers() {
  webNotificationTimers.forEach(id => clearTimeout(id));
  webNotificationTimers = [];
}

async function scheduleAllNotifications() {
  if (!(await ensureNotificationPermission())) return;

  if (isNative()) {
    await scheduleNativeNotifications();
  } else {
    scheduleWebNotifications();
  }
}

function scheduleWebNotifications() {
  clearWebTimers();
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;
  const fired = getFiredMap();
  const rems = getRawReminders();

  rems.forEach(r => {
    if (!r.notifications || !r.datetime) return;
    const next = nextOccurrence(r, new Date());
    if (!next) return;
    const occMs = next.getTime();

    r.notifications.forEach(n => {
      const fireAt = occMs + n.offsetMin * 60000;
      const key = notificationKey(r.id, occMs, n.offsetMin);
      if (fired[key]) return;
      if (fireAt <= now || fireAt > horizon) return;

      const delay = fireAt - now;
      const timer = setTimeout(() => fireWebNotification(r, n.label, occMs, n.offsetMin), delay);
      webNotificationTimers.push(timer);
    });
  });
}

function notificationCopy(reminder, label) {
  const t = reminder.type;
  const title = reminder.title || 'Reminder';
  if (t === 'medication') return { title: `Time for your medication`, body: `${title} — tap to mark taken` };
  if (t === 'appointment') return label === 'now'
    ? { title: `${title} — now`, body: `It's time for your appointment.` }
    : { title: `Coming up: ${title}`, body: `Your appointment is in about ${Math.abs(reminder.notifications.find(n => n.label === label)?.offsetMin) / 60 | 0} hours.` };
  if (t === 'birthday') return label === 'day before'
    ? { title: `${title}'s birthday is tomorrow`, body: `Don't forget to wish them a happy birthday.` }
    : { title: `It's ${title}'s birthday today`, body: `A happy birthday to ${title}.` };
  if (t === 'party') {
    if (label === 'day before') return { title: `${title} is tomorrow`, body: `Get ready — the party is tomorrow.` };
    if (label === 'morning of') return { title: `${title} is today`, body: `The party is later today.` };
    return { title: `${title} is in 3 hours`, body: `Time to start getting ready.` };
  }
  return { title, body: label || 'Reminder' };
}

function fireWebNotification(reminder, label, occMs, offsetMin) {
  const key = notificationKey(reminder.id, occMs, offsetMin);
  markFired(key);
  const { title, body } = notificationCopy(reminder, label);
  setPendingNotice({ reminderId: reminder.id, personId: reminder.personId, type: reminder.type, title, body, firedAt: Date.now() });

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, { body, icon: '/assets/icon-192.png', tag: reminder.id });
      n.onclick = () => { window.focus(); openReminderInChat(reminder.id); n.close(); };
    } catch (e) { console.warn('Web notification show failed:', e); }
  }
}

async function scheduleNativeNotifications() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LN) return;
  try {
    // Cancel previously scheduled
    const pending = await LN.getPending();
    if (pending?.notifications?.length) {
      await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    }
  } catch (e) { console.warn('LN cancel failed:', e); }

  const now = Date.now();
  const horizon = now + 30 * 86400000; // 30 days for native (more durable than web)
  const fired = getFiredMap();
  const rems = getRawReminders();
  const list = [];
  let nid = 1;

  rems.forEach(r => {
    if (!r.notifications || !r.datetime) return;
    let next = nextOccurrence(r, new Date());
    if (!next) return;
    let occMs = next.getTime();

    // For recurring, schedule next 3 occurrences
    const occurrences = [next];
    if (r.recurrence === 'daily') for (let i = 1; i < 7; i++) occurrences.push(new Date(occMs + i * 86400000));
    if (r.recurrence === 'weekly') for (let i = 1; i < 3; i++) occurrences.push(new Date(occMs + i * 7 * 86400000));

    occurrences.forEach(occ => {
      r.notifications.forEach(n => {
        const fireAt = occ.getTime() + n.offsetMin * 60000;
        const key = notificationKey(r.id, occ.getTime(), n.offsetMin);
        if (fired[key]) return;
        if (fireAt <= now || fireAt > horizon) return;
        const { title, body } = notificationCopy(r, n.label);
        list.push({
          id: nid++,
          title,
          body,
          schedule: { at: new Date(fireAt) },
          extra: { reminderId: r.id, personId: r.personId, type: r.type, key }
        });
      });
    });
  });

  if (list.length === 0) return;
  try { await LN.schedule({ notifications: list }); }
  catch (e) { console.warn('LN schedule failed:', e); }
}

function setPendingNotice(notice) {
  localStorage.setItem(PENDING_NOTICE_KEY, JSON.stringify(notice));
}
function getPendingNotice() {
  try { return JSON.parse(localStorage.getItem(PENDING_NOTICE_KEY) || 'null'); } catch { return null; }
}
function clearPendingNotice() { localStorage.removeItem(PENDING_NOTICE_KEY); }

function openReminderInChat(reminderId) {
  // If we're not on chat screen, navigate there
  showScreen('chatScreen');
  const rem = getRawReminders().find(r => r.id === reminderId);
  if (!rem) return;
  showReminderCard(rem);
}

// =====================================================================
// ===== PERSON / REMINDER CARDS in chat ================================
// =====================================================================

function personCardHtml(person) {
  if (!person) return '';
  const photo = person.photo
    ? `<img class="pcard-photo" src="data:image/jpeg;base64,${person.photo}" alt="${person.name}">`
    : `<div class="pcard-photo pcard-no-photo">${(person.name || '?')[0].toUpperCase()}</div>`;
  const rel = person.rel ? `<div class="pcard-rel">${escapeHtml(person.rel)}</div>` : '';
  let audio = '';
  if (person.voiceClip) {
    const src = `data:audio/webm;base64,${person.voiceClip}`;
    audio = `<audio class="pcard-audio" controls preload="none" src="${src}"></audio>`;
  }
  let video = '';
  if (person.videoClip) {
    const src = `data:video/webm;base64,${person.videoClip}`;
    video = `<video class="pcard-video" controls playsinline preload="none" src="${src}"></video>`;
  }
  return `
    <div class="person-card">
      ${photo}
      <div class="pcard-info">
        <div class="pcard-name">${escapeHtml(person.name)}</div>
        ${rel}
        ${audio}
        ${video}
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showPersonCard(personOrName) {
  const person = typeof personOrName === 'string' ? findPersonByQuery(personOrName) : personOrName;
  if (!person) return false;
  addMsg(personCardHtml(person), 'gemma', true);
  // Update lastMentioned
  const all = getMemories();
  const target = all.find(p => p.name === person.name);
  if (target) { target.lastMentioned = Date.now(); saveMemories(all); }
  return true;
}

// More forgiving than findPerson: matches by name or by relationship word
function findPersonByQuery(q) {
  if (!q) return null;
  const ql = q.toLowerCase().trim();
  const memories = getMemories();
  // Exact name match first
  let p = memories.find(m => m.name.toLowerCase() === ql);
  if (p) return p;
  // Relationship match (e.g. "son", "daughter", "wife") — prefer most-recently-mentioned
  p = memories
    .filter(m => m.rel && m.rel.toLowerCase().split(/[\s,/]+/).includes(ql))
    .sort((a, b) => (b.lastMentioned || 0) - (a.lastMentioned || 0))[0];
  if (p) return p;
  // Substring on name
  p = memories.find(m => m.name.toLowerCase().includes(ql) || ql.includes(m.name.toLowerCase()));
  if (p) return p;
  // Substring on relationship
  p = memories.find(m => m.rel && m.rel.toLowerCase().includes(ql));
  return p || null;
}

function showReminderCard(reminder) {
  const dt = new Date(reminder.datetime);
  const when = dt.toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const typeLabel = ({ medication: 'Medication', appointment: 'Appointment', birthday: 'Birthday', party: 'Birthday party', note: 'Reminder' })[reminder.type] || 'Reminder';

  let inner = `<div class="rcard-type">${typeLabel}</div>
               <div class="rcard-title">${escapeHtml(reminder.title)}</div>
               <div class="rcard-when">${when}</div>`;

  if (reminder.personId) {
    const p = findPersonByQuery(reminder.personId);
    if (p && p.photo) {
      inner += personCardHtml(p);
    }
  }
  addMsg(`<div class="reminder-card">${inner}</div>`, 'gemma', true);
}

// =====================================================================
// ===== REMINDERS PANEL UI =============================================
// =====================================================================

function openReminders() {
  let panel = document.getElementById('remindersPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'remindersPanel';
    panel.className = 'history-panel'; // reuse styling
    panel.innerHTML = `
      <div class="history-header">
        <h2>Reminders</h2>
        <button class="icon-btn" onclick="closeReminders()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="history-actions">
        <button class="history-action-btn" onclick="showAddReminderForm()">+ Add reminder</button>
      </div>
      <div id="addReminderForm" class="add-reminder-form" style="display:none"></div>
      <div class="history-list" id="remindersList"></div>
    `;
    document.getElementById('chatScreen').appendChild(panel);
  }
  panel.style.display = '';
  renderReminders();
}

function closeReminders() {
  const panel = document.getElementById('remindersPanel');
  if (panel) panel.style.display = 'none';
}

function renderReminders() {
  const list = document.getElementById('remindersList');
  if (!list) return;
  const upcoming = getUpcomingReminders(50);
  if (upcoming.length === 0) {
    list.innerHTML = '<p style="color:#8b95a8;text-align:center;padding:40px">No reminders yet.<br>Tap "+ Add reminder" or just tell Gemma.</p>';
    return;
  }
  list.innerHTML = '';
  upcoming.forEach(({ reminder, next }) => {
    const item = document.createElement('div');
    item.className = 'reminder-item';
    const when = next.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const typeLabel = ({ medication: '💊', appointment: '🏥', birthday: '🎂', party: '🎉', note: '📝' })[reminder.type] || '📝';
    const recur = reminder.recurrence !== 'once' ? ` · ${reminder.recurrence}` : '';
    item.innerHTML = `
      <div class="reminder-item-icon">${typeLabel}</div>
      <div class="reminder-item-body">
        <div class="reminder-item-title">${escapeHtml(reminder.title || '(no title)')}</div>
        <div class="reminder-item-when">${when}${recur}</div>
      </div>
      <button class="reminder-item-del" onclick="deleteReminder('${reminder.id}'); renderReminders();" aria-label="Delete">&#10005;</button>
    `;
    list.appendChild(item);
  });
}

function showAddReminderForm() {
  const form = document.getElementById('addReminderForm');
  if (!form) return;
  const people = getMemories();
  const peopleOpts = people.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p.rel ? ' (' + escapeHtml(p.rel) + ')' : ''}</option>`).join('');
  // Default datetime: 1 hour from now, rounded
  const defaultDt = new Date(Date.now() + 3600000);
  defaultDt.setMinutes(0, 0, 0);
  const localIso = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  form.innerHTML = `
    <div class="rf-row">
      <label>What kind?</label>
      <select id="rf_type">
        <option value="medication">💊 Medication</option>
        <option value="appointment">🏥 Doctor / appointment</option>
        <option value="party">🎉 Birthday party</option>
        <option value="birthday">🎂 Birthday</option>
        <option value="note">📝 Note</option>
      </select>
    </div>
    <div class="rf-row">
      <label>What to remember?</label>
      <input id="rf_title" type="text" placeholder="e.g. Take Lipitor, Dr. Smith, Emma's birthday">
    </div>
    <div class="rf-row">
      <label>When?</label>
      <input id="rf_datetime" type="datetime-local" value="${localIso}">
    </div>
    <div class="rf-row">
      <label>Repeats?</label>
      <select id="rf_recur">
        <option value="once">Just once</option>
        <option value="daily">Every day</option>
        <option value="weekly">Every week</option>
        <option value="yearly">Every year</option>
      </select>
    </div>
    <div class="rf-row">
      <label>Who is it for? (optional)</label>
      <select id="rf_person">
        <option value="">— No one —</option>
        ${peopleOpts}
      </select>
    </div>
    <div class="rf-row rf-actions">
      <button class="btn-ghost-small" onclick="hideAddReminderForm()">Cancel</button>
      <button class="btn-primary-small" onclick="submitAddReminder()">Save</button>
    </div>
  `;
  form.style.display = '';

  // Auto-set sensible recurrence when type changes
  document.getElementById('rf_type').addEventListener('change', e => {
    const recur = document.getElementById('rf_recur');
    if (e.target.value === 'medication') recur.value = 'daily';
    else if (e.target.value === 'birthday' || e.target.value === 'party') recur.value = 'yearly';
    else recur.value = 'once';
  });
}

function hideAddReminderForm() {
  const form = document.getElementById('addReminderForm');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

function submitAddReminder() {
  const type = document.getElementById('rf_type').value;
  const title = document.getElementById('rf_title').value.trim();
  const dt = document.getElementById('rf_datetime').value;
  const recurrence = document.getElementById('rf_recur').value;
  const personId = document.getElementById('rf_person').value || null;
  if (!title || !dt) { alert('Please add a title and time.'); return; }
  addReminder({ type, title, datetime: new Date(dt).toISOString(), recurrence, personId });
  hideAddReminderForm();
  renderReminders();
  ensureNotificationPermission();
}

// =====================================================================
// ===== MORNING MESSAGE + PENDING-NOTICE on app open ===================
// =====================================================================

const MORNING_KEY = 'gm_last_morning';

function shouldShowMorningMessage() {
  const today = new Date().toDateString();
  const last = localStorage.getItem(MORNING_KEY);
  const h = new Date().getHours();
  return last !== today && h >= 6 && h < 12;
}

function buildMorningMessage(name) {
  const today = getTodayReminders();
  const hello = `Good morning${name ? ', ' + name : ''}.`;
  if (today.length === 0) {
    return `${hello} It's a quiet day — nothing on the calendar so far. I'm right here whenever you need me.`;
  }
  const lines = today.map(({ reminder, next }) => {
    const time = next.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const ico = ({ medication: '💊', appointment: '🏥', birthday: '🎂', party: '🎉', note: '📝' })[reminder.type] || '•';
    return `${ico} ${reminder.title} at ${time}`;
  });
  return `${hello} Here's what's on for today:\n\n${lines.join('\n')}`;
}

async function maybeShowMorningMessage() {
  if (!shouldShowMorningMessage()) return;
  const name = localStorage.getItem('gm_name') || '';
  const msg = buildMorningMessage(name);
  setTimeout(() => {
    addMsg(msg, 'gemma');
    saveToHistory('gemma', msg);
    speak(msg);
    localStorage.setItem(MORNING_KEY, new Date().toDateString());
  }, 700);
}

async function maybeShowPendingNotice() {
  const notice = getPendingNotice();
  if (!notice) return;
  const ageMin = (Date.now() - notice.firedAt) / 60000;
  if (ageMin > 240) { clearPendingNotice(); return; }   // older than 4h, drop
  const rem = getRawReminders().find(r => r.id === notice.reminderId);
  setTimeout(() => {
    addMsg(`<strong>${escapeHtml(notice.title)}</strong><br>${escapeHtml(notice.body)}`, 'gemma', true);
    if (rem) showReminderCard(rem);
    clearPendingNotice();
  }, 400);
}

// Capacitor: when user taps a notification, mark fired + open reminder card
async function setupNativeNotificationListeners() {
  if (!isNative()) return;
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (!LN) return;
  try {
    LN.addListener('localNotificationActionPerformed', evt => {
      const extra = evt?.notification?.extra || {};
      if (extra.key) markFired(extra.key);
      if (extra.reminderId) {
        setPendingNotice({ reminderId: extra.reminderId, personId: extra.personId, type: extra.type, title: evt.notification.title, body: evt.notification.body, firedAt: Date.now() });
        openReminderInChat(extra.reminderId);
      }
    });
  } catch (e) { console.warn('LN listener failed:', e); }
}

// =====================================================================
// ===== INIT ===========================================================
// =====================================================================
document.getElementById('msgInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

window.addEventListener('DOMContentLoaded', async () => {
  animateStars();
  cleanupOldPhotoDescriptions();
  // Every app open starts a fresh chat — past convos still live in History.
  localStorage.setItem('gm_session_start', Date.now().toString());
  await setupNativeNotificationListeners();
  if (getMode()) {
    startChat();
    await maybeShowPendingNotice();
    await maybeShowMorningMessage();
    scheduleAllNotifications();
    // ask permission softly after first interaction
    setTimeout(() => ensureNotificationPermission(), 3000);
  }
});

// Re-schedule when tab regains focus (web: setTimeouts can be killed by suspend)
window.addEventListener('focus', () => { if (getMode()) scheduleAllNotifications(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && getMode()) scheduleAllNotifications(); });
