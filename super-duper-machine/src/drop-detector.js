// Detects a phone drop from devicemotion: free fall (near-zero acceleration)
// followed shortly by an impact spike. Thresholds are tuned for playtesting.

const FREEFALL_MAX = 3;      // m/s², resting is ~9.8, free fall approaches 0
const FREEFALL_MIN_MS = 200; // a 1 m fall lasts ~450 ms
const IMPACT_MIN = 25;       // m/s², spike when the phone hits a surface
const IMPACT_WINDOW_MS = 1000;

let handler = null;

export function isSupported() {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

// iOS needs an explicit permission, requested from a user gesture.
export async function requestPermission() {
  if (!isSupported()) return false;
  if (typeof DeviceMotionEvent.requestPermission !== "function") return true;
  return (await DeviceMotionEvent.requestPermission()) === "granted";
}

export function start({ onSample, onDrop, freefallMinMs = FREEFALL_MIN_MS, impactMin = IMPACT_MIN }) {
  stop();

  let freefallSince = null;
  let freefallEndedAt = null;
  let fellLongEnough = false;

  handler = (event) => {
    const a = event.accelerationIncludingGravity;
    if (!a || a.x == null) return;

    const now = performance.now();
    const magnitude = Math.hypot(a.x, a.y, a.z);
    onSample?.(magnitude);

    if (magnitude < FREEFALL_MAX) {
      freefallSince ??= now;
      if (now - freefallSince >= freefallMinMs) fellLongEnough = true;
      freefallEndedAt = now;
      return;
    }

    freefallSince = null;
    if (!fellLongEnough) return;

    if (now - freefallEndedAt > IMPACT_WINDOW_MS) {
      fellLongEnough = false;
    } else if (magnitude > impactMin) {
      fellLongEnough = false;
      onDrop();
    }
  };

  window.addEventListener("devicemotion", handler);
}

export function stop() {
  if (handler) window.removeEventListener("devicemotion", handler);
  handler = null;
}
