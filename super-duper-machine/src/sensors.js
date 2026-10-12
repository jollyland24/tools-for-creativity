// Every sensor has the same shape: start({ onTrigger, onSample, el }) resolves to a stop() function.
//   onTrigger({ strength, sign, position }) -> strength 0..1, sign -1/+1, position 0..1
//   onSample(number)                        -> live reading for the on-screen readout
// It rejects with Error("denied") or Error("unsupported") so the UI can explain why.

import * as dropDetector from "./drop-detector.js";

// Tuning knobs for playtests
const FLICK_MIN = 15;         // m/s² of movement (gravity removed) that counts as a flick
const FLICK_COOLDOWN_MS = 180;
const TILT_STEP = 15;         // degrees: a new note every time the phone crosses this step
const MIC_MIN = 0.12;         // RMS loudness 0..1
const MIC_COOLDOWN_MS = 400;  // also stops a speaker from re-triggering the mic

async function needMotion() {
  if (!dropDetector.isSupported()) throw new Error("unsupported");
  if (!(await dropDetector.requestPermission())) throw new Error("denied");
}

export async function drop({ onTrigger, onSample }) {
  await needMotion();
  dropDetector.start({
    onSample,
    onDrop: () => onTrigger({ strength: 1, sign: 1, position: 0.5 }),
  });
  return dropDetector.stop;
}

export async function flick({ onTrigger, onSample }) {
  await needMotion();
  let last = 0;

  const handler = (event) => {
    let size, sign;
    const a = event.acceleration;
    if (a && a.x != null) {
      size = Math.hypot(a.x, a.y, a.z);
      sign = Math.sign(a.x) || 1;
    } else {
      // some browsers only give gravity-included values: subtract 1 g
      const g = event.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      size = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
      sign = Math.sign(g.x) || 1;
    }
    onSample?.(size);

    const now = performance.now();
    if (size > FLICK_MIN && now - last > FLICK_COOLDOWN_MS) {
      last = now;
      const strength = Math.min(1, size / 40);
      onTrigger({ strength, sign, position: strength });
    }
  };

  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

export async function tilt({ onTrigger, onSample }) {
  if (!("DeviceOrientationEvent" in window)) throw new Error("unsupported");
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
  }

  let lastStep = 0;
  const handler = (event) => {
    const g = event.gamma; // left/right tilt, -90..90
    if (g == null) return;
    onSample?.(g);

    const step = Math.round(g / TILT_STEP);
    if (step === lastStep) return;
    lastStep = step;
    if (step !== 0) {
      onTrigger({ strength: Math.min(1, Math.abs(g) / 90), sign: Math.sign(g), position: (g + 90) / 180 });
    }
  };

  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}

export async function mic({ onTrigger, onSample }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error("denied");
  }

  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);

  const samples = new Float32Array(analyser.fftSize);
  let frame, last = 0;

  const loop = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const level = Math.sqrt(sum / samples.length);
    onSample?.(level * 100);

    const now = performance.now();
    if (level > MIC_MIN && now - last > MIC_COOLDOWN_MS) {
      last = now;
      const strength = Math.min(1, level * 3);
      onTrigger({ strength, sign: 1, position: strength });
    }
    frame = requestAnimationFrame(loop);
  };
  loop();

  return () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    ctx.close();
  };
}

export async function touch({ onTrigger, el }) {
  const handler = (event) => {
    const box = el.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    onTrigger({ strength: 1, sign: event.clientX < box.left + box.width / 2 ? -1 : 1, position });
  };
  el.addEventListener("pointerdown", handler);
  return () => el.removeEventListener("pointerdown", handler);
}
