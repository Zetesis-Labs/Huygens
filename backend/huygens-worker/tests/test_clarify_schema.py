"""Schema-level tests for the Decomposition Pydantic model.

The interesting bit is the ``mit_for`` validator that normalizes the
loose date/datetime forms the LLM tends to emit into the strict
``YYYY-MM-DDTHH:MM:SSZ`` form Zod's ``.datetime()`` accepts on the
TS side.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from huygens_worker.clarify import BlockProposal, Decomposition, NoteProposal


def _note(**overrides: object) -> NoteProposal:
    base: dict[str, object] = {
        "title": "x",
        "type_slug": "note",
        "state": "CLARIFIED",
        "blocks": [BlockProposal(content="y")],
        "transformation": "extracted",
        "internal_refs": [],
    }
    base.update(overrides)
    return NoteProposal.model_validate(base)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("2026-05-21", "2026-05-21T00:00:00Z"),
        ("2026-05-21T10:00:00Z", "2026-05-21T10:00:00Z"),
        ("2026-05-21T10:00:00", "2026-05-21T10:00:00Z"),
        ("2026-05-21T10:00:00+02:00", "2026-05-21T08:00:00Z"),
        ("2026-05-21T10:00:00.123Z", "2026-05-21T10:00:00Z"),
    ],
)
def test_mit_for_normalizes_to_strict_utc(raw: str, expected: str) -> None:
    note = _note(mit_for=raw)
    assert note.mit_for == expected


def test_mit_for_none_stays_none() -> None:
    assert _note(mit_for=None).mit_for is None
    assert _note(mit_for="").mit_for is None


def test_mit_for_garbage_raises() -> None:
    with pytest.raises(ValidationError) as excinfo:
        _note(mit_for="not a date at all")
    assert "mit_for" in str(excinfo.value)


def test_decomposition_requires_at_least_one_note() -> None:
    with pytest.raises(ValidationError):
        Decomposition(notes=[], reasoning_summary="empty")


def test_internal_refs_are_indexed() -> None:
    note = _note(
        internal_refs=[{"kind": "mentions", "to_note_index": 3}],
    )
    assert note.internal_refs[0].to_note_index == 3
    assert note.internal_refs[0].kind == "mentions"


def test_internal_ref_negative_index_rejected() -> None:
    with pytest.raises(ValidationError):
        _note(internal_refs=[{"kind": "mentions", "to_note_index": -1}])
