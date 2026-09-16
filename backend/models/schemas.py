from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    image: str = Field(min_length=1, description="Base64-encoded screenshot without a data URL prefix")
    request_id: str | None = None


class AnalyzeResponse(BaseModel):
    answer: str
    confidence: float = Field(ge=0, le=1)
    question_detected: str
    raw_response: str | None = None
