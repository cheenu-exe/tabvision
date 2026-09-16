import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app


client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["message"] == "Backend is running."


def test_demo_analysis():
    response = client.post("/api/analyze", json={"image": "not-used-in-demo"})
    assert response.status_code == 200
    body = response.json()
    assert body["confidence"] >= 0.7
    assert body["answer"]
