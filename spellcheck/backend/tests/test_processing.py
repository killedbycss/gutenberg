"""Тесты чистой логики обработки (без сети и Flask).

Запуск:  cd backend && python -m pytest
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from processing import apply_dictionary, classify, flagged_text, normalize  # noqa: E402


def make_match(offset, length, category_id, issue="", replacements=None, rule_id="R"):
    return {
        "offset": offset,
        "length": length,
        "message": "msg",
        "shortMessage": "short",
        "replacements": [{"value": v} for v in (replacements or [])],
        "rule": {
            "id": rule_id,
            "issueType": issue,
            "category": {"id": category_id, "name": category_id.title()},
        },
        "context": {"text": "...", "offset": 0, "length": length},
    }


def test_classify_spelling():
    assert classify(make_match(0, 4, "TYPOS", "misspelling")) == "spelling"


def test_classify_punctuation():
    assert classify(make_match(0, 1, "PUNCTUATION", "typographical")) == "punctuation"


def test_classify_style():
    assert classify(make_match(0, 5, "REDUNDANCY", "style")) == "style"


def test_classify_grammar_default():
    assert classify(make_match(0, 5, "GRAMMAR", "grammar")) == "grammar"


def test_normalize_trims_replacements():
    m = make_match(3, 6, "TYPOS", "misspelling", replacements=list("abcdefghij"))
    out = normalize(m, max_replacements=4)
    assert out["offset"] == 3
    assert out["length"] == 6
    assert out["type"] == "spelling"
    assert out["replacements"] == ["a", "b", "c", "d"]
    assert out["rule"]["id"] == "R"


def test_flagged_text():
    text = "Привет, превед мир"
    m = {"offset": 8, "length": 6}
    assert flagged_text(text, m) == "превед"


def test_apply_dictionary_filters_spelling_only():
    text = "Kubernetes кубернетес"
    matches = [
        normalize(make_match(0, 10, "TYPOS", "misspelling")),          # Kubernetes
        normalize(make_match(11, 10, "TYPOS", "misspelling")),         # кубернетес
    ]
    # Добавляем только английский термин в словарь.
    filtered = apply_dictionary(text, matches, ["Kubernetes"])
    tokens = [flagged_text(text, m) for m in filtered]
    assert "Kubernetes" not in tokens
    assert "кубернетес" in tokens


def test_apply_dictionary_ignores_grammar():
    text = "the the cat"
    grammar = normalize(make_match(0, 7, "GRAMMAR", "grammar"))
    # Даже если слово в словаре, грамматическую ошибку не убираем.
    filtered = apply_dictionary(text, [grammar], ["the"])
    assert len(filtered) == 1


def test_apply_dictionary_case_insensitive():
    text = "Превед"
    m = normalize(make_match(0, 6, "TYPOS", "misspelling"))
    assert apply_dictionary(text, [m], ["превед"]) == []
