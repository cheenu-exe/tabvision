import { MESSAGE_TYPES, STATES } from "../shared/constants.js";

const statusCard = document.querySelector("#statusCard");
const statusLabel = document.querySelector("#statusLabel");
const statusDetail = document.querySelector("#statusDetail");
const captureButton = document.querySelector("#captureButton");
const captureButtonLabel = document.querySelector("#captureButtonLabel");
const progressBar = document.querySelector("#progressBar");
const questionText = document.querySelector("#questionText");
const answerText = document.querySelector("#answerText");
const confidenceBadge = document.querySelector("#confidenceBadge");

const labels = {
  [STATES.IDLE]: ["Ready", "Press Ctrl+Shift+A or use the button below."],
  [STATES.CAPTURING]: ["Capturing screen…", "Reading the visible viewport."],
  [STATES.ANALYZING]: ["Analyzing with Gemini…", "The local backend is processing the screenshot."],
  [STATES.TYPING]: ["Typing answer…", "Press the stop button or use Alt+Shift+X to cancel."],
  [STATES.PAUSED]: ["Paused", "Waiting for inactivity before checking the page again."],
  [STATES.ERROR]: ["Error", "The last operation could not be completed."]
};

function setState(state) {
  const [label, detail] = labels[state.current] || labels[STATES.IDLE];
  statusCard.dataset.state = state.current;
  statusLabel.textContent = state.error ? `Error: ${state.error}` : label;
  statusDetail.textContent = state.error ? "Fix the issue, then try again." : detail;
  const busy = [STATES.CAPTURING, STATES.ANALYZING, STATES.TYPING].includes(state.current);
  captureButton.disabled = false;
  captureButtonLabel.textContent = busy ? "STOP" : state.current === STATES.PAUSED ? "CAPTURE AGAIN" : "CAPTURE & ANALYZE";
  captureButton.querySelector(".button-symbol").textContent = busy ? "■" : "◉";
  progressBar.style.width = state.total ? `${Math.round((state.typed / state.total) * 100)}%` : "0%";
  if (state.questionDetected) questionText.textContent = state.questionDetected;
  if (state.answer) answerText.textContent = state.answer;
  if (typeof state.confidence === "number" && state.confidence > 0) confidenceBadge.textContent = `${Math.round(state.confidence * 100)}% confidence`;
}

async function send(message) {
  try { return await chrome.runtime.sendMessage(message); }
  catch (error) { statusDetail.textContent = error.message || "Extension service unavailable."; return null; }
}

captureButton.addEventListener("click", async () => {
  const current = await send({ type: MESSAGE_TYPES.GET_STATE });
  if (current && [STATES.CAPTURING, STATES.ANALYZING, STATES.TYPING].includes(current.current)) {
    await send({ type: MESSAGE_TYPES.STOP_ALL });
  } else {
    await send({ type: MESSAGE_TYPES.START_CAPTURE });
  }
});

document.querySelector("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener(message => {
  if (message.type === MESSAGE_TYPES.STATE_UPDATE) setState(message.state);
});

send({ type: MESSAGE_TYPES.GET_STATE }).then(state => { if (state) setState(state); });
