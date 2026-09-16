export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function makeRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isRestrictedUrl(url = "") {
  return /^(chrome|chrome-extension|edge|about|view-source):/i.test(url);
}

export function getErrorMessage(error, fallback = "Something went wrong") {
  return error?.message || fallback;
}
