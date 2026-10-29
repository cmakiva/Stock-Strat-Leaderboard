import os
import subprocess
import sys
import tempfile

from PIL import Image

REPO = os.path.join(os.path.dirname(__file__), "..")


def test_share_images_written_for_every_page():
    data = os.path.join(REPO, "site", "data", "sample-results.json")
    with tempfile.TemporaryDirectory() as out:
        subprocess.run([sys.executable, os.path.join(REPO, "engine", "share_images.py"), "--data", data, "--out", out], check=True)
        files = sorted(os.listdir(out))
        assert "home.png" in files
        assert len(files) == 17
        for f in files:
            with Image.open(os.path.join(out, f)) as im:
                assert im.size == (1200, 630)
