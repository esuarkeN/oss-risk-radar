import importlib

import app.config as config


def load_port_with_env(monkeypatch, value: str) -> int:
    with monkeypatch.context() as env:
        env.setenv("SCORING_PORT", value)
        reloaded = importlib.reload(config)
        port = reloaded.settings.port

    importlib.reload(config)
    return port


def test_settings_ignores_kubernetes_service_port_env(monkeypatch) -> None:
    assert load_port_with_env(monkeypatch, "tcp://10.43.106.91:8090") == 8090


def test_settings_accepts_numeric_port_env(monkeypatch) -> None:
    assert load_port_with_env(monkeypatch, "9090") == 9090
