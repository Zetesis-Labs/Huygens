"""Roundtrip tests for the typed error reconstruction.

The TS server packs ``{code, message, details}`` into
``CallToolResult.structuredContent.error``; we re-hydrate it into a
typed Python subclass so callers can do ``except RawAlreadyProcessedError``.
"""

from __future__ import annotations

from huygens_worker.errors import (
    BlockNotFoundError,
    HuygensError,
    RawNotFoundError,
    huygens_error_from_structured,
)


def test_known_code_yields_matching_subclass() -> None:
    err = huygens_error_from_structured(
        {
            "error": {
                "code": "RAW_NOT_FOUND",
                "message": "raw_capture not found: raw_capture:abc",
                "details": {"raw_id": "raw_capture:abc"},
            }
        }
    )
    assert isinstance(err, RawNotFoundError)
    assert err.code == "RAW_NOT_FOUND"
    assert err.details == {"raw_id": "raw_capture:abc"}


def test_each_known_code_maps_to_its_subclass() -> None:
    cases = [
        ("RAW_NOT_FOUND", RawNotFoundError),
        ("BLOCK_NOT_FOUND", BlockNotFoundError),
    ]
    for code, cls in cases:
        err = huygens_error_from_structured({"error": {"code": code, "message": "x"}})
        assert isinstance(err, cls), f"code={code} did not yield {cls.__name__}"
        assert err.code == code


def test_unknown_code_falls_back_to_generic_huygens_error() -> None:
    err = huygens_error_from_structured(
        {"error": {"code": "SOMETHING_NEW", "message": "unknown error"}}
    )
    assert err is not None
    assert isinstance(err, HuygensError)
    assert not isinstance(err, RawNotFoundError)


def test_missing_structured_content_returns_none() -> None:
    assert huygens_error_from_structured(None) is None
    assert huygens_error_from_structured({}) is None
    assert huygens_error_from_structured({"foo": "bar"}) is None


def test_malformed_error_payload_returns_none() -> None:
    assert huygens_error_from_structured({"error": "just a string"}) is None
    assert huygens_error_from_structured({"error": None}) is None


def test_details_default_to_empty_when_absent() -> None:
    err = huygens_error_from_structured({"error": {"code": "RAW_NOT_FOUND", "message": "x"}})
    assert isinstance(err, RawNotFoundError)
    assert err.details == {}
