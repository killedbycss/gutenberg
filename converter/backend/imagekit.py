"""Анализ и конвертация растровых изображений в ICO, JPG и WebP."""

from __future__ import annotations

import io
from PIL import Image, UnidentifiedImageError


TARGET_FORMATS = [
    {"key": "png-lossless", "label": "PNG", "ext": "png", "kind": "image",
     "note": "Сжатие без потери качества и прозрачности"},
    {"key": "ico", "label": "ICO", "ext": "ico", "kind": "image",
     "note": "Иконка Windows с несколькими размерами до 256×256"},
    {"key": "jpg", "label": "JPG", "ext": "jpg", "kind": "image",
     "note": "Сжатое изображение; прозрачность заменяется белым фоном"},
    {"key": "webp", "label": "WebP", "ext": "webp", "kind": "image",
     "note": "Современное изображение с хорошим сжатием и прозрачностью"},
]


def analyze_image(data: bytes) -> dict:
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.seek(0)
            return {
                "ok": True,
                "kind": "image",
                "source": {"key": (image.format or "image").lower(),
                           "label": image.format or "Изображение"},
                "image": {
                    "width": image.width,
                    "height": image.height,
                    "mode": image.mode,
                    "frames": getattr(image, "n_frames", 1),
                },
            }
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        return {"ok": False, "kind": "image", "error": f"Не удалось прочитать изображение: {exc}"}


def _open_rgba(data: bytes, options: dict | None = None) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.seek(0)
    image.load()
    image = image.convert("RGBA")
    options = options or {}
    compression = max(1, int(options.get("compression", 1)))
    if compression > 1:
        image = image.resize((max(1, round(image.width / compression)), max(1, round(image.height / compression))), Image.Resampling.LANCZOS)
    return image


def _to_ico(image: Image.Image) -> bytes:
    out = io.BytesIO()
    max_side = min(256, max(image.width, image.height))
    sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256) if s <= max_side]
    if not sizes:
        sizes = [(16, 16)]
    image.thumbnail((256, 256), Image.Resampling.LANCZOS)
    image.save(out, format="ICO", sizes=sizes)
    return out.getvalue()


def _to_jpg(image: Image.Image, quality=92) -> bytes:
    background = Image.new("RGB", image.size, "white")
    background.paste(image, mask=image.getchannel("A"))
    out = io.BytesIO()
    background.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
    return out.getvalue()


def _to_webp(image: Image.Image, quality=90) -> bytes:
    out = io.BytesIO()
    image.save(out, format="WEBP", quality=quality, method=6)
    return out.getvalue()


def _to_png_lossless(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True, compress_level=9)
    return out.getvalue()


def _to_webp_lossless(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="WEBP", lossless=True, method=6)
    return out.getvalue()


def convert_image(data: bytes, target: str, options: dict | None = None) -> dict:
    try:
        options = options or {}
        image = _open_rgba(data, options)
        converters = {"ico": _to_ico, "jpg": _to_jpg, "webp": _to_webp,
                      "png-lossless": _to_png_lossless,
                      }
        if target not in converters:
            return {"ok": False, "error": f"Неизвестный формат изображения: {target}", "warnings": []}
        quality = max(1, min(100, int(options.get("quality", 90))))
        result = converters[target](image, quality) if target in ("jpg", "webp") else converters[target](image)
        ext = "png" if target == "png-lossless" else target
        return {"ok": True, "data": result, "ext": ext, "outline": None, "warnings": [],
                "width": image.width, "height": image.height}
    except Exception as exc:  # декодер/кодек не должен ронять весь пакет
        return {"ok": False, "error": f"Ошибка конвертации изображения: {exc}", "warnings": []}
