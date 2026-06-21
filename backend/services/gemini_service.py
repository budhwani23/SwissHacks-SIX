"""
gemini_service.py - Google Gemini speech services (STT + TTS)

Used by the voice-command feature:
  - transcribe(): audio bytes  -> text   (Gemini multimodal)
  - synthesize(): text         -> WAV     (Gemini TTS)

Auth via GEMINI_API_KEY in backend/.env. No extra SDK needed — plain REST.
"""
import os
import re
import base64
import struct
import requests
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
STT_MODEL       = os.getenv("GEMINI_STT_MODEL", "gemini-2.0-flash")
TTS_MODEL       = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
TTS_VOICE       = os.getenv("GEMINI_TTS_VOICE", "Kore")
BASE            = "https://generativelanguage.googleapis.com/v1beta"


def _require_key():
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env to enable voice."
        )


def _extract_text(data: dict) -> str:
    try:
        parts = data["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)
    except (KeyError, IndexError, TypeError):
        return ""


def transcribe(audio_base64: str, mime_type: str = "audio/wav") -> str:
    """Transcribe base64-encoded audio to plain text via Gemini."""
    _require_key()
    url = f"{BASE}/models/{STT_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{
            "parts": [
                {"text": "Transcribe the spoken audio to plain text. "
                         "Return ONLY the transcription with no commentary or quotes."},
                {"inline_data": {"mime_type": mime_type, "data": audio_base64}},
            ]
        }],
        "generationConfig": {"temperature": 0},
    }
    r = requests.post(url, json=payload, timeout=60)
    r.raise_for_status()
    return _extract_text(r.json()).strip()


def _pcm_to_wav(pcm: bytes, sample_rate: int = 24000, channels: int = 1, bits: int = 16) -> bytes:
    """Wrap raw little-endian PCM in a WAV container so browsers can play it."""
    byte_rate   = sample_rate * channels * bits // 8
    block_align = channels * bits // 8
    data_size   = len(pcm)
    header = (
        b"RIFF" + struct.pack("<I", 36 + data_size) + b"WAVE"
        + b"fmt " + struct.pack("<IHHIIHH", 16, 1, channels, sample_rate, byte_rate, block_align, bits)
        + b"data" + struct.pack("<I", data_size)
    )
    return header + pcm


def _rate_from_mime(mime: str, default: int = 24000) -> int:
    if not mime:
        return default
    m = re.search(r"rate=(\d+)", mime)
    return int(m.group(1)) if m else default


def synthesize(text: str, voice: str = None) -> bytes:
    """Convert text to speech; returns WAV bytes."""
    _require_key()
    voice = voice or TTS_VOICE
    url = f"{BASE}/models/{TTS_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}
            },
        },
    }
    r = requests.post(url, json=payload, timeout=90)
    r.raise_for_status()
    part = r.json()["candidates"][0]["content"]["parts"][0]
    inline = part["inlineData"]
    pcm = base64.b64decode(inline["data"])
    rate = _rate_from_mime(inline.get("mimeType", ""))
    return _pcm_to_wav(pcm, sample_rate=rate)


def is_configured() -> bool:
    return bool(GEMINI_API_KEY)
