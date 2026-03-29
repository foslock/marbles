"""Tests for passphrase generation."""

from app.game.passphrase import generate_passphrase, ADJECTIVES, NOUNS


def test_passphrase_format():
    p = generate_passphrase()
    parts = p.split("-")
    assert len(parts) == 2
    assert parts[0] in ADJECTIVES
    assert parts[1] in NOUNS


def test_passphrase_uniqueness():
    """Passphrases should usually be different (probabilistically)."""
    passphrases = {generate_passphrase() for _ in range(50)}
    # With 48*48=2304 combos, 50 draws should yield many distinct values
    assert len(passphrases) >= 30


def test_passphrase_word_lists_nonempty():
    assert len(ADJECTIVES) >= 40
    assert len(NOUNS) >= 40


def test_passphrase_all_lowercase():
    for _ in range(20):
        p = generate_passphrase()
        assert p == p.lower()
