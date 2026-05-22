from huygens_worker.settings import Settings


def test_worker_disabled_by_default() -> None:
    assert Settings().worker_enabled is False


def test_worker_enabled_env_guard(monkeypatch) -> None:
    monkeypatch.setenv("WORKER_ENABLED", "true")
    assert Settings().worker_enabled is True
