// The strip under the scene: Sensor -> When -> Then, so you can see what a machine is made of.

import { SENSORS, ACTIONS } from "./machines.js";

function block(caption, text) {
  const el = document.createElement("div");
  el.className = "block";
  const small = document.createElement("small");
  small.textContent = caption;
  const span = document.createElement("span");
  span.textContent = text;
  el.append(small, span);
  return el;
}

export function renderBlocks(root, machine) {
  const sensor = SENSORS[machine.sensor];
  const action = ACTIONS[machine.action];
  const parts = [
    block("Sensor", sensor.label),
    block("When it", sensor.when),
    block("Then it", machine.action === "text" ? `says “${machine.text}”` : action.then),
  ];

  const items = [];
  parts.forEach((part, i) => {
    if (i) {
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      items.push(arrow);
    }
    items.push(part);
  });
  root.replaceChildren(...items);
}

// light the blocks up one after another, like a signal travelling through
export function flash(root) {
  root.querySelectorAll(".block").forEach((el, i) => {
    setTimeout(() => {
      el.classList.add("fire");
      setTimeout(() => el.classList.remove("fire"), 160);
    }, i * 110);
  });
}
