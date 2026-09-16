(function () {
  const TYPES = {
    TYPE_ANSWER: "TYPE_ANSWER",
    STOP_TYPING: "STOP_TYPING",
    TYPING_PROGRESS: "TYPING_PROGRESS",
    TYPING_COMPLETE: "TYPING_COMPLETE",
    TYPING_PAUSED: "TYPING_PAUSED"
  };
  const RANGES = { slow: [100, 200], medium: [50, 150], fast: [20, 80] };
  let typing = { active: false, token: 0, typed: 0, total: 0 };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const randomDelay = speed => {
    const [min, max] = RANGES[speed] || RANGES.medium;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  function targetElement() {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return null;
    return active.closest?.("input, textarea, [contenteditable='true']") || active;
  }

  function post(type, payload = {}) {
    window.postMessage({ source: "TABVISION_MAIN", type, ...payload }, "*");
  }

  function nativeValueSetter(element) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  }

  function insertIntoField(element, character) {
    const value = element.value || "";
    const start = typeof element.selectionStart === "number" ? element.selectionStart : value.length;
    const end = typeof element.selectionEnd === "number" ? element.selectionEnd : start;
    const setter = nativeValueSetter(element);
    if (!setter) return false;
    setter.call(element, value.slice(0, start) + character + value.slice(end));
    const cursor = start + character.length;
    try { element.setSelectionRange(cursor, cursor); } catch (_) {}
    try {
      element.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: character, bubbles: true, composed: true }));
    } catch (_) {
      element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    return true;
  }

  function insertIntoContentEditable(element, character) {
    if (document.execCommand) {
      try { if (document.execCommand("insertText", false, character)) return true; } catch (_) {}
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(character));
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new InputEvent("input", { inputType: "insertText", data: character, bubbles: true, composed: true }));
    return true;
  }

  async function copyToClipboard(answer, token) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(answer);
      copied = true;
    } catch (_) {
      const helper = document.createElement("textarea");
      helper.value = answer;
      helper.setAttribute("readonly", "");
      helper.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
      document.body.appendChild(helper);
      helper.select();
      try { copied = document.execCommand("copy"); } catch (_) {}
      helper.remove();
    }
    if (typing.token !== token) return;
    typing.active = false;
    if (copied) post(TYPES.TYPING_COMPLETE, { typed: answer.length, total: answer.length });
    else post(TYPES.TYPING_PAUSED, { typed: 0 });
  }

  async function typeAnswer(answer, startIndex, speed, mode) {
    const token = ++typing.token;
    typing = { active: true, token, typed: startIndex, total: answer.length };
    if (mode === "clipboard") { await copyToClipboard(answer, token); return; }
    const element = targetElement();
    if (!element) { typing.active = false; post(TYPES.TYPING_PAUSED, { typed: startIndex }); return; }
    const remaining = answer.slice(startIndex);
    for (const character of remaining) {
      if (!typing.active || typing.token !== token) return;
      const inserted = element.isContentEditable ? insertIntoContentEditable(element, character) : insertIntoField(element, character);
      if (!inserted) { typing.active = false; post(TYPES.TYPING_PAUSED, { typed: typing.typed }); return; }
      typing.typed += 1;
      post(TYPES.TYPING_PROGRESS, { typed: typing.typed, total: typing.total });
      await sleep(randomDelay(speed));
    }
    if (typing.active && typing.token === token) {
      typing.active = false;
      post(TYPES.TYPING_COMPLETE, { typed: typing.typed, total: typing.total });
    }
  }

  function pauseFromInteraction() {
    if (!typing.active) return;
    typing.active = false;
    post(TYPES.TYPING_PAUSED, { typed: typing.typed, total: typing.total });
  }

  for (const [eventName, target] of [["keydown", document], ["mousedown", document], ["touchstart", document], ["scroll", window]]) {
    target.addEventListener(eventName, pauseFromInteraction, { capture: true, passive: true });
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.data?.source !== "TABVISION_EXTENSION") return;
    const message = event.data;
    if (message.type === TYPES.TYPE_ANSWER) typeAnswer(message.answer, Number(message.startIndex) || 0, message.typingSpeed, message.typingMode);
    if (message.type === TYPES.STOP_TYPING) { typing.active = false; typing.token += 1; }
  });
})();
