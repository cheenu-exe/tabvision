import { DEFAULT_CONFIG } from "../shared/constants.js";

const form = document.querySelector("#settingsForm");
const threshold = document.querySelector("#inactivityThreshold");
const thresholdOutput = document.querySelector("#thresholdOutput");
const saveMessage = document.querySelector("#saveMessage");

function updateThresholdLabel() { thresholdOutput.textContent = `${threshold.value} seconds`; }
threshold.addEventListener("input", updateThresholdLabel);

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_CONFIG);
  const apiUrl = settings.apiUrl === "http://localhost:8000/api" ? DEFAULT_CONFIG.apiUrl : settings.apiUrl;
  document.querySelector("#apiUrl").value = apiUrl;
  document.querySelector("#consentToSend").checked = Boolean(settings.consentToSend);
  document.querySelector(`input[name="typingSpeed"][value="${settings.typingSpeed}"]`).checked = true;
  document.querySelector(`input[name="typingMode"][value="${settings.typingMode || "type"}"]`).checked = true;
  threshold.value = Math.round(Number(settings.inactivityThreshold || DEFAULT_CONFIG.inactivityThreshold) / 1000);
  document.querySelector("#autoResume").checked = settings.autoResume;
  document.querySelector("#showNotifications").checked = settings.showNotifications;
  updateThresholdLabel();
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const data = new FormData(form);
  await chrome.storage.sync.set({
    apiUrl: String(data.get("apiUrl")).replace(/\/$/, ""),
    consentToSend: document.querySelector("#consentToSend").checked,
    typingSpeed: data.get("typingSpeed"),
    typingMode: data.get("typingMode"),
    inactivityThreshold: Number(threshold.value) * 1000,
    autoResume: document.querySelector("#autoResume").checked,
    showNotifications: document.querySelector("#showNotifications").checked
  });
  saveMessage.textContent = "Settings saved.";
  setTimeout(() => { saveMessage.textContent = ""; }, 2200);
});

loadSettings();
