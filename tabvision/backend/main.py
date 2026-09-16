from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.analyze import router as analyze_router

app = FastAPI(title="TabVision AI Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost", "http://127.0.0.1"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(analyze_router, prefix="/api")


@app.get("/")
def root():
    return {
        "ok": True,
        "service": "tabvision-backend",
        "message": "Backend is running.",
        "health": "/health",
        "analyze": "POST /api/analyze",
    }


@app.get("/health")
def health():
    return {"ok": True, "service": "tabvision-backend"}
