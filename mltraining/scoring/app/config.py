from dataclasses import dataclass
import os


def int_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return fallback

    try:
        value = int(raw.strip())
    except ValueError:
        return fallback

    if value <= 0 or value > 65535:
        return fallback
    return value


@dataclass(slots=True)
class Settings:
    service_name: str = os.getenv("SCORING_SERVICE_NAME", "oss-risk-radar-scoring")
    service_version: str = os.getenv("SCORING_SERVICE_VERSION", "0.1.0")
    host: str = os.getenv("SCORING_HOST", "0.0.0.0")
    port: int = int_env("SCORING_PORT", 8090)
    model_name: str = os.getenv("SCORING_MODEL_NAME", "heuristic-v1")


settings = Settings()
