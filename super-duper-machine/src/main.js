import * as audio from "./audio.js";
import { SENSORS, ACTIONS, APPS, PRESETS, bodyMarkup, cleanUrl, isWebLink, linkLabel, appFor, sanitizeMachine } from "./machines.js";
import { shareLink, unpack } from "./share.js";
import { createPad } from "./draw.js";

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "super-duper-machine.machines";

const REASONS = {
  denied: "Permission was denied. Use Simulate instead.",
  unsupported: "This device has no such sensor. Open it on your phone, or use Simulate.",
};

let saved = loadSaved();

// ---------- saved machines ----------

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!Array.isArray(list)) return [];
    return list.filter(isValid).map(upgrade);
  } catch {
    return [];
  }
}

// Early saves differ from now: every machine had "Hello!" as its words, and a single 0..1
// "sensitivity" that scaled the sensor's first knob (Drop and Touch ignored it).
function upgrade({ sensitivity, ...m }) {
  if (m.action !== "text" && m.text === "Hello!") m.text = "";
  if (m.url) m.url = cleanUrl(m.url); // saved text is never trusted: only http(s) addresses survive
  if (sensitivity !== undefined && !m.params && m.sensor !== "drop" && m.sensor !== "touch") {
    const knob = SENSORS[m.sensor].params[0];
    const value = Math.round(knob.value * 2 ** (1 - 2 * sensitivity));
    m.params = { [knob.key]: Math.min(knob.max, Math.max(knob.min, value)) };
  }
  return m;
}

function isValid(m) {
  return m && typeof m.id === "string" && typeof m.name === "string"
    && SENSORS[m.sensor] && ACTIONS[m.action] && !ACTIONS[m.action].presetOnly;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch { /* private mode etc: machines just won't survive a reload */ }
}

// ---------- screens ----------

const makeScreen = $("make-screen");
const gridScreen = $("grid-screen");

function route() {
  disarm();
  if (location.hash.startsWith("#add=")) {
    receive(location.hash.slice("#add=".length));
    return;
  }
  const grid = location.hash === "#machines";
  makeScreen.hidden = grid;
  gridScreen.hidden = !grid;
  document.querySelector(".thumb.fresh")?.scrollIntoView({ block: "nearest" });
}

window.addEventListener("hashchange", route);
$("see-machines").addEventListener("click", () => { location.hash = "machines"; });

// ---------- screen 1: the boxes ----------

// What the user has picked so far. A box shows a tick once its part is set.
const draft = { sensor: null, action: null, text: "", url: "", params: {} }; // params: only the knobs that were moved
const pad = createPad($("pad"));

const BOXES = {
  motion: { dialog: $("dlg-motion"), done: () => draft.sensor !== null },
  sound: { dialog: $("dlg-sound"), done: () => draft.action !== null },
  type: { dialog: $("dlg-type"), done: () => draft.text !== "" || draft.url !== "" },
  customize: { dialog: $("dlg-customize"), done: () => pad.hasInk() },
};

const layers = Object.fromEntries(
  Object.keys(BOXES).map((key) => [key, document.querySelector(`.hit[data-box="${key}"]`).closest(".layer")]),
);

function fillOptions(root, name, entries, onPick) {
  root.replaceChildren(...entries.map(([value, title, detail]) => {
    const label = document.createElement("label");
    label.className = "option";
    const input = Object.assign(document.createElement("input"), { type: "radio", name, value });
    const text = document.createElement("span");
    text.textContent = title;
    const small = document.createElement("small");
    small.textContent = detail;
    text.append(small);
    label.append(input, text);
    return label;
  }));
  root.addEventListener("change", (event) => {
    onPick(event.target.value);
    refresh();
  });
}

fillOptions(
  $("sensor-options"),
  "sensor",
  Object.entries(SENSORS).map(([key, s]) => [key, s.name, `${s.label}: ${s.when}`]),
  (value) => { draft.sensor = value; draft.params = {}; }, // knobs belong to one sensor
);
fillOptions(
  $("action-options"),
  "action",
  Object.entries(ACTIONS).filter(([, a]) => !a.presetOnly).map(([key, a]) => [key, a.name, a.then]),
  (value) => { draft.action = value; },
);

$("e-text").addEventListener("input", (event) => {
  draft.text = event.target.value.trim();
  refresh();
});

// "Then open": nothing, one of the apps, or a link of your own
const OTHER = "other";
const openSelect = $("e-open");
openSelect.add(new Option("Nothing", ""));
for (const app of APPS) openSelect.add(new Option(app.name, app.url));
openSelect.add(new Option("A web link or other app…", OTHER));

function readOpen() {
  const own = openSelect.value === OTHER;
  $("e-url-row").hidden = !own;
  const typed = $("e-url").value.trim() !== "";
  draft.url = own ? cleanUrl($("e-url").value) : openSelect.value;
  $("e-url-hint").firstChild.textContent = own && typed && !draft.url ? "That isn't a web address or an app link." : "";
  refresh();
}
openSelect.addEventListener("change", readOpen);
$("e-url").addEventListener("input", readOpen);

// The sliders in the "slider" box depend on the sensor picked in the "motion" box.
function renderTune() {
  const sensor = draft.sensor && SENSORS[draft.sensor];
  $("tune-intro").textContent = sensor
    ? `Tuning ${sensor.name}. Drag the sliders to change how it reacts.`
    : "Pick a motion first, then you can tune it here.";
  $("tune-reset").hidden = !sensor;

  $("tune-rows").replaceChildren(...(sensor?.params ?? []).map((knob) => {
    const value = draft.params[knob.key] ?? knob.value;
    const id = `tune-${knob.key}`;

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = knob.label;
    const shown = document.createElement("output");
    shown.textContent = knob.show(value);
    label.append(shown);

    const input = Object.assign(document.createElement("input"), {
      id, type: "range", min: knob.min, max: knob.max, step: knob.step, value,
    });
    input.addEventListener("input", () => {
      draft.params[knob.key] = Number(input.value);
      shown.textContent = knob.show(Number(input.value));
      refresh();
    });

    const ends = document.createElement("p");
    ends.className = "scale";
    for (const word of [knob.low, knob.high]) {
      const small = document.createElement("small");
      small.textContent = word;
      ends.append(small);
    }

    const row = document.createElement("div");
    row.className = "tune";
    row.append(label, input, ends);
    return row;
  }));
}

$("tune-reset").addEventListener("click", () => {
  draft.params = {};
  renderTune();
  refresh();
});
$("e-clear").addEventListener("click", () => pad.clear());

document.querySelector(".cover-art").addEventListener("click", (event) => {
  const box = event.target.closest(".hit")?.dataset.box;
  if (!box) return;
  BOXES[box].dialog.showModal();
});
for (const { dialog } of Object.values(BOXES)) dialog.addEventListener("close", refresh); // the pad has no events of its own

function missingParts() {
  const missing = [];
  if (!draft.sensor) missing.push("motion");
  if (!draft.action) missing.push("sound");
  if (draft.action === "text" && !draft.text && !draft.url) missing.push("words or a link");
  return missing;
}

function refresh() {
  for (const [key, box] of Object.entries(BOXES)) layers[key].classList.toggle("done", box.done());

  const missing = missingParts();
  $("make-go").disabled = missing.length > 0;
  $("make-hint").textContent = missing.length === 0
    ? "Ready! Give it a name, then make it."
    : Object.values(BOXES).some((box) => box.done())
      ? `Still to set: ${missing.join(", ")}.`
      : "";
}

function resetDraft() {
  Object.assign(draft, { sensor: null, action: null, text: "", url: "", params: {} });
  for (const radio of document.querySelectorAll(".options input")) radio.checked = false;
  $("e-text").value = "";
  openSelect.value = "";
  $("e-url").value = "";
  $("e-url-row").hidden = true;
  $("e-url-hint").firstChild.textContent = "";
  $("make-name").value = "";
  pad.clear();
  refresh();
}

$("make-bar").addEventListener("submit", (event) => {
  event.preventDefault();
  if (missingParts().length) return;

  const machine = {
    id: Date.now().toString(36),
    name: $("make-name").value.trim() || "My machine",
    sensor: draft.sensor,
    action: draft.action,
    text: draft.text,
    url: draft.url,
    params: { ...draft.params },
    body: pad.path(),
  };
  saved.push(machine);
  persist();
  resetDraft();
  renderGrid(machine.id);
  location.hash = "machines";
});

// ---------- screen 2: the grid ----------

// Only one machine listens at a time, and only while its dialog is open.
let armed = null; // { machine, ui, stop }

const dialog = $("dlg-machine");
const ui = {
  body: $("m-body"),
  bubble: $("m-bubble"),
  status: $("m-status"),
  reading: $("m-reading"),
  start: $("m-start"),
  sayTimer: 0,
};
let current = null; // the machine shown in the dialog
let simSign = 1;

function renderGrid(freshId) {
  disarm();
  $("grid").replaceChildren(...[...PRESETS, ...saved].map((machine) => thumb(machine, machine.id === freshId)));
}

function thumb(machine, fresh) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = fresh ? "thumb fresh" : "thumb";
  button.title = machine.name;
  button.setAttribute("aria-label", machine.name);
  button.innerHTML = bodyMarkup(machine);
  button.addEventListener("click", () => openMachine(machine));
  li.append(button);
  return li;
}

// "Flick → Drum hit · says “boom” · opens example.com"
function describe(machine) {
  return [
    `${SENSORS[machine.sensor].name} → ${ACTIONS[machine.action].name}`,
    machine.text && `says “${machine.text}”`,
    machine.url && `opens ${linkLabel(machine.url)}`,
  ].filter(Boolean).join(" · ");
}

// what each box of the stack was set to, in the same order as the stack
function setupRows(machine) {
  const sensor = SENSORS[machine.sensor];
  const action = ACTIONS[machine.action];
  const tuned = machine.params ?? {};
  return [
    ["Motion", `${sensor.name}: ${sensor.when}`],
    ["Sound", `${action.name}: ${action.then}`],
    ["Words", machine.text || machine.url
      ? [machine.text && `“${machine.text}”`, machine.url && `opens ${appFor(machine.url)?.name ?? machine.url}`].filter(Boolean)
      : "none"],
    ["Slider", sensor.params.map((knob) => (
      `${knob.label}: ${knob.show(tuned[knob.key] ?? knob.value)}${knob.key in tuned ? "" : " (default)"}`
    ))],
    ["Look", machine.markup ? "a ready-made drawing" : machine.body ? "drawn by hand" : "the plain blob"],
  ];
}

function openMachine(machine) {
  current = machine;
  const sensor = SENSORS[machine.sensor];
  const action = ACTIONS[machine.action];

  $("m-art").innerHTML = bodyMarkup(machine);
  ui.body.className = "body";
  ui.body.setAttribute("aria-label", machine.name);
  ui.bubble.hidden = true;
  $("m-name").textContent = machine.name;
  $("m-detail").firstChild.textContent = describe(machine);
  ui.status.textContent = sensor.help;
  ui.reading.hidden = true;
  ui.start.textContent = "Start";
  ui.start.disabled = false;
  $("m-delete").hidden = !saved.includes(machine);
  prepareShare(machine);

  $("m-setup").open = false;
  $("m-setup-list").replaceChildren(...setupRows(machine).flatMap(([name, value]) => {
    const term = document.createElement("dt");
    term.textContent = name;
    const detail = document.createElement("dd");
    detail.append(...[value].flat().map((line) => Object.assign(document.createElement("div"), { textContent: line })));
    return [term, detail];
  }));

  dialog.showModal();
}

// Only machines you made can be shared. The link is built ahead of the tap, because phones only
// allow the share sheet straight after a tap.
let link = null;

function prepareShare(machine) {
  link = null;
  const mine = saved.includes(machine);
  $("m-share").hidden = !mine;
  $("m-share").disabled = true;
  if (!mine) return;
  shareLink(machine).then((url) => {
    if (current !== machine) return;
    link = url;
    $("m-share").disabled = false;
  });
}

$("m-share").addEventListener("click", async () => {
  if (!link) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: current.name, text: `Try my machine “${current.name}” on Super Duper Machine`, url: link });
      return;
    } catch (error) {
      if (error.name === "AbortError") return; // they closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    ui.status.textContent = "Link copied. Send it to someone.";
  } catch {
    // no clipboard: show it so it can be copied by hand
    const field = Object.assign(document.createElement("input"), { readOnly: true, value: link });
    ui.status.replaceChildren(field);
    field.select();
  }
});

ui.start.addEventListener("click", () => {
  if (armed) {
    disarm();
    ui.status.textContent = "Stopped.";
  } else {
    arm(current, ui);
  }
});

$("m-sim").addEventListener("click", () => {
  audio.unlock();
  simSign = -simSign;
  fire(current, ui, { strength: 0.8, sign: simSign, position: Math.random() });
});

$("m-delete").addEventListener("click", () => {
  saved = saved.filter((m) => m !== current);
  persist();
  dialog.close();
  renderGrid();
});

$("m-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", disarm);
dialog.addEventListener("click", (event) => { // a tap on the dimmed page behind it
  if (event.target !== dialog) return; // a keyboard press on a button has no position, so never judge those
  const box = dialog.getBoundingClientRect();
  const inside = event.clientX >= box.left && event.clientX <= box.right
    && event.clientY >= box.top && event.clientY <= box.bottom;
  if (!inside) dialog.close();
});

ui.body.addEventListener("animationend", (event) => {
  if (event.animationName === "fall") ui.status.textContent = "It dropped!";
});

async function arm(machine, ui) {
  disarm();
  audio.unlock(); // must happen inside the tap
  const mine = { machine, ui, stop: null };
  armed = mine; // claim it now, so closing the dialog while we wait cancels this one
  ui.start.disabled = true;

  let stop;
  let gotReading = false;
  try {
    stop = await SENSORS[machine.sensor].start({
      onTrigger: (payload) => fire(machine, ui, payload),
      onSample: (value) => {
        gotReading = true;
        ui.reading.textContent = `Reading: ${value.toFixed(0)}`;
      },
      el: ui.body,
      params: machine.params,
    });
  } catch (error) {
    if (armed === mine) armed = null;
    ui.start.disabled = false;
    ui.status.textContent = REASONS[error.message] ?? "Couldn't start this sensor. Use Simulate instead.";
    return;
  }

  ui.start.disabled = false;
  if (armed !== mine) { stop(); return; } // picked another machine while waiting
  mine.stop = stop;
  ui.start.textContent = "Stop";
  ui.reading.hidden = false;
  ui.status.textContent = SENSORS[machine.sensor].armed;

  // desktop browsers expose the motion API but never send readings
  if (machine.sensor !== "touch") {
    setTimeout(() => {
      if (!gotReading && armed === mine) {
        ui.status.textContent = "No sensor readings yet. Are you on a phone? Otherwise use Simulate.";
      }
    }, 1500);
  }
}

function disarm() {
  if (!armed) return;
  const { ui, stop } = armed;
  armed = null;
  stop?.();
  ui.start.disabled = false;
  ui.start.textContent = "Start";
  ui.reading.hidden = true;
}

// ---------- what happens when the sensor fires ----------

function restart(el, className) {
  el.classList.remove(className);
  void el.offsetWidth; // restart the animation
  el.classList.add(className);
}

function say(ui, text) {
  ui.bubble.textContent = text;
  ui.bubble.hidden = false;
  clearTimeout(ui.sayTimer);
  ui.sayTimer = setTimeout(() => { ui.bubble.hidden = true; }, 1400);
}

function fire(machine, ui, { strength, position }) {
  switch (machine.action) {
    case "fall":
      restart(ui.body, "fallen");
      break;
    case "drum":
      audio.drumHit(strength);
      restart(ui.body, "bump");
      break;
    case "beep":
      audio.beep(220 + 660 * position);
      restart(ui.body, "bump");
      break;
    case "vibrate":
      navigator.vibrate?.(80);
      restart(ui.body, "bump");
      break;
    case "text":
      restart(ui.body, "bump");
      break;
  }
  const words = machine.text || (machine.action === "text" && !machine.url ? "Hello!" : "");
  if (words) say(ui, words);
  if (machine.url) openLink(machine.url, ui);
}

// A tab or app opened without a tap is often blocked (phones especially), and we can't tell
// whether it worked, so for those leave a link to tap.
function openLink(url, ui) {
  const web = isWebLink(url);
  if (web) {
    const tab = window.open(url, "_blank");
    if (tab) {
      tab.opener = null;
      return;
    }
  } else {
    location.href = url; // an app link: the page stays here while the app opens
  }

  const link = Object.assign(document.createElement("a"), {
    href: url,
    textContent: `Tap to open ${linkLabel(url)}`,
  });
  if (web) Object.assign(link, { target: "_blank", rel: "noopener" });
  ui.status.replaceChildren(link);
}

// ---------- receiving a shared machine ----------

const incoming = $("dlg-import");
let offered = null;

async function receive(code) {
  history.replaceState(null, "", "#machines"); // so a reload doesn't ask again
  route();

  offered = sanitizeMachine(await unpack(code));
  $("i-body").innerHTML = offered ? bodyMarkup(offered) : "";
  $("i-name").textContent = offered ? offered.name : "That link doesn't work";
  $("i-detail").firstChild.textContent = offered ? describe(offered) : "";
  $("i-note").textContent = offered
    ? "Nothing runs until you start it yourself."
    : "It may be cut off or from something else. Ask them to send it again.";
  $("i-yes").hidden = !offered;
  $("i-no").textContent = offered ? "No thanks" : "OK";
  incoming.showModal();
}

$("i-yes").addEventListener("click", () => {
  saved.push(offered);
  persist();
  renderGrid(offered.id);
  incoming.close();
  document.querySelector(".thumb.fresh")?.scrollIntoView({ block: "nearest" });
});
$("i-no").addEventListener("click", () => incoming.close());

// ---------- go ----------

renderGrid();
refresh();
route();
