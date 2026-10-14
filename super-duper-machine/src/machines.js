// A machine = a body + a sensor + an action. This file is the data; main.js runs it.

import * as sensors from "./sensors.js";
import { MAX_CLIP_CHARS } from "./audio.js";

export const SENSORS = {
  drop: {
    name: "Drop",
    label: "Acceleration",
    when: "falls, then hits something",
    help: "Hold your phone at least 1 meter above a soft surface (a bed or a cushion), press Start, then let go.",
    armed: "Armed. Drop your phone now!",
    start: sensors.drop,
    params: sensors.PARAMS.drop,
  },
  flick: {
    name: "Flick",
    label: "Acceleration",
    when: "is flicked",
    help: "Press Start, then flick your phone like a drumstick.",
    armed: "Armed. Flick your phone!",
    start: sensors.flick,
    params: sensors.PARAMS.flick,
  },
  tilt: {
    name: "Tilt",
    label: "Orientation",
    when: "tips left or right",
    help: "Press Start, then tip your phone left and right.",
    armed: "Armed. Tip your phone!",
    start: sensors.tilt,
    params: sensors.PARAMS.tilt,
  },
  mic: {
    name: "Loud sound",
    label: "Mic level",
    when: "hears a loud sound",
    help: "Press Start, then clap or say something loud.",
    armed: "Armed. Make some noise!",
    start: sensors.mic,
    params: sensors.PARAMS.mic,
  },
  camera: {
    name: "Camera",
    label: "Camera",
    when: "sees something move",
    help: "Press Start, then wave your hand in front of the front camera.",
    armed: "Armed. Wave at the camera!",
    start: sensors.camera,
    params: sensors.PARAMS.camera,
  },
  touch: {
    name: "Touch",
    label: "Touch",
    when: "is tapped",
    help: "Press Start, then tap the machine.",
    armed: "Armed. Tap the machine!",
    start: sensors.touch,
    params: sensors.PARAMS.touch,
  },
};

// presetOnly actions are animations of the preset's own picture, so they can't be picked
export const ACTIONS = {
  fall: { name: "Fall", then: "falls down", presetOnly: true },
  drum: { name: "Drum hit", then: "plays a drum" },
  recording: { name: "Your own sound", then: "plays the sound you recorded" },
  beep: { name: "Note", then: "plays a note (higher = more)" },
  vibrate: { name: "Vibrate", then: "buzzes (Android only)" },
  text: { name: "No sound", then: "stays quiet (its words and link still happen)" },
};

// What a machine may open: a web address, or a link that launches an app on the phone.
//   example.com            -> https://example.com
//   tel:… sms:… mailto:…   -> the phone, messages, mail
//   whatsapp://send?text=… -> any app that has such a deep link (anything with "://")
// These schemes could run code in the page or read files, so they never get through.
const APP_SCHEMES = ["mailto", "tel", "sms", "facetime", "facetime-audio"];
const BLOCKED_SCHEMES = ["javascript", "data", "vbscript", "file", "blob", "about", "view-source", "ws", "wss", "ftp"];

// A recorded sound is only base64 text of limited length (see audio.js). Returns it, or "" if it isn't one.
export function cleanSound(raw) {
  return typeof raw === "string" && raw.length <= MAX_CLIP_CHARS && /^[A-Za-z0-9+/]+={0,2}$/.test(raw) ? raw : "";
}

// Returns the cleaned link, or "" if it isn't something we will open.
export function cleanUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text)?.[1].toLowerCase();
  const named = text.includes("://") || APP_SCHEMES.includes(scheme);
  try {
    const url = new URL(scheme && named ? text : `https://${text}`);
    const kind = url.protocol.slice(0, -1);
    const ok = kind === "http" || kind === "https" || APP_SCHEMES.includes(kind)
      || (text.includes("://") && !BLOCKED_SCHEMES.includes(kind));
    return ok ? url.href : "";
  } catch {
    return "";
  }
}

export const isWebLink = (url) => /^https?:/i.test(url);

// Apps you can pick by name. Each is the link that app answers to on a phone.
export const APPS = [
  { name: "Instagram", url: "instagram://app" },
  { name: "WhatsApp", url: "whatsapp://" },
  { name: "Spotify", url: "spotify://" },
  { name: "TikTok", url: "tiktok://" },
  { name: "Snapchat", url: "snapchat://" },
  { name: "Telegram", url: "tg://" },
  { name: "Messages", url: "sms:" },
  { name: "Mail", url: "mailto:" },
];

// the app from the list that a link opens, if it is one of them
export const appFor = (url) => APPS.find((app) => new URL(app.url).protocol === new URL(url).protocol);

// short name of a link, for the dialog
export function linkLabel(url) {
  if (isWebLink(url)) return new URL(url).hostname;
  return appFor(url)?.name ?? new URL(url).protocol;
}

// Bodies are SVG drawn in a 0..100 box.
const CIRCLE = '<path d="M50 6 C76 4 96 26 94 52 C92 78 70 96 46 94 C22 92 5 72 7 48 C9 24 28 8 50 6Z"/>';

export const PRESETS = [
  {
    id: "apple",
    name: "Apple drop",
    sensor: "drop",
    action: "fall",
    markup: CIRCLE + '<path d="M50 8 C50 2 52 -4 58 -8"/><path d="M54 4 C64 -6 78 -4 80 2 C72 8 60 8 54 4Z"/>',
  },
  {
    id: "drum",
    name: "Drum",
    sensor: "flick",
    action: "drum",
    // shell first, then the skin on top of it, tuning rods, and two sticks crossing over
    markup:
      '<path d="M10 40 L10 76 C10 87 30 94 50 94 C70 94 90 87 90 76 L90 40"/>' +
      '<ellipse cx="50" cy="40" rx="40" ry="14"/>' +
      '<path d="M18 50 L28 84 L38 54 L48 88 L58 54 L68 84 L78 50"/>' +
      '<path d="M16 -4 L46 32 M84 -4 L54 32"/>' +
      '<circle cx="16" cy="-4" r="4"/><circle cx="84" cy="-4" r="4"/>',
  },
];

// Turns a machine from outside (a shared link) into one we trust: known sensor and action,
// words and name cut to length, a safe link, knobs inside their ranges, a body that is only
// drawing commands. Returns null if there is no machine in it.
export function sanitizeMachine(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sensor = SENSORS[raw.sensor] && raw.sensor;
  const action = ACTIONS[raw.action] && !ACTIONS[raw.action].presetOnly && raw.action;
  if (!sensor || !action) return null;

  const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 30) : "";
  const url = cleanUrl(typeof raw.url === "string" ? raw.url : "");
  if (action === "text" && !text && !url) return null; // it would do nothing at all
  const sound = action === "recording" ? cleanSound(raw.sound) : "";
  if (action === "recording" && !sound) return null; // nothing to play

  const params = {};
  for (const knob of SENSORS[sensor].params) {
    const value = raw.params?.[knob.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      params[knob.key] = Math.min(knob.max, Math.max(knob.min, value));
    }
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: (typeof raw.name === "string" && raw.name.trim().slice(0, 24)) || "Shared machine",
    sensor,
    action,
    text,
    url,
    sound,
    params,
    body: typeof raw.body === "string" && raw.body.length <= 20_000 && SAFE_PATH.test(raw.body) ? raw.body : null,
  };
}

const BOX = (inner) => `<svg viewBox="-5 -12 110 117" aria-hidden="true">${inner}</svg>`;
const SAFE_PATH = /^[ML0-9 .\-]+$/; // saved drawings only ever contain these characters

export function bodyMarkup(machine) {
  if (machine.markup) return BOX(machine.markup);
  const d = machine.body;
  return BOX(d && SAFE_PATH.test(d) ? `<path d="${d}"/>` : CIRCLE);
}
