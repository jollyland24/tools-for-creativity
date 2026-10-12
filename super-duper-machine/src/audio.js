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
