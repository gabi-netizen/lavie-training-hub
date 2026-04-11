#!/usr/bin/env python3
"""
Convert Home.tsx dark theme to light theme.
Replaces dark oklch values, bg-black, text-white patterns with light equivalents.
"""
import re

with open("client/src/pages/Home.tsx", "r") as f:
    content = f.read()

# ── 1. Page wrapper background ──────────────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.13 0.025 250)" }}',
    'className="bg-gray-50"'
)

# ── 2. Tab bar background ────────────────────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.16 0.025 250)" }}',
    'style={{ background: "white" }}'
)

# ── 3. Tab number badges — active ────────────────────────────────────────────
content = content.replace(
    'background: activeTab === tab.id ? "oklch(0.55 0.22 250)" : "oklch(0.38 0.08 250)"',
    'background: activeTab === tab.id ? "oklch(0.50 0.20 265)" : "oklch(0.80 0.05 265)"'
)

# ── 4. Hero headline text-white → text-gray-900 ──────────────────────────────
content = content.replace(
    'className="text-4xl font-black leading-tight text-white"',
    'className="text-4xl font-black leading-tight text-gray-900"'
)

# ── 5. Hero label color ──────────────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.7 0.08 250)"',
    'color: "oklch(0.50 0.20 265)"'
)

# ── 6. Hero italic span ──────────────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.92 0.04 80)", fontStyle: "italic"',
    'color: "oklch(0.55 0.18 265)", fontStyle: "italic"'
)

# ── 7. Hero body text ────────────────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.72 0.03 250)"',
    'color: "oklch(0.40 0.02 265)"'
)

# ── 8. Section label color ───────────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.65 0.06 250)"',
    'color: "oklch(0.45 0.08 265)"'
)

# ── 9. Card backgrounds — dark navy cards → white/light ──────────────────────
# Objection/section card backgrounds
dark_card_bgs = [
    ("oklch(0.18 0.06 250)", "oklch(0.96 0.03 265)"),
    ("oklch(0.17 0.05 180)", "oklch(0.96 0.03 180)"),
    ("oklch(0.17 0.05 80)",  "oklch(0.97 0.03 80)"),
    ("oklch(0.17 0.05 15)",  "oklch(0.97 0.03 15)"),
    ("oklch(0.17 0.05 300)", "oklch(0.96 0.03 300)"),
    ("oklch(0.16 0.03 250)", "oklch(0.97 0.02 265)"),
    ("oklch(0.18 0.025 250)", "oklch(1 0 0)"),
    ("oklch(0.18 0.04 250)", "oklch(0.97 0.02 265)"),
    ("oklch(0.17 0.04 250)", "oklch(0.97 0.02 265)"),
    ("oklch(0.17 0.04 180)", "oklch(0.97 0.02 180)"),
    ("oklch(0.17 0.05 80)",  "oklch(0.97 0.03 80)"),
    ("oklch(0.16 0.02 250)", "oklch(0.98 0.01 265)"),
    ("oklch(0.22 0.03 250)", "oklch(0.95 0.02 265)"),
    ("oklch(0.22 0.04 250)", "oklch(0.95 0.02 265)"),
    ("oklch(0.25 0.08 250)", "oklch(0.92 0.04 265)"),
    ("oklch(0.2 0.04 250)",  "oklch(0.95 0.02 265)"),
    ("oklch(0.16 0.03 250)", "oklch(0.97 0.02 265)"),
    ("oklch(0.18 0.06 15)",  "oklch(0.97 0.04 15)"),
    ("oklch(0.18 0.06 60)",  "oklch(0.97 0.04 60)"),
    ("oklch(0.16 0.06 145)", "oklch(0.96 0.05 145)"),
    ("oklch(0.16 0.06 250)", "oklch(0.96 0.04 265)"),
    ("oklch(0.18 0.06 145 / 0.5)", "oklch(0.95 0.06 145 / 0.5)"),
    ("oklch(0.17 0.06 180)", "oklch(0.96 0.04 180)"),
    ("oklch(0.18 0.06 250)", "oklch(0.96 0.04 265)"),
    ("oklch(0.18 0.06 60)",  "oklch(0.97 0.04 60)"),
    ("oklch(0.16 0.06 145)", "oklch(0.96 0.05 145)"),
    ("oklch(0.2 0.06 15)",   "oklch(0.97 0.04 15)"),
    ("oklch(0.16 0.02 250)", "oklch(0.98 0.01 265)"),
    ("oklch(0.18 0.06 250)", "oklch(0.96 0.04 265)"),
    ("oklch(0.18 0.06 60)",  "oklch(0.97 0.04 60)"),
    ("oklch(0.16 0.06 145)", "oklch(0.96 0.05 145)"),
    ("oklch(0.16 0.06 250)", "oklch(0.96 0.04 265)"),
    ("oklch(0.3 0.12 250)",  "oklch(0.85 0.10 265)"),
]

for dark, light in dark_card_bgs:
    content = content.replace(f'background: "{dark}"', f'background: "{light}"')
    content = content.replace(f'background: \'{dark}\'', f'background: \'{light}\'')

# ── 10. Border colors — dark → light ─────────────────────────────────────────
dark_borders = [
    ("oklch(0.45 0.18 250 / 35%)", "oklch(0.70 0.12 265 / 50%)"),
    ("oklch(0.45 0.15 180 / 35%)", "oklch(0.70 0.12 180 / 50%)"),
    ("oklch(0.5 0.15 80 / 35%)",   "oklch(0.70 0.12 80 / 50%)"),
    ("oklch(0.45 0.18 15 / 35%)",  "oklch(0.70 0.12 15 / 50%)"),
    ("oklch(0.45 0.15 300 / 35%)", "oklch(0.70 0.12 300 / 50%)"),
    ("oklch(0.4 0.1 250 / 35%)",   "oklch(0.70 0.08 265 / 50%)"),
    ("oklch(0.45 0.18 180 / 40%)", "oklch(0.65 0.12 180 / 50%)"),
    ("oklch(0.45 0.18 250 / 25%)", "oklch(0.70 0.10 265 / 40%)"),
    ("oklch(0.45 0.15 80 / 40%)",  "oklch(0.70 0.12 80 / 50%)"),
    ("oklch(0.45 0.18 145 / 0.5)", "oklch(0.60 0.18 145 / 0.5)"),
    ("oklch(0.45 0.18 250 / 40%)", "oklch(0.65 0.12 265 / 50%)"),
    ("oklch(0.45 0.18 250 / 0.4)", "oklch(0.65 0.12 265 / 0.4)"),
    ("oklch(0.45 0.15 60 / 40%)",  "oklch(0.65 0.12 60 / 50%)"),
    ("oklch(0.45 0.18 145 / 40%)", "oklch(0.60 0.18 145 / 50%)"),
    ("oklch(0.35 0.1 15)",         "oklch(0.75 0.10 15)"),
    ("oklch(0.35 0.1 60)",         "oklch(0.75 0.10 60)"),
    ("oklch(0.35 0.12 145)",       "oklch(0.70 0.12 145)"),
    ("oklch(0.45 0.18 250)",       "oklch(0.65 0.15 265)"),
    ("oklch(0.3 0.06 250)",        "oklch(0.80 0.04 265)"),
    ("oklch(0.3 0.06 180)",        "oklch(0.80 0.04 180)"),
    ("oklch(0.28 0.04 250)",       "oklch(0.85 0.03 265)"),
    ("oklch(0.28 0.05 250)",       "oklch(0.85 0.03 265)"),
    ("oklch(0.28 0.04 250)",       "oklch(0.85 0.03 265)"),
    ("oklch(1 0 0 / 10%)",         "oklch(0.88 0.01 265)"),
    ("oklch(1 0 0 / 12%)",         "oklch(0.88 0.01 265)"),
    ("oklch(1 0 0 / 8%)",          "oklch(0.90 0.01 265)"),
    ("oklch(0.55 0.18 250 / 60%)", "oklch(0.60 0.15 265 / 60%)"),
    ("oklch(0.3 0.05 250)",        "oklch(0.80 0.04 265)"),
    ("oklch(0.35 0.1 15 / 60%)",   "oklch(0.75 0.10 15 / 60%)"),
]

for dark, light in dark_borders:
    content = content.replace(f'borderColor: "{dark}"', f'borderColor: "{light}"')
    content = content.replace(f'border: "1px solid {dark}"', f'border: "1px solid {light}"')
    content = content.replace(f'border: "2px solid {dark}"', f'border: "2px solid {light}"')
    content = content.replace(f'border: `1px solid {dark}`', f'border: `1px solid {light}`')
    content = content.replace(f'borderLeft: "3px solid {dark}"', f'borderLeft: "3px solid {light}"')
    content = content.replace(f'borderTop: "1px solid {dark}"', f'borderTop: "1px solid {light}"')
    content = content.replace(f'borderTop: "2px solid {dark}"', f'borderTop: "2px solid {light}"')

# ── 11. text-white → text-gray-900 ───────────────────────────────────────────
content = content.replace('className="text-white"', 'className="text-gray-900"')
content = content.replace('"text-white"', '"text-gray-900"')
# text-white in combined classNames
content = re.sub(r'\btext-white\b(?!/)', 'text-gray-900', content)

# ── 12. text-white/80, text-white/90, text-white/70, text-white/60, text-white/40 ──
content = content.replace('text-white/80', 'text-gray-700')
content = content.replace('text-white/90', 'text-gray-800')
content = content.replace('text-white/70', 'text-gray-600')
content = content.replace('text-white/60', 'text-gray-500')
content = content.replace('text-white/40', 'text-gray-400')

# ── 13. border-white/10 → border-gray-200 ────────────────────────────────────
content = content.replace('border-white/10', 'border-gray-200')
content = content.replace('border-white/8', 'border-gray-200')

# ── 14. Specific text color replacements ─────────────────────────────────────
text_replacements = [
    # Muted text
    ('color: "oklch(0.6 0.04 250)"',   'color: "oklch(0.45 0.03 265)"'),
    ('color: "oklch(0.65 0.04 250)"',  'color: "oklch(0.45 0.03 265)"'),
    ('color: "oklch(0.6 0.01 250)"',   'color: "oklch(0.45 0.02 265)"'),
    ('color: "oklch(0.5 0.01 250)"',   'color: "oklch(0.40 0.02 265)"'),
    ('color: "oklch(0.45 0.05 250)"',  'color: "oklch(0.40 0.04 265)"'),
    ('color: "oklch(0.55 0.1 250)"',   'color: "oklch(0.40 0.06 265)"'),
    ('color: "oklch(0.5 0.06 250)"',   'color: "oklch(0.40 0.05 265)"'),
    ('color: "oklch(0.72 0.1 250)"',   'color: "oklch(0.50 0.18 265)"'),
    ('color: "oklch(0.92 0.01 250)"',  'color: "oklch(0.20 0.02 265)"'),
    ('color: "oklch(0.88 0.05 250)"',  'color: "oklch(0.20 0.02 265)"'),
    ('color: "oklch(0.85 0.08 250)"',  'color: "oklch(0.25 0.04 265)"'),
    ('color: "oklch(0.75 0.05 250)"',  'color: "oklch(0.40 0.03 265)"'),
    ('color: "oklch(0.7 0.05 250)"',   'color: "oklch(0.40 0.03 265)"'),
    # Accent/highlight text — keep vivid
    ('color: "oklch(0.55 0.18 250)"',  'color: "oklch(0.50 0.20 265)"'),
    ('color: "oklch(0.65 0.15 250)"',  'color: "oklch(0.50 0.18 265)"'),
    ('color: "oklch(0.65 0.1 250)"',   'color: "oklch(0.50 0.15 265)"'),
    ('color: "oklch(0.55 0.01 250)"',  'color: "oklch(0.50 0.02 265)"'),
    # Green text — keep vivid
    ('color: "oklch(0.82 0.22 145)"',  'color: "oklch(0.45 0.22 145)"'),
    ('color: "oklch(0.82 0.18 145)"',  'color: "oklch(0.45 0.20 145)"'),
    ('color: "oklch(0.75 0.2 145)"',   'color: "oklch(0.40 0.20 145)"'),
    ('color: "oklch(0.75 0.12 145)"',  'color: "oklch(0.40 0.15 145)"'),
    ('color: "oklch(0.85 0.15 145)"',  'color: "oklch(0.40 0.18 145)"'),
    # Red text
    ('color: "oklch(0.65 0.2 15)"',    'color: "oklch(0.55 0.22 15)"'),
    ('color: "oklch(0.6 0.08 15)"',    'color: "oklch(0.50 0.12 15)"'),
    ('color: "oklch(0.55 0.06 15)"',   'color: "oklch(0.50 0.10 15)"'),
    ('color: "oklch(0.6 0.08 15)"',    'color: "oklch(0.50 0.12 15)"'),
    # Amber/yellow
    ('color: "oklch(0.75 0.15 60)"',   'color: "oklch(0.50 0.18 60)"'),
    ('color: "oklch(0.75 0.12 60)"',   'color: "oklch(0.50 0.15 60)"'),
    # Teal
    ('color: "oklch(0.72 0.19 180)"',  'color: "oklch(0.45 0.18 180)"'),
    ('color: "oklch(0.65 0.06 80)"',   'color: "oklch(0.45 0.10 80)"'),
    # Subtitle text
    ('color: "oklch(0.92 0.05 250)"',  'color: "oklch(0.20 0.04 265)"'),
    # Install page
    ('color: "oklch(0.65 0.1 250)"',   'color: "oklch(0.50 0.15 265)"'),
    ('color: "oklch(0.55 0.08 250)"',  'color: "oklch(0.45 0.10 265)"'),
    # Subscription badges
    ('color: "oklch(0.85 0.1 250)"',   'color: "oklch(0.30 0.10 265)"'),
]

for dark, light in text_replacements:
    content = content.replace(dark, light)

# ── 15. Subscription badge background ────────────────────────────────────────
content = content.replace(
    'background: "oklch(0.3 0.12 250 / 60%)", color: "oklch(0.85 0.1 250)", border: "1px solid oklch(0.55 0.18 250 / 40%)"',
    'background: "oklch(0.93 0.04 265)", color: "oklch(0.30 0.10 265)", border: "1px solid oklch(0.70 0.12 265 / 50%)"'
)

# ── 16. Subtitle text in video player ────────────────────────────────────────
content = content.replace(
    'background: "oklch(0.18 0.02 250 / 0.9)",\n          border: "1px solid oklch(0.35 0.04 250 / 0.5)",\n          color: "oklch(0.92 0.01 250)"',
    'background: "oklch(0.97 0.01 265 / 0.95)",\n          border: "1px solid oklch(0.80 0.04 265 / 0.5)",\n          color: "oklch(0.15 0.02 265)"'
)

# ── 17. Table row alternating backgrounds ─────────────────────────────────────
content = content.replace(
    'background: i % 2 === 0 ? "oklch(0.16 0.025 250)" : "oklch(0.18 0.03 250)"',
    'background: i % 2 === 0 ? "oklch(0.98 0.01 265)" : "white"'
)
content = content.replace(
    'background: i % 2 === 0 ? "oklch(0.16 0.02 250)" : "oklch(0.18 0.025 250)"',
    'background: i % 2 === 0 ? "oklch(0.98 0.01 265)" : "white"'
)

# ── 18. Table header background ──────────────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.2 0.04 250)" }}',
    'style={{ background: "oklch(0.94 0.03 265)" }}'
)
content = content.replace(
    'style={{ background: "oklch(0.22 0.03 250)" }}',
    'style={{ background: "oklch(0.94 0.02 265)" }}'
)

# ── 19. Table header text colors ─────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.7 0.15 250)"',
    'color: "oklch(0.35 0.15 265)"'
)

# ── 20. Rapport killer header bg ─────────────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.2 0.06 15)" }}',
    'style={{ background: "oklch(0.96 0.04 15)" }}'
)

# ── 21. Rapport killer body bg ───────────────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.16 0.02 250)" }}',
    'style={{ background: "oklch(0.98 0.01 265)" }}'
)

# ── 22. AER formula backgrounds ──────────────────────────────────────────────
content = content.replace(
    'bg: "oklch(0.18 0.06 250)"',
    'bg: "oklch(0.95 0.04 265)"'
)
content = content.replace(
    'bg: "oklch(0.18 0.06 60)"',
    'bg: "oklch(0.97 0.04 60)"'
)
content = content.replace(
    'bg: "oklch(0.16 0.06 145)"',
    'bg: "oklch(0.95 0.05 145)"'
)
content = content.replace(
    'border: "oklch(0.45 0.18 250 / 40%)"',
    'border: "oklch(0.70 0.12 265 / 50%)"'
)
content = content.replace(
    'border: "oklch(0.45 0.15 60 / 40%)"',
    'border: "oklch(0.70 0.12 60 / 50%)"'
)
content = content.replace(
    'border: "oklch(0.45 0.18 145 / 40%)"',
    'border: "oklch(0.60 0.18 145 / 50%)"'
)

# ── 23. AER text colors ───────────────────────────────────────────────────────
content = content.replace(
    'color: "oklch(0.65 0.18 250)"',
    'color: "oklch(0.50 0.20 265)"'
)

# ── 24. Divider lines ─────────────────────────────────────────────────────────
content = content.replace(
    'background: "oklch(0.25 0.04 250)"',
    'background: "oklch(0.85 0.02 265)"'
)

# ── 25. Install page step number bg ──────────────────────────────────────────
content = content.replace(
    'background: "oklch(0.55 0.22 250)", color: "white"',
    'background: "oklch(0.50 0.20 265)", color: "white"'
)
content = content.replace(
    'background: "oklch(0.55 0.18 180)", color: "white"',
    'background: "oklch(0.50 0.18 180)", color: "white"'
)

# ── 26. Mirror & Match number badge ──────────────────────────────────────────
content = content.replace(
    'background: "oklch(0.3 0.12 250)", color: "oklch(0.85 0.1 250)"',
    'background: "oklch(0.90 0.08 265)", color: "oklch(0.35 0.15 265)"'
)

# ── 27. Rapport block accordion header ───────────────────────────────────────
content = content.replace(
    'style={{ background: "oklch(0.22 0.03 250)" }}\n                      >',
    'style={{ background: "oklch(0.95 0.02 265)" }}\n                      >'
)
content = content.replace(
    'style={{ background: "oklch(0.22 0.03 250)" }}\n                    >',
    'style={{ background: "oklch(0.95 0.02 265)" }}\n                    >'
)

# ── 28. Objection tab label color ────────────────────────────────────────────
content = content.replace(
    'className="text-sm uppercase tracking-widest font-semibold text-center" style={{ color: "oklch(0.92 0.005 250)"',
    'className="text-sm uppercase tracking-widest font-semibold text-center" style={{ color: "oklch(0.40 0.02 265)"'
)

# ── 29. textShadow glow effects → remove ─────────────────────────────────────
content = re.sub(r', textShadow: "0 0 12px [^"]*"', '', content)

# ── 30. bg-black video container → bg-gray-900 ───────────────────────────────
content = content.replace('className="relative w-full rounded-xl overflow-hidden bg-black"', 
                           'className="relative w-full rounded-xl overflow-hidden bg-gray-900"')

# ── 31. Design comment at top ────────────────────────────────────────────────
content = content.replace(
    'DESIGN PHILOSOPHY: Dark Command Centre\n  - Deep navy (#0F1923) background for focus during live calls\n  - Colour-coded objection buttons: navy blue, teal, burgundy',
    'DESIGN PHILOSOPHY: Clean Professional Light\n  - White / light-gray backgrounds — airy, modern\n  - Colour-coded objection buttons: indigo, teal, orange'
)

with open("client/src/pages/Home.tsx", "w") as f:
    f.write(content)

print("Done! Home.tsx converted to light theme.")
