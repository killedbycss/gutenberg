"""Пользовательский словарь исключений (слова, которые не считать ошибкой).

Хранится в JSON-файле. Потокобезопасен для стандартного Flask-сервера.
"""
import json
import os
import threading
from typing import List


class UserDictionary:
    def __init__(self, path: str):
        self.path = path
        self._lock = threading.Lock()
        self._words = self._load()

    def _load(self) -> set:
        if os.path.exists(self.path):
            try:
                with open(self.path, encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, list):
                    return {str(w) for w in data if str(w).strip()}
            except (json.JSONDecodeError, OSError):
                pass
        return set()

    def _save(self) -> None:
        tmp = f"{self.path}.tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(sorted(self._words), f, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)  # атомарная запись

    def list(self) -> List[str]:
        return sorted(self._words, key=str.lower)

    def add(self, word: str) -> List[str]:
        w = (word or "").strip()
        if w:
            with self._lock:
                # не добавляем дубликат, отличающийся только регистром
                if w.lower() not in {x.lower() for x in self._words}:
                    self._words.add(w)
                    self._save()
        return self.list()

    def remove(self, word: str) -> List[str]:
        target = (word or "").strip().lower()
        with self._lock:
            to_drop = {x for x in self._words if x.lower() == target}
            if to_drop:
                self._words -= to_drop
                self._save()
        return self.list()
