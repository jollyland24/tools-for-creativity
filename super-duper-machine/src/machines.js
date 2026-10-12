// A machine = a body + a sensor + an action. This file is the data; main.js runs it.

import * as sensors from "./sensors.js";

export const SENSORS = {
  drop: {
    name: "Drop",
    label: "Acceleration",
    when: "falls, then hits something",
    help: "Hold your phone at least 1 meter above a soft surface (a bed or a cushion), press Start, then let go.",
    armed: "Armed. Drop your phone now!",
    start: sensors.drop,
  },
  flick: {
    name: "Flick",
    label: "Acceleration",
    when: "is flicked",
    help: "Press Start, then flick your phone like a drumstick.",
    armed: "Armed. Flick your phone!",
    start: sensors.flick,
  },
  tilt: {
    name: "Tilt",
    label: "Orientation",
    when: "tips left or right",
    help: "Press Start, then tip your phone left and right.",
    armed: "Armed. Tip your phone!",
    start: sensors.tilt,
  },
  mic: {
    name: "Loud sound",
    label: "Mic level",
    when: "hears a loud sound",
    help: "Press Start, then clap or say something loud.",
    armed: "Armed. Make some noise!",
    start: sensors.mic,
  },
  touch: {
    name: "Touch",
    label: "Touch",
    when: "is tapped",
    help: "Press Start, then tap the machine.",
    armed: "Armed. Tap the machine!",
    start: sensors.touch,
  },
};

// presetOnly actions only make sense with a preset's own scenery (the tree)
export const ACTIONS = {
  fall: { name: "Fall", then: "falls from the tree", presetOnly: true },
  drum: { name: "Drum hit", then: "plays a drum" },
  beep: { name: "Note", then: "plays a note (higher = more)" },
  text: { name: "Say something", then: "says something" },
  vibrate: { name: "Vibrate", then: "buzzes (Android only)" },
};

// Bodies are SVG drawn in a 0..100 box.
const CIRCLE = '<path d="M50 6 C76 4 96 26 94 52 C92 78 70 96 46 94 C22 92 5 72 7 48 C9 24 28 8 50 6Z"/>';

export const PRESETS = [
  {
    id: "apple",
    name: "Apple drop",
    sensor: "drop",
    action: "fall",
    slot: "tree",
    markup: CIRCLE + '<path d="M50 8 C50 2 52 -4 58 -8"/><path d="M54 4 C64 -6 78 -4 80 2 C72 8 60 8 54 4Z"/>',
  },
  {
    id: "drum",
    name: "Drum",
    sensor: "flick",
    action: "drum",
    slot: "ground",
    // shell first, then the skin on top of it, tuning rods, and two sticks crossing over
    markup:
      '<path d="M10 40 L10 76 C10 87 30 94 50 94 C70 94 90 87 90 76 L90 40"/>' +
      '<ellipse cx="50" cy="40" rx="40" ry="14"/>' +
      '<path d="M18 50 L28 84 L38 54 L48 88 L58 54 L68 84 L78 50"/>' +
      '<path d="M16 -4 L46 32 M84 -4 L54 32"/>' +
      '<circle cx="16" cy="-4" r="4"/><circle cx="84" cy="-4" r="4"/>',
  },
  {
    id: "tilt-tune",
    name: "Tilt tune",
    sensor: "tilt",
    action: "beep",
    slot: "ground",
    markup: CIRCLE + '<path d="M20 52 Q32 34 44 52 T68 52 T90 52"/>',
  },
];

const BOX = (inner) => `<svg viewBox="-5 -12 110 117" aria-hidden="true">${inner}</svg>`;
const SAFE_PATH = /^[ML0-9 .\-]+$/; // saved drawings only ever contain these characters

export function bodyMarkup(machine) {
  if (machine.markup) return BOX(machine.markup);
  const d = machine.body;
  return BOX(d && SAFE_PATH.test(d) ? `<path d="${d}"/>` : CIRCLE);
}
