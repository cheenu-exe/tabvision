import {
  CONFIDENCE_THRESHOLD,
  DEFAULT_CONFIG,
  INACTIVITY_ALARM,
  MESSAGE_TYPES,
  STATES
} from "../shared/constants.js";
import { getErrorMessage, isRestrictedUrl } from "../shared/utils.js";

let config = { ...DEFAULT_CONFIG };
let state = createState();
let errorTimer;

function createState() {
  return {
    current: STATES.IDLE,
    tabId: null,
    windowId: null,
    requestId: null,
    answer: "",
    questionDetected: "",
    confidence: 0,
    typed: 0,
    total: 0,
    error: null
  };
}

function publicState() {
  return {
    current: state.current,
    tabId: state.tabId,
    answer: state.answer,
    questionDetected: state.questionDetected,
    confidence: state.confidence,
    typed: state.typed,
    total: state.total,
    error: state.error
  };
}

function broadcast() {
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STATE_UPDATE, state: publicState() }).catch(() => {});
}

function transition(current, patch = {}) {
  state = { ...state, ...patch, current };
  broadcast();
}

async function loadConfig() {
  config = { ...DEFAULT_CONFIG, ...(await chrome.storage.sync.get(DEFAULT_CONFIG)) };
  if (config.apiUrl === "http://localhost:8000/api") {
    config.apiUrl = DEFAULT_CONFIG.apiUrl;
    await chrome.storage.sync.set({ apiUrl: config.apiUrl });
  }
}

async function notify(title, message, type = "info") {
  if (!config.showNotifications) return;
  try {
    await chrome.notifications.create(`tabvision-${Date.now()}`, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("assets/icon128.png"),
      title: `TabVision · ${title}`,
      message
    });
  } catch (_) {
    // Notifications are helpful but must not interrupt the main flow.
  }
}

async function fail(message, shouldNotify = true) {
  clearTimeout(errorTimer);
  transition(STATES.ERROR, { error: message });
  if (shouldNotify) await notify("Action stopped", message, "error");
  errorTimer = setTimeout(() => {
    if (state.current === STATES.ERROR) transition(STATES.IDLE, { error: null, typed: 0, total: 0 });
  }, 5500);
}

async function clearInactivityAlarm() {
  try { await chrome.alarms.clear(INACTIVITY_ALARM); } catch (_) {}
}

async function stopAll() {
  await clearInactivityAlarm();
  if (state.tabId != null) {
    try { await chrome.tabs.sendMessage(state.tabId, { type: MESSAGE_TYPES.STOP_TYPING }); } catch (_) {}
  }
  transition(STATES.IDLE, { requestId: null, typed: 0, total: 0, error: null });
}

async function scheduleInactivity() {
  if (!config.autoResume) return;
  await clearInactivityAlarm();
  const delaySeconds = Math.max(Number(config.inactivityThreshold || 22500) / 1000, 30);
  await chrome.alarms.create(INACTIVITY_ALARM, { delayInMinutes: delaySeconds / 60 });
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) throw new Error("Offscreen processing is not available in this browser.");
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen/offscreen.html",
      reasons: ["DOM_SCRAPING"],
      justification: "Resize and compress a screenshot before sending it to the local analysis service."
    });
  } catch (error) {
    if (!/already exists/i.test(error.message || "")) throw error;
  }
}

async function analyzeScreenshot(dataUrl, requestId) {
  await ensureOffscreenDocument();
  const result = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.PREPROCESS_AND_ANALYZE,
    target: "offscreen",
    image: dataUrl,
    requestId,
    apiUrl: config.apiUrl
  });
  if (!result?.ok) throw new Error(result?.message || "The backend did not return an analysis.");
  return result;
}

async function startCapture({ resume = false } = {}) {
  if (!resume && ![STATES.IDLE, STATES.ERROR].includes(state.current)) return;
  const previousAnswer = state.answer;
  const previousTyped = state.typed;
  await loadConfig();
  if (!config.consentToSend) {
    await fail("Enable screenshot consent in Settings before starting an analysis.");
    return;
  }
  await clearInactivityAlarm();

  let activeTabs;
  try { activeTabs = await chrome.tabs.query({ active: true, currentWindow: true }); }
  catch (_) { await fail("Could not read the active tab."); return; }
  const tab = activeTabs?.[0];
  if (!tab?.id || !tab.windowId) { await fail("No active tab is available."); return; }
  if (isRestrictedUrl(tab.url)) { await fail("Cannot capture browser or extension system pages."); return; }

  const requestId = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  transition(STATES.CAPTURING, {
    tabId: tab.id,
    windowId: tab.windowId,
    requestId,
    error: null,
    typed: resume ? previousTyped : 0,
    total: resume ? state.total : 0
  });

  let screenshot;
  try { screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }); }
  catch (_) { await fail("Cannot capture this page. Check the tab permissions and try again."); return; }
  if (state.requestId !== requestId) return;

  transition(STATES.ANALYZING, { requestId });
  let result;
  try { result = await analyzeScreenshot(screenshot, requestId); }
  catch (error) {
    const message = getErrorMessage(error, "Backend unreachable. Start the local FastAPI server and try again.");
    await fail(message);
    return;
  }
  if (state.requestId !== requestId) return;

  const answer = String(result.answer || "").trim();
  const confidence = Number(result.confidence || 0);
  const questionDetected = String(result.question_detected || "");
  const accepted = confidence >= CONFIDENCE_THRESHOLD && answer.length > 0;
  if (!accepted) {
    transition(STATES.IDLE, { answer, confidence, questionDetected, typed: 0, total: answer.length, requestId: null });
    if (answer && confidence < CONFIDENCE_THRESHOLD) await notify("Low confidence", "The answer was not typed because confidence was below 70%.", "warning");
    return;
  }

  const canContinue = resume && previousAnswer && answer.startsWith(previousAnswer);
  const startIndex = canContinue ? Math.min(previousTyped, answer.length) : 0;
  transition(STATES.TYPING, {
    answer,
    confidence,
    questionDetected,
    typed: startIndex,
    total: answer.length,
    requestId
  });
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.TYPE_ANSWER,
      answer,
      startIndex,
      typingSpeed: config.typingSpeed,
      typingMode: config.typingMode || "type"
    });
    if (response?.error) {
      await handleContentError(response.error);
    }
  } catch (_) {
    await fail("This page cannot receive extension messages. Try a regular web page.");
  }
}

async function handleContentError(errorCode) {
  const messages = {
    [MESSAGE_TYPES.NO_INPUT_FOCUSED]: "No editable field is focused on this page.",
    [MESSAGE_TYPES.READONLY_INPUT]: "The focused field is read-only or disabled.",
    [MESSAGE_TYPES.PASSWORD_INPUT]: "Password fields are skipped for safety.",
    [MESSAGE_TYPES.CONTENT_SCRIPT_UNAVAILABLE]: "This page does not allow content scripts."
  };
  await fail(messages[errorCode] || "The answer could not be delivered.");
}

async function pauseTyping(typed = state.typed) {
  if (state.current !== STATES.TYPING) return;
  transition(STATES.PAUSED, { typed: Number(typed) || state.typed });
  await scheduleInactivity();
  await notify("Typing paused", "Activity was detected. TabVision will check again after inactivity.", "warning");
}

async function finishTyping() {
  if (![STATES.TYPING, STATES.PAUSED].includes(state.current)) return;
  await clearInactivityAlarm();
  transition(STATES.IDLE, { typed: state.total, requestId: null, error: null });
  await notify("Answer typed", "The answer was delivered to the active page.", "success");
}

chrome.runtime.onInstalled.addListener(() => loadConfig());
chrome.runtime.onStartup.addListener(() => {
  state = createState();
  loadConfig();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === MESSAGE_TYPES.GET_STATE) {
    sendResponse(publicState());
    return false;
  }
  if (message.type === MESSAGE_TYPES.START_CAPTURE) {
    startCapture().catch(error => fail(getErrorMessage(error)));
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MESSAGE_TYPES.STOP_ALL) {
    stopAll();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MESSAGE_TYPES.USER_INTERACTION && sender.tab?.id === state.tabId) {
    if (state.current === STATES.TYPING) pauseTyping(message.typed);
    if (state.current === STATES.PAUSED) scheduleInactivity();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MESSAGE_TYPES.TYPING_PROGRESS && sender.tab?.id === state.tabId) {
    if (state.current === STATES.TYPING) { state.typed = Number(message.typed) || state.typed; broadcast(); }
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MESSAGE_TYPES.TYPING_COMPLETE && sender.tab?.id === state.tabId) {
    finishTyping();
    sendResponse({ ok: true });
    return false;
  }
  if (message.type === MESSAGE_TYPES.TYPING_PAUSED && sender.tab?.id === state.tabId) {
    pauseTyping(message.typed);
    sendResponse({ ok: true });
    return false;
  }
  if ([MESSAGE_TYPES.NO_INPUT_FOCUSED, MESSAGE_TYPES.READONLY_INPUT, MESSAGE_TYPES.PASSWORD_INPUT].includes(message.type) && sender.tab?.id === state.tabId) {
    handleContentError(message.type);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.commands.onCommand.addListener(command => {
  if (command === "capture") startCapture().catch(error => fail(getErrorMessage(error)));
  if (command === "stop") stopAll();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === INACTIVITY_ALARM && state.current === STATES.PAUSED) {
    startCapture({ resume: true }).catch(error => fail(getErrorMessage(error)));
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if ([STATES.TYPING, STATES.PAUSED].includes(state.current) && tabId !== state.tabId) stopAll();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === state.tabId && changeInfo.status === "loading" && [STATES.TYPING, STATES.PAUSED].includes(state.current)) stopAll();
});

loadConfig();
