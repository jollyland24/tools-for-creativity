// Every sensor has the same shape: start({ onTrigger, onSample, el, params }) resolves to a stop() function.
//   onTrigger({ strength, sign, position }) -> strength 0..1, sign -1/+1, position 0..1
//   onSample(number)                        -> live reading for the on-screen readout
// It rejects with Error("denied") or Error("unsupported") so the UI can explain why.

import * as dropDetector from "./drop-detector.js";

const CAMERA_FRAME_MS = 66;   // look at ~15 frames a second
const CAMERA_W = 32;          // frames are shrunk to this many pixels: movement, not detail
const CAMERA_H = 24;

// What a machine maker can tune per sensor. `value` is the default, `low` and `high` say what the
// two ends of the slider feel like, and `show` makes the number readable.
const ms = (v) => `${v} ms`;
export const PARAMS = {
  drop: [
    { key: "height", label: "Shortest fall that counts", min: 10, max: 100, step: 5, value: 20,
      low: "A small hop", high: "A big drop", show: (v) => `${v} cm` },
    { key: "impact", label: "How hard it must land", min: 12, max: 40, step: 1, value: 25,
      low: "A soft landing", high: "A hard thud", show: (v) => `${v} m/s²` },
  ],
  flick: [
    { key: "strength", label: "How hard the flick", min: 6, max: 35, step: 1, value: 15,
      low: "A light flick", high: "A hard whack", show: (v) => `${v} m/s²` },
    { key: "pause", label: "Pause between hits", min: 60, max: 600, step: 20, value: 180,
      low: "Rapid fire", high: "One at a time", show: ms },
  ],
  tilt: [
    { key: "step", label: "A new note every", min: 5, max: 45, step: 1, value: 15,
      low: "Lots of small steps", high: "A few big steps", show: (v) => `${v}°` },
  ],
  mic: [
    { key: "loudness", label: "How loud it must be", min: 3, max: 40, step: 1, value: 12,
      low: "A whisper", high: "A shout", show: (v) => `${v}%` },
    { key: "pause", label: "Pause between sounds", min: 150, max: 1000, step: 50, value: 400, // also stops a speaker re-triggering the mic
      low: "Rapid fire", high: "One at a time", show: ms },
  ],
  camera: [
    { key: "movement", label: "How much has to move", min: 2, max: 25, step: 1, value: 8, // average brightness change per pixel
      low: "A tiny twitch", high: "A big wave", show: (v) => `level ${v}` },
    { key: "pause", label: "Pause between waves", min: 100, max: 1000, step: 50, value: 300,
      low: "Rapid fire", high: "One at a time", show: ms },
  ],
  touch: [
    { key: "pause", label: "Ignore quick repeat taps", min: 0, max: 600, step: 20, value: 0,
      low: "Every tap counts", high: "Slow it down", show: ms },
  ],
};

// the knobs of one machine: what it was tuned to, or the default
export function knobs(sensor, params = {}) {
  return Object.fromEntries(PARAMS[sensor].map((p) => [p.key, params[p.key] ?? p.value]));
}

async function needMotion() {
  if (!dropDetector.isSupported()) throw new Error("unsupported");
  if (!(await dropDetector.requestPermission())) throw new Error("denied");
}

export async function drop({ onTrigger, onSample, params }) {
  await needMotion();
  const k = knobs("drop", params);
  dropDetector.start({
    onSample,
    freefallMinMs: Math.sqrt((2 * k.height) / 100 / 9.81) * 1000, // s = ½ g t², so how long that fall takes
    impactMin: k.impact,
    onDrop: () => onTrigger({ strength: 1, sign: 1, position: 0.5 }),
  });
  return dropDetector.stop;
}

export async function flick({ onTrigger, onSample, params }) {
  await needMotion();
  const k = knobs("flick", params);
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
    if (size > k.strength && now - last > k.pause) {
      last = now;
      const strength = Math.min(1, size / 40);
      onTrigger({ strength, sign, position: strength });
    }
  };

  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

export async function tilt({ onTrigger, onSample, params }) {
  if (!("DeviceOrientationEvent" in window)) throw new Error("unsupported");
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    if ((await DeviceOrientationEvent.requestPermission()) !== "granted") throw new Error("denied");
  }

  const stepSize = knobs("tilt", params).step;
  let lastStep = 0;
  const handler = (event) => {
    const g = event.gamma; // left/right tilt, -90..90
    if (g == null) return;
    onSample?.(g);

    const step = Math.round(g / stepSize);
    if (step === lastStep) return;
    lastStep = step;
    if (step !== 0) {
      onTrigger({ strength: Math.min(1, Math.abs(g) / 90), sign: Math.sign(g), position: (g + 90) / 180 });
    }
  };

  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}

export async function mic({ onTrigger, onSample, params }) {
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

  const k = knobs("mic", params);
  const samples = new Float32Array(analyser.fftSize);
  let frame, last = 0;

  const loop = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const level = Math.sqrt(sum / samples.length);
    onSample?.(level * 100);

    const now = performance.now();
    if (level > k.loudness / 100 && now - last > k.pause) {
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

export async function touch({ onTrigger, el, params }) {
  const k = knobs("touch", params);
  let last = 0;
  const handler = (event) => {
    const now = performance.now();
    if (now - last < k.pause) return;
    last = now;
    const box = el.getBoundingClientRect();
    const position = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    onTrigger({ strength: 1, sign: event.clientX < box.left + box.width / 2 ? -1 : 1, position });
  };
  el.addEventListener("pointerdown", handler);
  return () => el.removeEventListener("pointerdown", handler);
}

// Watches the front camera and goes off when enough of the picture changes (a wave, a hand passing by).
export async function camera({ onTrigger, onSample, params }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
  } catch {
    throw new Error("denied");
  }

  // iOS only plays a video that is in the page; it is never seen
  const video = Object.assign(document.createElement("video"), { srcObject: stream, muted: true, playsInline: true });
  video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
  document.body.append(video);
  await video.play().catch(() => {});

  const g = Object.assign(document.createElement("canvas"), { width: CAMERA_W, height: CAMERA_H })
    .getContext("2d", { willReadFrequently: true });
  const k = knobs("camera", params);
  let previous = null;
  let frame, lastLook = 0, lastTrigger = 0;

  const loop = (now) => {
    frame = requestAnimationFrame(loop);
    if (now - lastLook < CAMERA_FRAME_MS || video.readyState < 2) return;
    lastLook = now;

    g.drawImage(video, 0, 0, CAMERA_W, CAMERA_H);
    const pixels = g.getImageData(0, 0, CAMERA_W, CAMERA_H).data;
    const gray = new Uint8Array(CAMERA_W * CAMERA_H);
    for (let i = 0; i < gray.length; i++) {
      gray[i] = pixels[i * 4] * 0.3 + pixels[i * 4 + 1] * 0.59 + pixels[i * 4 + 2] * 0.11;
    }

    if (previous) {
      let total = 0, weightedX = 0;
      for (let i = 0; i < gray.length; i++) {
        const change = Math.abs(gray[i] - previous[i]);
        total += change;
        weightedX += change * (i % CAMERA_W);
      }
      const level = total / gray.length;
      onSample?.(level);

      if (level > k.movement && now - lastTrigger > k.pause) {
        lastTrigger = now;
        // the front camera is a mirror, so flip: moving your hand right moves it right on screen
        const position = 1 - weightedX / total / (CAMERA_W - 1);
        onTrigger({ strength: Math.min(1, level / 40), sign: position < 0.5 ? -1 : 1, position });
      }
    }
    previous = gray;
  };
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((track) => track.stop());
    video.remove();
  };
}
