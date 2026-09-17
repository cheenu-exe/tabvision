import asyncio
import base64
import json
import re

from config import settings
from models.schemas import AnalyzeResponse
from services.image import preprocess_image


SYSTEM_PROMPT = """You analyze a screenshot of a web page.
Return only valid JSON in this exact shape:
{"answer":"...","confidence":0.0,"question_detected":"..."}

If a question, form field, or actionable task is visible, identify it and give
the concise answer. For multiple choice, return only the option letter. For a
text field, return the complete answer text. For a code field, return the code.
If no actionable task is visible, return an empty answer and confidence 0.
Do not include explanations outside the JSON object."""


class AnalysisError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


def _extract_json(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        raise ValueError("Gemini returned no JSON object.")
    return json.loads(match.group(0))


def _mock_response() -> AnalyzeResponse:
    return AnalyzeResponse(
        answer=settings.DEMO_ANSWER,
        confidence=0.95,
        question_detected=settings.DEMO_QUESTION,
        raw_response="demo-mode",
    )


def _generate(image_bytes: bytes):
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise AnalysisError("Install the backend requirements before using Gemini.") from exc

    if not settings.GEMINI_API_KEY:
        raise AnalysisError("GEMINI_API_KEY is not configured.", 503)

    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_MODEL)
    try:
        return model.generate_content([
            SYSTEM_PROMPT,
            {"mime_type": "image/jpeg", "data": image_bytes},
        ])
    except Exception as exc:
        message = str(exc)
        lowered = message.lower()
        if "401" in message or "403" in message or "api key" in lowered:
            raise AnalysisError("Gemini rejected the API key.", 403) from exc
        if "429" in message or "quota" in lowered or "rate" in lowered:
            raise AnalysisError("Gemini rate limit reached. Try again later.", 429) from exc
        raise AnalysisError("Gemini could not analyze the screenshot.", 502) from exc


async def analyze_image(base64_image: str) -> AnalyzeResponse:
    if settings.MOCK_MODE:
        return _mock_response()

    try:
        normalized = preprocess_image(base64_image)
        image_bytes = base64.b64decode(normalized, validate=True)
    except ValueError as exc:
        raise AnalysisError(str(exc), 400) from exc
    except Exception as exc:
        raise AnalysisError("Could not decode the screenshot.", 400) from exc

    response = await asyncio.to_thread(_generate, image_bytes)
    raw_text = getattr(response, "text", "").strip()
    try:
        data = _extract_json(raw_text)
        confidence = max(0.0, min(1.0, float(data.get("confidence", 0))))
        return AnalyzeResponse(
            answer=str(data.get("answer", "")),
            confidence=confidence,
            question_detected=str(data.get("question_detected", "")),
            raw_response=raw_text,
        )
    except (ValueError, TypeError, json.JSONDecodeError) as exc:
        raise AnalysisError("Gemini returned an invalid analysis response.", 502) from exc
