import os
import sys

# Гарантируем, что backend-модули (fontmetrics, app, config) импортируются в тестах.
sys.path.insert(0, os.path.dirname(__file__))
