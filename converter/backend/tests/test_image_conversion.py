import io

from PIL import Image

import imagekit


def make_png():
    image = Image.new("RGBA", (65, 47), (220, 40, 80, 160))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_analyze_image():
    report = imagekit.analyze_image(make_png())
    assert report["ok"] and report["kind"] == "image"
    assert report["image"]["width"] == 65
    assert report["image"]["height"] == 47


def test_convert_to_ico_and_jpg():
    source = make_png()
    ico = imagekit.convert_image(source, "ico")
    jpg = imagekit.convert_image(source, "jpg")
    assert ico["ok"] and ico["data"][:4] == b"\x00\x00\x01\x00"
    assert jpg["ok"] and jpg["data"][:2] == b"\xff\xd8"


def test_convert_to_webp():
    result = imagekit.convert_image(make_png(), "webp")
    assert result["ok"], result.get("error")
    assert result["data"][:4] == b"RIFF"
    assert result["data"][8:12] == b"WEBP"


def test_lossless_targets_preserve_pixels():
    source = make_png()
    original = Image.open(io.BytesIO(source)).convert("RGBA")
    for target in ("png-lossless", "webp-lossless"):
        result = imagekit.convert_image(source, target)
        assert result["ok"], result.get("error")
        converted = Image.open(io.BytesIO(result["data"])).convert("RGBA")
        assert list(converted.getdata()) == list(original.getdata())
