// Sharing a machine = putting it in a link: https://…/#add=<code>. No server involved.
// The code is the machine as JSON, deflated when the browser can, as base64url.
// "z" in front means deflated, "j" plain. Whatever arrives in a link is untrusted:
// run it through sanitizeMachine() (machines.js) before using it.

const MAX_CODE = 60_000;    // characters of link we are willing to look at
const MAX_JSON = 100_000;   // bytes after unpacking, so a tiny code can't blow up into a huge one

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// run bytes through a (De)CompressionStream, giving up if the result gets bigger than `limit`
async function through(bytes, stream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      reader.cancel();
      throw new Error("too big");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

export async function pack(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === "function") {
    return "z" + toBase64Url(await through(bytes, new CompressionStream("deflate-raw")));
  }
  return "j" + toBase64Url(bytes);
}

// returns whatever JSON was packed, or null if the code is broken
export async function unpack(code) {
  try {
    if (typeof code !== "string" || code.length < 2 || code.length > MAX_CODE) return null;
    let bytes = fromBase64Url(code.slice(1));
    if (code[0] === "z") {
      if (typeof DecompressionStream !== "function") return null;
      bytes = await through(bytes, new DecompressionStream("deflate-raw"), MAX_JSON);
    } else if (code[0] !== "j" || bytes.length > MAX_JSON) {
      return null;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// only what makes a machine: no id, so an imported one always gets a fresh id
export function shareLink(machine) {
  const { name, sensor, action, text, url, sound, params, body } = machine;
  return pack({ name, sensor, action, text, url, sound, params, body })
    .then((code) => `${location.href.split("#")[0]}#add=${code}`);
}
