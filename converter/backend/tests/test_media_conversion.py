import os
import subprocess
import tempfile

import imageio_ffmpeg

import mediakit


def make_video():
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as target:
        path = target.name
    try:
        result = subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-y",
            "-f", "lavfi", "-i", "color=c=#f04466:s=64x48:d=0.3",
            "-pix_fmt", "yuv420p", path,
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        assert result.returncode == 0, result.stderr.decode("utf-8", "replace")
        with open(path, "rb") as stream:
            return stream.read()
    finally:
        if os.path.exists(path):
            os.unlink(path)


def test_analyze_and_convert_video():
    source = make_video()
    report = mediakit.analyze_media(source, "sample.mp4")
    assert report["ok"] and report["media"]["width"] == 64
    for target, signature in (("mov", b"ftyp"), ("webm-video", b"\x1aE\xdf\xa3"), ("gif-video", b"GIF8")):
        result = mediakit.convert_media(source, "sample.mp4", target)
        assert result["ok"], result.get("error")
        assert signature in result["data"][:16]
