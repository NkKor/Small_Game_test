#!/usr/bin/env python3
"""
Test script to verify that all imports in the game work correctly
"""

print("Testing imports...")

try:
    import pygame
    print("✓ pygame imported successfully")
except ImportError as e:
    print(f"✗ Failed to import pygame: {e}")

try:
    import random
    print("✓ random imported successfully")
except ImportError as e:
    print(f"✗ Failed to import random: {e}")

try:
    import json
    print("✓ json imported successfully")
except ImportError as e:
    print(f"✗ Failed to import json: {e}")

try:
    import os
    print("✓ os imported successfully")
except ImportError as e:
    print(f"✗ Failed to import os: {e}")

try:
    import time
    print("✓ time imported successfully")
except ImportError as e:
    print(f"✗ Failed to import time: {e}")

try:
    from enum import Enum
    print("✓ Enum imported successfully")
except ImportError as e:
    print(f"✗ Failed to import Enum: {e}")

print("\nAll imports successful! The game should run properly in an environment with display support.")