#!/usr/bin/env python3
"""Replace all light gray text classes with dark readable text across all TSX files."""
import os
import re
import glob

# Files to process
files = glob.glob("client/src/**/*.tsx", recursive=True)
files += glob.glob("client/src/**/*.ts", recursive=True)

# Exclude UI library files and backups
files = [f for f in files if not any(x in f for x in [
    "/ui/", ".bak", "DashboardLayout", "ManusDialog", "AIChatBox",
    "ComponentShowcase", "trpc.ts", "useAuth.ts"
])]

# Text color replacements: light gray → dark
# Rule: text-gray-400 → text-gray-800, text-gray-500 → text-gray-700, text-gray-300 → text-gray-800
# BUT: keep color-coded accents (emerald, indigo, blue, red, amber, etc.) as-is
# AND: keep text-gray-600 → text-gray-800 (still too light)

replacements = [
    # Very light grays → near-black
    ("text-gray-300",  "text-gray-800"),
    ("text-gray-400",  "text-gray-800"),
    # Medium-light grays → dark
    ("text-gray-500",  "text-gray-700"),
    ("text-gray-600",  "text-gray-800"),
    # Slate grays (any remaining)
    ("text-slate-300", "text-gray-800"),
    ("text-slate-400", "text-gray-800"),
    ("text-slate-500", "text-gray-700"),
    ("text-slate-600", "text-gray-800"),
    # Placeholder text — keep slightly lighter but still readable
    ("placeholder:text-gray-400", "placeholder:text-gray-500"),
    ("placeholder:text-gray-300", "placeholder:text-gray-500"),
    ("placeholder:text-slate-400", "placeholder:text-gray-500"),
    ("placeholder:text-slate-500", "placeholder:text-gray-500"),
    # Hover states
    ("hover:text-gray-400", "hover:text-gray-700"),
    ("hover:text-gray-500", "hover:text-gray-700"),
    ("hover:text-gray-600", "hover:text-gray-800"),
    # Focus states
    ("focus:text-gray-400", "focus:text-gray-800"),
    ("focus:text-gray-500", "focus:text-gray-800"),
]

total_changes = 0
for filepath in files:
    with open(filepath, "r") as f:
        content = f.read()
    
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    
    if content != original:
        changes = sum(original.count(old) for old, _ in replacements)
        total_changes += changes
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated: {filepath}")

print(f"\nTotal replacements: {total_changes}")
print("Done!")
