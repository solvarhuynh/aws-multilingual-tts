"""Registry đóng gói trong Layer, đồng bộ từ config M2 bằng azure.py configure."""

import json
import os
from pathlib import Path


REGISTRY_PATH = Path(__file__).with_name("voices.json")
GEMINI_REGISTRY_PATH = Path(__file__).with_name("voices.gemini.json")
GEMINI_MODEL = "gemini-3.8-flash-tts"
GEMINI_STYLES = {
    "cheerful": "Cheerful, smiling and warm, without exaggeration.",
    "excited": "Excited and energetic, with lively intonation.",
    "calm": "Calm, relaxed, reassuring and unhurried.",
    "empathetic": "Empathetic, compassionate and attentive.",
    "sad": "Sad and reflective, with restrained emotion.",
    "angry": "Angry and intense, while keeping every word clear.",
    "confident": "Confident and persuasive, with clear emphasis.",
    "friendly": "Friendly, warm and conversational.",
    "serious": "Serious, composed and professional.",
    "narration": "Expressive storytelling with natural dramatic pauses.",
    "whispering": "Whisper softly while remaining intelligible.",
}


def gemini_settings():
    name = os.environ.get("GEMINI_TTS_API_PARAMETER_NAME") or os.environ.get("GEMINI_API_PARAMETER_NAME", "")
    model = os.environ.get("GEMINI_TTS_MODEL", GEMINI_MODEL)
    if os.environ.get("GEMINI_TTS_ENABLED", "false") != "true" or not name.startswith("/") or model != GEMINI_MODEL:
        return None
    return {"parameter": name, "model": model}


def gemini_registry():
    catalog = json.loads(GEMINI_REGISTRY_PATH.read_text(encoding="utf-8"))
    voices = [{**voice, "styles": list(GEMINI_STYLES)} for voice in catalog["_voices"]]
    return {lang: {"provider": "gemini", "engine": GEMINI_MODEL, "model": GEMINI_MODEL,
                   "name": name, "languageCode": lang, "voices": voices, "speedRange": [0.7, 1.2]}
            for lang, name in catalog["_languages"].items()}


def load_registry(path=None, *, provider=None) -> dict:
    """Trả nội dung registry; file thiếu hoặc hỏng thì raise OSError, ValueError."""
    if path is not None:
        return json.loads(path.read_text(encoding="utf-8"))
    configured = os.environ.get("TTS_PROVIDER", "elevenlabs")
    if provider is not None and provider not in {configured, "gemini"}:
        raise ValueError("PROVIDER_NOT_ENABLED")
    provider = provider or configured
    if provider == "gemini":
        if gemini_settings() is None:
            raise ValueError("GEMINI_TTS_NOT_CONFIGURED")
        return gemini_registry()
    if provider not in {"elevenlabs", "azure"}:
        raise ValueError("Unsupported TTS_PROVIDER")
    path = REGISTRY_PATH if provider == "elevenlabs" else REGISTRY_PATH.with_name("voices.azure.json")
    registry = json.loads(path.read_text(encoding="utf-8"))
    if provider == "azure":
        region = os.environ.get("AZURE_SPEECH_REGION")
        if not region or registry.get("_region") != region:
            raise ValueError("Azure registry region mismatch; run deployment/scripts/azure.py configure")
        if not any(not lang.startswith("_") and entry.get("voices") for lang, entry in registry.items()):
            raise ValueError("Azure registry has not been configured")
    return registry
