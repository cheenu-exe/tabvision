import base64
import io

from PIL import Image

from config import settings


def preprocess_image(base64_data: str) -> str:
    """Normalize the image before it is sent to the model."""
    try:
        image_bytes = base64.b64decode(base64_data, validate=True)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise ValueError("The request does not contain a valid base64 image.") from exc

    if image.width > settings.MAX_IMAGE_WIDTH:
        ratio = settings.MAX_IMAGE_WIDTH / image.width
        image = image.resize(
            (settings.MAX_IMAGE_WIDTH, max(1, int(image.height * ratio))),
            Image.Resampling.LANCZOS,
        )

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=settings.JPEG_QUALITY, optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")
