"""Registry đóng gói trong Layer, đồng bộ từ config M2 bằng azure.py configure."""

import json
import os
from pathlib import Path


REGISTRY_PATH = Path(__file__).with_name("voices.json")


def load_registry(path=None) -> dict:
    """Trả nội dung registry; file thiếu hoặc hỏng thì raise OSError, ValueError."""
    if path is not None:
        return json.loads(path.read_text(encoding="utf-8"))
    provider = os.environ.get("TTS_PROVIDER", "elevenlabs")
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
