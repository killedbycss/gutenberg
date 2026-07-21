"""Тесты ядра типографики. Запуск: python -m pytest  (или python tests/test_typography.py)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from typography import Typographer

NBSP = " "
EM = "—"
EN = "–"


def run(text, **kw):
    return Typographer(**kw).process(text)[0]


# ---------- Кавычки ----------

def test_ru_quotes_outer():
    assert run('Он сказал "привет" мне.', enabled_types=["quotes"]) \
        == 'Он сказал «привет» мне.'


def test_ru_quotes_nested():
    out = run('Это "внешние и "внутренние" кавычки" тут.',
              enabled_types=["quotes"])
    assert out == 'Это «внешние и “внутренние” кавычки» тут.'


def test_en_quotes_outer():
    assert run('He said "hello" to me.', enabled_types=["quotes"]) \
        == 'He said «hello» to me.'


def test_en_quotes_nested():
    out = run('She said "a "quote" inside" now.', enabled_types=["quotes"])
    assert out == 'She said «a “quote” inside» now.'


def test_apostrophe_en():
    assert run("I don't know, it's Bob's.", enabled_types=["quotes"]) \
        == "I don’t know, it’s Bob’s."


def test_apostrophe_does_not_break_short_word_nbsp():
    # хвост «’t» в don’t не должен считаться коротким словом
    out = run("You don't stop.")
    assert out == "You don’t stop."


def test_quotes_language_by_content():
    # английская цитата внутри русского предложения → английские кавычки
    out = run('Фильм назывался "Some English Title" тогда.')
    assert '«Some English Title»' in out


# ---------- Тире ----------

def test_dialogue_dash():
    assert run("- Привет!", enabled_types=["dashes"]) == f"{EM} Привет!"


def test_dialogue_dash_not_for_english_list():
    # английский маркированный список не должен превращаться в тире
    assert run("- apple", enabled_types=["dashes"]) == "- apple"


def test_thought_dash_ru():
    out = run("Москва - столица.", enabled_types=["dashes"])
    assert out == f"Москва {EM} столица."


def test_thought_dash_en_us():
    out = run("New York - a city.", enabled_types=["dashes"], en_dash_style="us")
    assert out == f"New York{EM}a city."


def test_thought_dash_en_uk():
    out = run("New York - a city.", enabled_types=["dashes"], en_dash_style="uk")
    assert out == f"New York {EN} a city."


def test_range_dash():
    out = run("Годы 1990-2000 были важны.", enabled_types=["dashes"])
    assert out == f"Годы 1990{EN}2000 были важны."


def test_range_dash_skips_iso_date():
    out = run("Дата 2020-01-01 тут.", enabled_types=["dashes"])
    assert out == "Дата 2020-01-01 тут."


def test_compound_word_untouched():
    out = run("какой-то текст", enabled_types=["dashes"])
    assert out == "какой-то текст"


# ---------- Неразрывные пробелы ----------

def test_nbsp_short_word():
    out = run("Я иду в лес и домой.", enabled_types=["nbsp"])
    assert f"в{NBSP}лес" in out
    assert f"и{NBSP}домой" in out


def test_nbsp_initials():
    out = run("Автор А. С. Пушкин.", enabled_types=["nbsp"])
    assert f"А.{NBSP}С.{NBSP}Пушкин" in out


def test_nbsp_before_dash():
    out = run("Москва - столица.", enabled_types=["dashes", "nbsp"])
    assert out == f"Москва{NBSP}{EM} столица."


# ---------- Исключения и опции ----------

def test_exceptions_protect():
    out = run('Бренд "Best-1990" тут.', exceptions=['"Best-1990"'])
    assert '"Best-1990"' in out  # не тронуто


def test_disabled_type():
    out = run('Он сказал "да".', enabled_types=["dashes"])  # кавычки выключены
    assert '"да"' in out


# ---------- Позиции правок ----------

def test_edit_positions_point_into_result():
    text = 'Он сказал "да" в лес.'
    result, edits = Typographer().process(text)
    assert edits, "должны быть правки"
    for ed in edits:
        # координаты правки указывают на итоговый текст и совпадают с new
        assert result[ed.start:ed.end] == ed.new


def test_edits_never_overlap_and_map_to_result():
    # смешанный текст со всеми видами правок + взаимодействие тире/NBSP
    text = ('Он сказал: "Это - лучший 1990-2000", и я согласился.\n'
            '- А что думает А. С. Иванов?\n'
            'The label "New Type" by O\'Brien is a must-have - don\'t stop.')
    result, edits = Typographer().process(text)
    prev_end = -1
    for ed in edits:
        # каждая правка ссылается на реальный участок итогового текста
        assert result[ed.start:ed.end] == ed.new
        # правки не пересекаются и идут по порядку
        assert ed.start >= prev_end, f"пересечение правок у {ed.rule}"
        prev_end = ed.end


def test_undo_reconstructs_by_original():
    # применяя ed.original к каждому участку (справа налево), получаем исходник
    text = 'Москва - столица 1990-2000. New York - a city.'
    result, edits = Typographer().process(text)
    restored = result
    for ed in sorted(edits, key=lambda e: e.start, reverse=True):
        restored = restored[:ed.start] + ed.original + restored[ed.end:]
    assert restored == text


def test_mixed_ru_en():
    text = 'Русский "текст" and English "text" here.'
    out = run(text)
    assert '«текст»' in out
    assert '«text»' in out


if __name__ == "__main__":
    import traceback
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    passed = failed = 0
    for fn in fns:
        try:
            fn()
            passed += 1
            print(f"  ok   {fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"  FAIL {fn.__name__}: {e}")
            traceback.print_exc()
    print(f"\n{passed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
