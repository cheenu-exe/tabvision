const TYPES = { PREPROCESS_AND_ANALYZE: "PREPROCESS_AND_ANALYZE" };

function dataUrlToBase64(dataUrl) {
  return String(dataUrl || "").replace(/^data:image\/[^;]+;base64,/, "");
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The screenshot could not be decoded."));
    image.src = dataUrl;
  });
}

async function preprocess(dataUrl) {
  const image = await loadImage(dataUrl);
  const maxWidth = 1280;
  const scale = image.width > maxWidth ? maxWidth / image.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return dataUrlToBase64(canvas.toDataURL("image/jpeg", 0.8));
}

async function requestAnalysis(image, apiUrl, requestId) {
  const endpoint = `${String(apiUrl || "http://127.0.0.1:8000/api").replace(/\/$/, "")}/analyze`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, request_id: requestId })
    });
  } catch (_) {
    return { ok: false, message: "Backend unreachable. Start the local FastAPI server and try again." };
  }
  let body = {};
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) {
    const details = body.detail || body.message || `Backend returned HTTP ${response.status}.`;
    if (response.status === 401 || response.status === 403) return { ok: false, message: "Invalid Gemini API key." };
    if (response.status === 429) return { ok: false, message: "Gemini rate limit reached. Try again later." };
    return { ok: false, message: String(details) };
  }
  return { ok: true, ...body };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== TYPES.PREPROCESS_AND_ANALYZE || message.target !== "offscreen") return false;
  preprocess(message.image)
    .then(image => requestAnalysis(image, message.apiUrl, message.requestId))
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ ok: false, message: error.message || "Preprocessing failed." }));
  return true;
});
