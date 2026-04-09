# Lavie Labs Training Hub — Design Brainstorm

## Three Design Approaches

<response>
<probability>0.07</probability>
<text>
### Approach A: Clinical Precision
**Design Movement:** Medical-grade minimalism meets Swiss grid design
**Core Principles:** Ruthless clarity, zero decoration, function-first hierarchy, monochrome with one accent
**Color Philosophy:** Off-white (#F8F7F5) background, near-black (#1A1A1A) text, single accent of deep teal (#0D6E6E) — communicates medical authority and trust
**Layout Paradigm:** Strict vertical rhythm, left-aligned text blocks, no centered layouts, content stacked like a clinical report
**Signature Elements:** Thin rule dividers, uppercase section labels in small tracking, monospaced font for scripts
**Interaction Philosophy:** No animations — every interaction is instant and deliberate, like a medical instrument
**Animation:** None. Transitions are 0ms. The UI responds instantly.
**Typography System:** IBM Plex Mono for scripts (clinical, readable), IBM Plex Sans for UI labels — both from the same family for cohesion
</text>
</response>

<response>
<probability>0.08</probability>
<text>
### Approach B: Dark Command Center
**Design Movement:** Dark-mode professional dashboard, inspired by trading terminals and ops centers
**Core Principles:** Dark background for focus, color-coded urgency, high contrast readability, zero eye strain during long shifts
**Color Philosophy:** Deep navy (#0F1923) background, white text, three accent colors matching objection severity — navy blue, teal, burgundy — same as the wireframe buttons
**Layout Paradigm:** Full-bleed dark canvas, content in floating cards with subtle glow borders, tab navigation pinned at top
**Signature Elements:** Glowing border on active tab, color-coded objection buttons with subtle gradient, video player with dark chrome
**Interaction Philosophy:** Tap → immediate response, active states glow, no loading states
**Animation:** Subtle fade-in on tab switch (150ms), button press scales down 2% on tap
**Typography System:** Space Grotesk (bold, modern, slightly technical) for headings, Inter for body — strong contrast between the two
</text>
</response>

<response>
<probability>0.06</probability>
<text>
### Approach C: Warm Professional
**Design Movement:** Elevated corporate warmth — think premium skincare brand meets professional training tool
**Core Principles:** Warm whites and creams, gold accents, premium feel that matches the Lavie Labs brand, approachable but authoritative
**Color Philosophy:** Warm cream (#FAF8F5) background, dark charcoal (#2C2C2C) text, gold accent (#B8860B) for highlights — communicates luxury and trust simultaneously
**Layout Paradigm:** Card-based layout with generous padding, soft shadows, rounded corners, content breathes
**Signature Elements:** Gold underline on active tab, subtle cream-to-white gradient on cards, warm shadow instead of hard borders
**Interaction Philosophy:** Smooth and confident — every tap feels premium, like using a luxury app
**Animation:** 200ms ease-out on tab switch, cards lift slightly on hover/tap (translateY -2px)
**Typography System:** Playfair Display for the app title (luxury, editorial), DM Sans for all body and UI — the contrast between serif and sans creates a premium feel
</text>
</response>

---

## Selected Approach: B — Dark Command Center

**Reasoning:** Sales reps use this tool during live calls, often in office environments with bright screens around them. A dark interface reduces eye strain, the color-coded buttons create instant visual recognition under pressure, and the professional dark aesthetic communicates that this is a serious tool — not a casual app. The navy/teal/burgundy color system matches the wireframe the user already approved.
