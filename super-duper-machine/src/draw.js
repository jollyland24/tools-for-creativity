// Freehand drawing pad for the machine body. path() returns an SVG path in a 0..100 box.

const MARGIN = 8;
const MIN_GAP = 3; // px, skip points closer than this to keep the path small

export function createPad(canvas) {
  const g = canvas.getContext("2d");
  let strokes = [];
  let current = null;

  function style() {
    g.lineWidth = 3;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#111";
  }
  style();

  const point = (event) => {
    const box = canvas.getBoundingClientRect();
    return [
      ((event.clientX - box.left) * canvas.width) / box.width,
      ((event.clientY - box.top) * canvas.height) / box.height,
    ];
  };

  canvas.addEventListener("pointerdown", (event) => {
    try { canvas.setPointerCapture(event.pointerId); } catch { /* synthetic events */ }
    current = [point(event)];
    strokes.push(current);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!current) return;
    const p = point(event);
    const q = current[current.length - 1];
    g.beginPath();
    g.moveTo(q[0], q[1]);
    g.lineTo(p[0], p[1]);
    g.stroke();
    current.push(p);
  });

  const end = () => { current = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);

  const lines = () => strokes.filter((s) => s.length > 1);

  return {
    clear() {
      strokes = [];
      current = null;
      g.clearRect(0, 0, canvas.width, canvas.height);
      style();
    },

    hasInk: () => lines().length > 0,

    path() {
      const all = lines();
      if (!all.length) return null;

      const points = all.flat();
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = (100 - 2 * MARGIN) / (Math.max(maxX - minX, maxY - minY) || 1);
      const x = (v) => (50 + (v - (minX + maxX) / 2) * scale).toFixed(1);
      const y = (v) => (50 + (v - (minY + maxY) / 2) * scale).toFixed(1);

      return all
        .map((stroke) => {
          // thin the points, always keeping the first and last
          const thinned = [stroke[0]];
          for (const p of stroke.slice(1, -1)) {
            const last = thinned[thinned.length - 1];
            if (Math.hypot(p[0] - last[0], p[1] - last[1]) > MIN_GAP) thinned.push(p);
          }
          thinned.push(stroke[stroke.length - 1]);
          return thinned.map((p, i) => `${i ? "L" : "M"}${x(p[0])} ${y(p[1])}`).join(" ");
        })
        .join(" ");
    },
  };
}
