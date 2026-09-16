# TabVision AI Assistant

A Manifest V3 Chrome extension that captures the visible tab, sends a compressed image to a local FastAPI service, and delivers the returned answer to the currently focused editable field.

## Included

- Popup with live state and typing progress
- Capture shortcut: `Ctrl + Shift + A`
- Stop shortcut: `Alt + Shift + X`
- Screenshot preprocessing in an offscreen document
- Gemini-ready FastAPI backend with demo mode enabled by default
- Medium/slow/fast typing speeds
- Type into field or copy to clipboard
- User-interaction pause and inactivity re-analysis
- Settings page for backend URL and behavior

## Run the backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env       # Windows
# cp .env.example .env       # macOS/Linux
python run.py
```

The backend starts at `http://127.0.0.1:8000`. Demo mode does not need a Gemini key. It returns the configured `DEMO_ANSWER`, making it easy to validate the extension flow. To use Gemini, set `MOCK_MODE=false` and add `GEMINI_API_KEY` to `.env`.

## Load the extension

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the `tabvision-extension` folder.
5. Visit `file:///absolute/path/to/tabvision-extension/demo/index.html`, focus the text field, and click **Capture & Analyze** in the extension popup.

The first capture asks for consent in the extension's **Settings** page because the visible tab is sent to the configured backend for analysis.

## Important behavior

- Only the visible viewport is captured.
- Password fields are always skipped.
- The backend key stays on the local server and is never placed in extension files.
- Screenshots and answers are not persisted by the extension.
- Chrome system pages such as `chrome://extensions` cannot be captured.
- Background alarms may use a browser-enforced minimum of about 30 seconds.

## Backend endpoints

- `GET /health` — service health check
- `POST /api/analyze` — accepts `{ "image": "<base64>" }` and returns an answer, confidence, and detected task
