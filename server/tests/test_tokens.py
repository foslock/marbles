"""Tests for character tokens."""

from app.board.tokens import TOKENS, assign_tokens


def test_has_16_tokens():
    assert len(TOKENS) == 16


def test_tokens_have_required_fields():
    required = {"id", "name", "description", "color", "emoji"}
    for token in TOKENS:
        for field in required:
            assert field in token, f"Token {token.get('id', '?')} missing '{field}'"


def test_unique_ids():
    ids = [t["id"] for t in TOKENS]
    assert len(ids) == len(set(ids))


def test_unique_emojis():
    emojis = [t["emoji"] for t in TOKENS]
    assert len(emojis) == len(set(emojis))


def test_assign_tokens_correct_count():
    tokens = assign_tokens(4)
    assert len(tokens) == 4


def test_assign_tokens_all_unique():
    tokens = assign_tokens(8)
    ids = [t["id"] for t in tokens]
    assert len(ids) == len(set(ids))


def test_assign_tokens_capped_at_16():
    tokens = assign_tokens(20)
    assert len(tokens) == 16
