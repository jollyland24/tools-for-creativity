import * as audio from "./audio.js";
import { SENSORS, ACTIONS, PRESETS, bodyMarkup } from "./machines.js";
import { renderBlocks, flash } from "./blocks.js";
import { createPad } from "./draw.js";

const $ = (id) => document.getElementById(id);

const stage = $("stage");
const machineEl = $("machine");
const blocks = $("blocks");
const status = $("status");
const readout = $("readout");
const reading = $("reading");
const startButton = $("start");
const bubble = $("bubble");
const drawer = $("drawer");
const toggle = $("menu-toggle");
const builder = $("builder");

const STORAGE_KEY = "super-duper-machine.machines";
const GROUND_GAP = 0.04; // keep in sync with .on-ground { bottom } in style.css

const REASONS = {
  denied: "Permission was denied. Use Simulate instead.",
  unsupported: "This device has no such sensor. Open it on your phone, or use Simulate.",
};

let saved = loadSaved();
let active = null;
let stopSensor = null;
let simSign = 1;
let nudged = false;

// ---------- saved machines ----------

function loadSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(list) ? list.filter(isValid) : [];
  } catch {
    return [];
  }
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

// ---------- the active machine ----------

function selectMachine(machine) {
  disarm();
  active = machine;

  machineEl.classList.remove("fallen");
  machineEl.classList.toggle("in-tree", machine.slot === "tree");
  machineEl.classList.toggle("on-ground", machine.slot !== "tree");
  machineEl.innerHTML = bodyMarkup(machine);
  bump();

  $("machine-name").textContent = machine.name;
  $("help").textContent = SENSORS[machine.sensor].help;
  status.textContent = "Press Start.";
  renderBlocks(blocks, machine);
}

async function arm() {
  const machine = active;
  audio.unlock(); // must happen inside the tap
  machineEl.classList.remove("fallen");
  startButton.disabled = true;

  let stop;
  let gotReading = false;
  try {
    stop = await SENSORS[machine.sensor].start({
      onTrigger: fire,
      onSample: (value) => {
        gotReading = true;
        reading.textContent = value.toFixed(0);
      },
      el: machineEl,
    });
  } catch (error) {
    startButton.disabled = false;
    status.textContent = REASONS[error.message] ?? "Couldn't start this sensor. Use Simulate instead.";
    return;
  }

  startButton.disabled = false;
  if (machine !== active) { stop(); return; } // picked another machine while waiting
  stopSensor = stop;
  startButton.textContent = "Stop";
  readout.hidden = false;
  status.textContent = SENSORS[machine.sensor].armed;

  // desktop browsers expose the motion API but never send readings
  if (machine.sensor !== "touch") {
    setTimeout(() => {
      if (!gotReading && machine === active && stopSensor) {
        status.textContent = "No sensor readings yet. Are you on a phone? Otherwise use Simulate.";
      }
    }, 1500);
  }
}

function disarm() {
  stopSensor?.();
  stopSensor = null;
  startButton.textContent = "Start";
  readout.hidden = true;
}

startButton.addEventListener("click", () => {
  if (stopSensor) {
    disarm();
    status.textContent = "Stopped.";
  } else {
    arm();
  }
});

$("simulate").addEventListener("click", () => {
  audio.unlock();
  simSign = -simSign;
  fire({ strength: 0.8, sign: simSign, position: Math.random() });
});

// ---------- what happens when the sensor fires ----------

function fire(payload) {
  flash(blocks);
  run(active, payload);
}

function bump() {
  machineEl.classList.remove("bump");
  void machineEl.offsetWidth; // restart the animation
  machineEl.classList.add("bump");
}

function say(text) {
  bubble.textContent = text;
  bubble.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { bubble.hidden = true; }, 1400);
}

function run(machine, { strength, position }) {
  switch (machine.action) {
    case "fall": {
      machineEl.classList.remove("fallen");
      void machineEl.offsetWidth;
      const distance = stage.clientHeight * (1 - GROUND_GAP) - machineEl.offsetTop - machineEl.offsetHeight;
      machineEl.style.setProperty("--fall", `${Math.max(0, distance)}px`);
      machineEl.classList.add("fallen");
      break;
    }
    case "drum":
      audio.drumHit(strength);
      bump();
      break;
    case "beep":
      audio.beep(220 + 660 * position);
      bump();
      break;
    case "text":
      say(machine.text || "Hello!");
      bump();
      break;
    case "vibrate":
      navigator.vibrate?.(80);
      bump();
      break;
  }
}

// after the first drop, point people at the part where they make their own
machineEl.addEventListener("animationend", (event) => {
  if (event.animationName !== "fall") return;
  status.textContent = "It dropped! Try another machine, or make your own.";
  if (!nudged) {
    nudged = true;
    setTimeout(() => setDrawer(true), 900); // let the landing be seen first
  }
});

// ---------- drawer ----------

function setDrawer(open) {
  drawer.classList.toggle("open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "✕ Close" : "☰ Machines";
}

toggle.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));

function renderList(list, machines, deletable) {
  list.replaceChildren(...machines.map((machine) => {
    const item = document.createElement("li");

    const pick = document.createElement("button");
    pick.className = "pick";
    pick.textContent = machine.name;
    const detail = document.createElement("small");
    detail.textContent = `${SENSORS[machine.sensor].name} → ${ACTIONS[machine.action].name}`;
    pick.append(detail);
    pick.addEventListener("click", () => {
      selectMachine(machine);
      setDrawer(false);
    });
    item.append(pick);

    if (deletable) {
      const remove = document.createElement("button");
      remove.className = "remove";
      remove.textContent = "✕";
      remove.setAttribute("aria-label", `Delete ${machine.name}`);
      remove.addEventListener("click", () => {
        saved = saved.filter((m) => m !== machine);
        persist();
        renderDrawer();
        if (active === machine) selectMachine(PRESETS[0]);
      });
      item.append(remove);
    }
    return item;
  }));
}

function renderDrawer() {
  renderList($("preset-list"), PRESETS, false);
  renderList($("my-list"), saved, true);
  $("my-empty").hidden = saved.length > 0;
}

// ---------- make your own ----------

const pad = createPad($("pad"));
const sensorSelect = $("b-sensor");
const actionSelect = $("b-action");

for (const [key, sensor] of Object.entries(SENSORS)) {
  const text = sensor.name === sensor.label ? sensor.name : `${sensor.name} (${sensor.label})`;
  sensorSelect.add(new Option(text, key));
}
for (const [key, action] of Object.entries(ACTIONS)) {
  if (!action.presetOnly) actionSelect.add(new Option(action.name, key));
}
actionSelect.addEventListener("change", () => {
  $("b-text-row").hidden = actionSelect.value !== "text";
});

$("make").addEventListener("click", () => {
  $("b-name").value = "";
  $("b-text").value = "";
  sensorSelect.selectedIndex = 0;
  actionSelect.selectedIndex = 0;
  $("b-text-row").hidden = true;
  pad.clear();
  builder.showModal();
});

$("b-clear").addEventListener("click", () => pad.clear());
$("b-cancel").addEventListener("click", () => builder.close());

$("b-save").addEventListener("click", () => {
  const machine = {
    id: Date.now().toString(36),
    name: $("b-name").value.trim() || "My machine",
    sensor: sensorSelect.value,
    action: actionSelect.value,
    text: $("b-text").value.trim() || "Hello!",
    body: pad.path(),
  };
  saved.push(machine);
  persist();
  renderDrawer();
  builder.close();
  setDrawer(false);
  selectMachine(machine);
});

// ---------- go ----------

renderDrawer();
selectMachine(PRESETS[0]);
