// Tiny WebAudio synth so there are no sound files to load.

let ctx;

function context() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  return ctx;
}

// Browsers (iOS especially) only start audio from a tap: call this inside a click handler.
export function unlock() {
  const c = context();
  if (c.state === "suspended") c.resume();
}

function fadeOut(gain, t, peak, seconds) {
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + seconds);
}

function noise(c, seconds) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = c.createBufferSource();
  source.buffer = buffer;
  return source;
}

function kick(v) {
  const c = context(), t = c.currentTime;
  const osc = c.createOscillator(), gain = c.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  fadeOut(gain, t, v, 0.25);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}

function snare(v) {
  const c = context(), t = c.currentTime;
  const hiss = noise(c, 0.2), filter = c.createBiquadFilter(), hissGain = c.createGain();
  filter.type = "highpass";
  filter.frequency.value = 1000;
  fadeOut(hissGain, t, 0.6 * v, 0.15);
  hiss.connect(filter).connect(hissGain).connect(c.destination);
  hiss.start(t);

  const osc = c.createOscillator(), body = c.createGain();
  osc.type = "triangle";
  osc.frequency.value = 180;
  fadeOut(body, t, 0.4 * v, 0.1);
  osc.connect(body).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

function hat(v) {
  const c = context(), t = c.currentTime;
  const hiss = noise(c, 0.05), filter = c.createBiquadFilter(), gain = c.createGain();
  filter.type = "highpass";
  filter.frequency.value = 7000;
  fadeOut(gain, t, 0.3 * v, 0.05);
  hiss.connect(filter).connect(gain).connect(c.destination);
  hiss.start(t);
}

const PATTERN = [kick, hat, snare, hat];
let step = 0;

// Each hit plays the next drum in a small kick / hat / snare / hat loop.
export function drumHit(strength = 1) {
  PATTERN[step++ % PATTERN.length](0.5 + 0.5 * strength);
}

// ---------- your own sound ----------
// A recording is kept as a short mono clip: 16-bit samples at a low rate, as base64 text, so it
// fits in a saved machine and in a share link. Phone-call quality, but fine for a "boing".

const CLIP_RATE = 8000;
const CLIP_SECONDS = 1.5;
const RECORD_SECONDS = 2; // a little longer than the clip, since silence at the start is cut off
export const MAX_CLIP_CHARS = Math.ceil((CLIP_RATE * CLIP_SECONDS * 2) / 3) * 4;

export const canRecord = typeof MediaRecorder === "function" && Boolean(navigator.mediaDevices?.getUserMedia);

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// recorded audio -> the clip text, or null if nothing audible was in it
function toClip(buffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const ratio = buffer.sampleRate / CLIP_RATE;
  const mono = new Float32Array(Math.floor(buffer.length / ratio));
  for (let i = 0; i < mono.length; i++) { // averaging each stretch of samples also smooths away the highs
    const from = Math.floor(i * ratio), to = Math.max(from + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (const channel of channels) for (let j = from; j < to; j++) sum += channel[j];
    mono[i] = sum / ((to - from) * channels.length);
  }

  let peak = 0;
  for (const x of mono) peak = Math.max(peak, Math.abs(x));
  if (peak < 0.01) return null;

  const loud = (x) => Math.abs(x) > peak * 0.1;
  const margin = Math.round(0.02 * CLIP_RATE);
  const start = Math.max(0, mono.findIndex(loud) - margin);
  const clip = mono.slice(start, Math.min(mono.findLastIndex(loud) + margin, start + CLIP_RATE * CLIP_SECONDS));

  const view = new DataView(new ArrayBuffer(clip.length * 2));
  const fade = Math.min(clip.length, margin); // ends softly, so it doesn't click
  for (let i = 0; i < clip.length; i++) {
    const gain = (0.9 / peak) * (i >= clip.length - fade ? (clip.length - i) / fade : 1);
    view.setInt16(i * 2, Math.round(clip[i] * gain * 32767), true);
  }
  return bytesToBase64(new Uint8Array(view.buffer));
}

// Asks for the mic and starts recording. Resolves once it is listening, with:
//   stop()  ends the recording early (it also ends by itself after a couple of seconds)
//   clip    a promise of the clip text, or null if the recording was silent
// Rejects if the mic is not allowed.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (event) => chunks.push(event.data);
  const clip = new Promise((resolve, reject) => {
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop()); // switches the mic indicator off
      try {
        const bytes = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
        resolve(toClip(await context().decodeAudioData(bytes)));
      } catch (error) {
        reject(error);
      }
    };
  });
  recorder.start();
  const timer = setTimeout(() => stop(), RECORD_SECONDS * 1000);
  function stop() {
    clearTimeout(timer);
    if (recorder.state === "recording") recorder.stop();
  }
  return { stop, clip };
}

const clipBuffers = new Map(); // clip text -> AudioBuffer at the speaker's own rate

function clipBuffer(sound) {
  let buffer = clipBuffers.get(sound);
  if (buffer) return buffer;

  const c = context();
  const bytes = Uint8Array.from(atob(sound), (char) => char.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = Float32Array.from({ length: bytes.length >> 1 }, (_, i) => view.getInt16(i * 2, true) / 32768);
  buffer = c.createBuffer(1, Math.max(1, Math.ceil(samples.length * c.sampleRate / CLIP_RATE)), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) { // stretch back up to the speaker's rate, blending neighbours
    const at = i * CLIP_RATE / c.sampleRate, j = Math.floor(at);
    const a = samples[j] ?? 0, b = samples[j + 1] ?? a;
    data[i] = a + (b - a) * (at - j);
  }
  clipBuffers.set(sound, buffer);
  return buffer;
}

export function playClip(sound, strength = 1) {
  let buffer;
  try {
    buffer = clipBuffer(sound);
  } catch {
    return; // a broken clip just stays quiet
  }
  const c = context();
  const source = c.createBufferSource(), gain = c.createGain();
  source.buffer = buffer;
  gain.gain.value = 0.5 + 0.5 * strength;
  source.connect(gain).connect(c.destination);
  source.start();
}

export function beep(frequency, seconds = 0.2) {
  const c = context(), t = c.currentTime;
  const osc = c.createOscillator(), gain = c.createGain();
  osc.type = "triangle";
  osc.frequency.value = frequency;
  fadeOut(gain, t, 0.3, seconds);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + seconds);
}
