from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    MOCK_MODE: bool = True
    DEMO_ANSWER: str = "This is a demo answer from TabVision."
    DEMO_QUESTION: str = "Demo mode is active"
    MAX_IMAGE_WIDTH: int = 1280
    JPEG_QUALITY: int = 80
    CONFIDENCE_THRESHOLD: float = 0.7

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
