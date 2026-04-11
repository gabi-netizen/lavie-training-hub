#!/usr/bin/env python3
"""Convert CallCoach.tsx dark theme to light theme."""
import re

with open("client/src/pages/CallCoach.tsx", "r") as f:
    content = f.read()

# ── 1. Badge class replacements (dark → light) ────────────────────────────────
badge_replacements = [
    # CallTypeBadge
    ("bg-blue-500/20 text-blue-300 border-blue-500/40",   "bg-blue-50 text-blue-700 border-blue-200"),
    ("bg-amber-500/20 text-amber-300 border-amber-500/40", "bg-amber-50 text-amber-700 border-amber-200"),
    ("bg-purple-500/20 text-purple-300 border-purple-500/40", "bg-purple-50 text-purple-700 border-purple-200"),
    # RepStatusBadge
    ("bg-emerald-500/20 text-emerald-300 border border-emerald-500/40", "bg-emerald-50 text-emerald-700 border border-emerald-200"),
    ("bg-amber-500/20 text-amber-300 border border-amber-500/40",       "bg-amber-50 text-amber-700 border border-amber-200"),
    ("bg-slate-700/60 text-slate-400",                                  "bg-gray-100 text-gray-500"),
    # qualityBadge
    ("bg-emerald-500/20 text-emerald-300 border-emerald-500/30", "bg-emerald-50 text-emerald-700 border-emerald-200"),
    ("bg-amber-500/20 text-amber-300 border-amber-500/30",       "bg-amber-50 text-amber-700 border-amber-200"),
    ("bg-red-500/20 text-red-300 border-red-500/30",             "bg-red-50 text-red-700 border-red-200"),
    # keyMoment badge
    ("bg-emerald-500/20 text-emerald-300 border-emerald-500/40", "bg-emerald-50 text-emerald-700 border-emerald-200"),
    ("bg-red-500/20 text-red-300 border-red-500/40",             "bg-red-50 text-red-700 border-red-200"),
    ("bg-orange-500/20 text-orange-300 border-orange-500/40",    "bg-orange-50 text-orange-700 border-orange-200"),
]
for dark, light in badge_replacements:
    content = content.replace(dark, light)

# ── 2. TalkRatioBadge ─────────────────────────────────────────────────────────
content = content.replace(
    '"relative inline-flex items-center gap-1.5 text-xs border border-slate-600 rounded px-2 py-0.5 bg-slate-800/60 cursor-pointer select-none"',
    '"relative inline-flex items-center gap-1.5 text-xs border border-gray-200 rounded px-2 py-0.5 bg-gray-50 cursor-pointer select-none"'
)
content = content.replace(
    '"text-white font-medium"',
    '"text-gray-700 font-medium"'
)
content = content.replace(
    '"relative inline-block w-14 h-2 rounded-full bg-slate-700 overflow-hidden"',
    '"relative inline-block w-14 h-2 rounded-full bg-gray-200 overflow-hidden"'
)
content = content.replace(
    '"text-white"',
    '"text-gray-700"'
)
# Tooltip popup
content = content.replace(
    'style={{ background: "oklch(0.14 0.04 250)", border: "1px solid oklch(0.35 0.08 250 / 60%)" }}',
    'style={{ background: "white", border: "1px solid oklch(0.85 0.03 265)" }}'
)
content = content.replace(
    '"text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5"',
    '"text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5"'
)

# ── 3. text-white → text-gray-900 (standalone) ───────────────────────────────
content = re.sub(r'\btext-white\b', 'text-gray-900', content)

# ── 4. text-slate-* → text-gray-* ────────────────────────────────────────────
slate_to_gray = [
    ("text-slate-100", "text-gray-800"),
    ("text-slate-200", "text-gray-700"),
    ("text-slate-300", "text-gray-600"),
    ("text-slate-400", "text-gray-500"),
    ("text-slate-500", "text-gray-400"),
    ("text-slate-600", "text-gray-400"),
    ("text-slate-700", "text-gray-300"),
]
for dark, light in slate_to_gray:
    content = content.replace(dark, light)

# ── 5. bg-slate-* → bg-gray-* ────────────────────────────────────────────────
bg_replacements = [
    ("bg-slate-900",    "bg-gray-50"),
    ("bg-slate-800/60", "bg-gray-50"),
    ("bg-slate-800/40", "bg-gray-50"),
    ("bg-slate-800/30", "bg-gray-50"),
    ("bg-slate-800",    "bg-white"),
    ("bg-slate-700/60", "bg-gray-100"),
    ("bg-slate-700",    "bg-gray-100"),
    ("bg-[#0F1923]",    "bg-gray-50"),
    ("bg-[#1a2535]",    "bg-white"),
    ("bg-[#0A1628]",    "bg-gray-50"),
]
for dark, light in bg_replacements:
    content = content.replace(dark, light)

# ── 6. border-slate-* → border-gray-* ────────────────────────────────────────
border_replacements = [
    ("border-slate-800/60", "border-gray-100"),
    ("border-slate-800/40", "border-gray-100"),
    ("border-slate-800",    "border-gray-200"),
    ("border-slate-700/60", "border-gray-200"),
    ("border-slate-700/40", "border-gray-100"),
    ("border-slate-700",    "border-gray-200"),
    ("border-slate-600",    "border-gray-300"),
]
for dark, light in border_replacements:
    content = content.replace(dark, light)

# ── 7. divide-slate-* → divide-gray-* ────────────────────────────────────────
content = content.replace("divide-slate-800/60", "divide-gray-100")
content = content.replace("divide-slate-800",    "divide-gray-100")
content = content.replace("divide-slate-700",    "divide-gray-200")

# ── 8. hover:bg-slate-* → hover:bg-gray-* ────────────────────────────────────
content = content.replace("hover:bg-slate-800/40", "hover:bg-gray-50")
content = content.replace("hover:bg-slate-800",    "hover:bg-gray-50")
content = content.replace("hover:bg-slate-700/40", "hover:bg-gray-100")
content = content.replace("hover:bg-slate-700",    "hover:bg-gray-100")

# ── 9. Dark oklch backgrounds ─────────────────────────────────────────────────
dark_oklch_bgs = [
    ('"oklch(0.14 0.04 250)"',  '"white"'),
    ('"oklch(0.16 0.04 250)"',  '"white"'),
    ('"oklch(0.18 0.04 250)"',  '"oklch(0.97 0.02 265)"'),
    ('"oklch(0.2 0.04 250)"',   '"oklch(0.96 0.02 265)"'),
    ('"oklch(0.22 0.04 250)"',  '"oklch(0.95 0.02 265)"'),
    ('"oklch(0.14 0.03 250)"',  '"white"'),
    ('"oklch(0.16 0.03 250)"',  '"white"'),
    ('"oklch(0.18 0.03 250)"',  '"oklch(0.97 0.02 265)"'),
    ('"oklch(0.2 0.03 250)"',   '"oklch(0.96 0.02 265)"'),
    ('"oklch(0.22 0.03 250)"',  '"oklch(0.95 0.02 265)"'),
    ('"oklch(0.14 0.025 250)"', '"white"'),
    ('"oklch(0.16 0.025 250)"', '"white"'),
    ('"oklch(0.18 0.025 250)"', '"oklch(0.97 0.02 265)"'),
    ('"oklch(0.13 0.025 250)"', '"oklch(0.97 0.01 265)"'),
    ('"oklch(0.15 0.025 250)"', '"white"'),
    ('"oklch(0.12 0.02 250)"',  '"oklch(0.97 0.01 265)"'),
    ('"oklch(0.14 0.02 250)"',  '"white"'),
    ('"oklch(0.16 0.02 250)"',  '"white"'),
    ('"oklch(0.18 0.02 250)"',  '"oklch(0.97 0.01 265)"'),
    ('"oklch(0.2 0.02 250)"',   '"oklch(0.96 0.01 265)"'),
    ('"oklch(0.22 0.02 250)"',  '"oklch(0.95 0.01 265)"'),
]
for dark, light in dark_oklch_bgs:
    content = content.replace(f'background: {dark}', f'background: {light}')

# ── 10. Dark oklch borders ────────────────────────────────────────────────────
dark_oklch_borders = [
    ('"1px solid oklch(0.3 0.06 250)"',  '"1px solid oklch(0.88 0.02 265)"'),
    ('"1px solid oklch(0.28 0.05 250)"', '"1px solid oklch(0.88 0.02 265)"'),
    ('"1px solid oklch(0.25 0.04 250)"', '"1px solid oklch(0.88 0.02 265)"'),
    ('"1px solid oklch(0.35 0.08 250 / 60%)"', '"1px solid oklch(0.85 0.03 265)"'),
    ('"1px solid oklch(0.35 0.06 250)"', '"1px solid oklch(0.85 0.03 265)"'),
    ('"1px solid oklch(0.3 0.04 250)"',  '"1px solid oklch(0.88 0.02 265)"'),
    ('"2px solid oklch(0.55 0.22 250)"', '"2px solid oklch(0.55 0.20 265)"'),
    ('"2px solid oklch(0.55 0.2 250)"',  '"2px solid oklch(0.55 0.20 265)"'),
    ('"2px solid oklch(0.55 0.18 250)"', '"2px solid oklch(0.55 0.18 265)"'),
    ('"2px solid oklch(0.5 0.2 250)"',   '"2px solid oklch(0.55 0.20 265)"'),
    ('"2px solid oklch(0.5 0.18 250)"',  '"2px solid oklch(0.55 0.18 265)"'),
    ('"2px solid oklch(0.45 0.18 250)"', '"2px solid oklch(0.55 0.18 265)"'),
]
for dark, light in dark_oklch_borders:
    content = content.replace(f'border: {dark}', f'border: {light}')

# ── 11. Dark oklch text colors ────────────────────────────────────────────────
dark_text_colors = [
    ('"oklch(0.92 0.01 250)"', '"oklch(0.20 0.02 265)"'),
    ('"oklch(0.88 0.02 250)"', '"oklch(0.25 0.02 265)"'),
    ('"oklch(0.85 0.03 250)"', '"oklch(0.30 0.02 265)"'),
    ('"oklch(0.8 0.04 250)"',  '"oklch(0.30 0.03 265)"'),
    ('"oklch(0.75 0.05 250)"', '"oklch(0.35 0.03 265)"'),
    ('"oklch(0.7 0.05 250)"',  '"oklch(0.40 0.03 265)"'),
    ('"oklch(0.65 0.05 250)"', '"oklch(0.45 0.03 265)"'),
    ('"oklch(0.6 0.04 250)"',  '"oklch(0.45 0.03 265)"'),
    ('"oklch(0.55 0.04 250)"', '"oklch(0.50 0.03 265)"'),
    ('"oklch(0.5 0.04 250)"',  '"oklch(0.50 0.03 265)"'),
    ('"oklch(0.45 0.04 250)"', '"oklch(0.50 0.03 265)"'),
    ('"oklch(0.6 0.01 250)"',  '"oklch(0.45 0.02 265)"'),
    ('"oklch(0.55 0.01 250)"', '"oklch(0.50 0.02 265)"'),
    ('"oklch(0.5 0.01 250)"',  '"oklch(0.50 0.02 265)"'),
    # Accent colors — keep vivid but darken for light bg
    ('"oklch(0.82 0.22 145)"', '"oklch(0.45 0.22 145)"'),
    ('"oklch(0.75 0.2 145)"',  '"oklch(0.40 0.20 145)"'),
    ('"oklch(0.72 0.18 145)"', '"oklch(0.40 0.18 145)"'),
    ('"oklch(0.65 0.2 15)"',   '"oklch(0.55 0.22 15)"'),
    ('"oklch(0.65 0.15 250)"', '"oklch(0.50 0.18 265)"'),
    ('"oklch(0.72 0.18 250)"', '"oklch(0.45 0.18 265)"'),
    ('"oklch(0.55 0.22 250)"', '"oklch(0.50 0.20 265)"'),
    ('"oklch(0.55 0.18 250)"', '"oklch(0.50 0.18 265)"'),
]
for dark, light in dark_text_colors:
    content = content.replace(f'color: {dark}', f'color: {light}')

# ── 12. Score circle / ring backgrounds ──────────────────────────────────────
content = content.replace(
    'className="w-24 h-24 rounded-full flex items-center justify-center"',
    'className="w-24 h-24 rounded-full flex items-center justify-center bg-white shadow-sm"'
)

# ── 13. Card / section backgrounds ───────────────────────────────────────────
content = content.replace(
    'className="rounded-xl border border-gray-200 bg-[#1a2535]',
    'className="rounded-xl border border-gray-200 bg-white'
)
content = content.replace(
    'className="rounded-xl border border-gray-200 bg-[#0F1923]',
    'className="rounded-xl border border-gray-200 bg-white'
)

# ── 14. placeholder text ──────────────────────────────────────────────────────
content = content.replace("placeholder:text-gray-300", "placeholder:text-gray-400")
content = content.replace("placeholder:text-slate-600", "placeholder:text-gray-400")
content = content.replace("placeholder:text-slate-500", "placeholder:text-gray-400")

# ── 15. Input/Textarea backgrounds ───────────────────────────────────────────
content = content.replace(
    'className="bg-gray-50 border-gray-200 text-gray-900',
    'className="bg-white border-gray-200 text-gray-900'
)

# ── 16. Page wrapper ──────────────────────────────────────────────────────────
content = content.replace(
    'className="min-h-screen bg-[#0F1923]',
    'className="min-h-screen bg-gray-50'
)
content = content.replace(
    'className="min-h-screen bg-[#0A1628]',
    'className="min-h-screen bg-gray-50'
)

# ── 17. textShadow glow effects → remove ─────────────────────────────────────
content = re.sub(r',?\s*textShadow:\s*"[^"]*"', '', content)

# ── 18. Leaderboard rank colors ───────────────────────────────────────────────
content = content.replace(
    '"text-yellow-400"',
    '"text-yellow-500"'
)
content = content.replace(
    '"text-slate-400"',
    '"text-gray-400"'
)

# ── 19. Emerald accent text (keep vivid) ─────────────────────────────────────
content = content.replace("text-emerald-400", "text-emerald-600")
content = content.replace("text-emerald-300", "text-emerald-600")
content = content.replace("text-teal-400",    "text-teal-600")
content = content.replace("text-teal-300",    "text-teal-600")
content = content.replace("text-blue-400",    "text-blue-600")
content = content.replace("text-blue-300",    "text-blue-600")
content = content.replace("text-amber-400",   "text-amber-600")
content = content.replace("text-amber-300",   "text-amber-600")
content = content.replace("text-red-400",     "text-red-600")
content = content.replace("text-red-300",     "text-red-600")
content = content.replace("text-purple-400",  "text-purple-600")
content = content.replace("text-purple-300",  "text-purple-600")
content = content.replace("text-indigo-400",  "text-indigo-600")
content = content.replace("text-orange-400",  "text-orange-600")
content = content.replace("text-orange-300",  "text-orange-600")

# ── 20. bg-emerald/teal/blue accent backgrounds ───────────────────────────────
content = content.replace("bg-emerald-500/20", "bg-emerald-50")
content = content.replace("bg-emerald-500/10", "bg-emerald-50")
content = content.replace("bg-teal-500/20",    "bg-teal-50")
content = content.replace("bg-teal-500/10",    "bg-teal-50")
content = content.replace("bg-blue-500/20",    "bg-blue-50")
content = content.replace("bg-blue-500/10",    "bg-blue-50")
content = content.replace("bg-amber-500/20",   "bg-amber-50")
content = content.replace("bg-amber-500/10",   "bg-amber-50")
content = content.replace("bg-red-500/20",     "bg-red-50")
content = content.replace("bg-red-500/10",     "bg-red-50")
content = content.replace("bg-purple-500/20",  "bg-purple-50")
content = content.replace("bg-purple-500/10",  "bg-purple-50")
content = content.replace("bg-orange-500/20",  "bg-orange-50")
content = content.replace("bg-orange-500/10",  "bg-orange-50")
content = content.replace("bg-indigo-500/20",  "bg-indigo-50")
content = content.replace("bg-indigo-500/10",  "bg-indigo-50")

# ── 21. hover:bg-emerald/teal accent ─────────────────────────────────────────
content = content.replace("hover:bg-emerald-600/50", "hover:bg-emerald-100")
content = content.replace("hover:bg-emerald-600/20", "hover:bg-emerald-50")
content = content.replace("hover:bg-teal-600/50",    "hover:bg-teal-100")

# ── 22. bg-emerald-600/20 → bg-emerald-50 ────────────────────────────────────
content = content.replace("bg-emerald-600/20", "bg-emerald-50")
content = content.replace("bg-emerald-600/80", "bg-emerald-600")

# ── 23. Progress bar background ──────────────────────────────────────────────
content = content.replace("[&>div]:bg-emerald-500", "[&>div]:bg-emerald-500")  # keep
content = content.replace("bg-slate-700 [&>div]", "bg-gray-200 [&>div]")

# ── 24. Dialog / modal backgrounds ───────────────────────────────────────────
content = content.replace(
    'className="bg-[#0F1923] border-slate-700',
    'className="bg-white border-gray-200'
)
content = content.replace(
    'className="bg-[#1a2535] border-slate-700',
    'className="bg-white border-gray-200'
)

with open("client/src/pages/CallCoach.tsx", "w") as f:
    f.write(content)

print("Done! CallCoach.tsx converted to light theme.")
