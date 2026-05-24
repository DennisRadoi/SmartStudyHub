import os
import sys
from pathlib import Path

os.environ["SMART_STUDY_HUB_SKIP_OLLAMA"] = "1"

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from main import hash_password, strip_markdown_formatting, verify_password


def test_strip_markdown_formatting_removes_markdown():
    text = """
# Heading

- Item one
- Item two

`inline code`

[Link text](https://example.com)
"""
    cleaned = strip_markdown_formatting(text)
    assert "#" not in cleaned
    assert "Item one" in cleaned
    assert "inline code" in cleaned
    assert "Link text" in cleaned


def test_hash_password_roundtrip():
    password = "test-password"
    hashed = hash_password(password)
    assert "$" in hashed
    assert verify_password(password, hashed) is True
    assert verify_password("wrong", hashed) is False
