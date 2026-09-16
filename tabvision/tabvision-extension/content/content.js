const TYPES = {
  TYPE_ANSWER: "TYPE_ANSWER",
  STOP_TYPING: "STOP_TYPING",
  USER_INTERACTION: "USER_INTERACTION",
  TYPING_PROGRESS: "TYPING_PROGRESS",
  TYPING_COMPLETE: "TYPING_COMPLETE",
  TYPING_PAUSED: "TYPING_PAUSED",
  NO_INPUT_FOCUSED: "NO_INPUT_FOCUSED",
  READONLY_INPUT: "READONLY_INPUT",
  PASSWORD_INPUT: "PASSWORD_INPUT",
  CONTENT_SCRIPT_UNAVAILABLE: "CONTENT_SCRIPT_UNAVAILABLE"
};

let localTyping = false;
let localPaused = false;
let localTyped = 0;

function getEditableTarget() {
  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) return null;
  const editable = active.closest?.("input, textarea, [contenteditable='true']") || active;
  if (editable.matches?.("input, textarea")) {
    const type = (editable.type || "text").toLowerCase();
    if (type === "password") return { error: TYPES.PASSWORD_INPUT };
    if (["hidden", "button", "submit", "reset", "checkbox", "radio", "file", "range", "color"].includes(type)) return null;
    if (editable.readOnly || editable.disabled) return { error: TYPES.READONLY_INPUT };
    return editable;
  }
  if (editable.isContentEditable) return editable;
  return null;
}

function send(type, payload = {}) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

function reportInteraction() {
  if (!localTyping && !localPaused) return;
  if (localTyping) localTyping = false;
  send(TYPES.USER_INTERACTION, { typed: localTyped });
}

for (const [eventName, target] of [["keydown", document], ["mousedown", document], ["touchstart", document], ["scroll", window]]) {
  target.addEventListener(eventName, reportInteraction, { capture: true, passive: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === TYPES.TYPE_ANSWER) {
    if (message.typingMode !== "clipboard") {
      const target = getEditableTarget();
      if (!target) {
        sendResponse({ error: TYPES.NO_INPUT_FOCUSED });
        send(TYPES.NO_INPUT_FOCUSED);
        return false;
      }
      if (target.error) {
        sendResponse({ error: target.error });
        send(target.error);
        return false;
      }
    }
    localTyping = true;
    localPaused = false;
    localTyped = Number(message.startIndex) || 0;
    window.postMessage({
      source: "TABVISION_EXTENSION",
      type: TYPES.TYPE_ANSWER,
      answer: String(message.answer || ""),
      startIndex: localTyped,
      typingSpeed: message.typingSpeed || "medium",
      typingMode: message.typingMode || "type"
    }, "*");
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === TYPES.STOP_TYPING) {
    localTyping = false;
    localPaused = false;
    window.postMessage({ source: "TABVISION_EXTENSION", type: TYPES.STOP_TYPING }, "*");
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

window.addEventListener("message", event => {
  if (event.source !== window || event.data?.source !== "TABVISION_MAIN") return;
  const message = event.data;
  if (message.type === TYPES.TYPING_PROGRESS) {
    localTyped = Number(message.typed) || localTyped;
    send(TYPES.TYPING_PROGRESS, { typed: localTyped, total: message.total });
  } else if (message.type === TYPES.TYPING_COMPLETE) {
    localTyping = false;
    localPaused = false;
    localTyped = Number(message.typed) || localTyped;
    send(TYPES.TYPING_COMPLETE, { typed: localTyped });
  } else if (message.type === TYPES.TYPING_PAUSED) {
    localTyping = false;
    localPaused = true;
    localTyped = Number(message.typed) || localTyped;
    send(TYPES.TYPING_PAUSED, { typed: localTyped });
  }
});
