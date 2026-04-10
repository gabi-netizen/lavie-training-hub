# Lavie Labs Training Hub — TODO

## Core Features
- [x] Home screen with navigation cards
- [x] Live Call Script tab — full word-for-word call flow
- [x] Rapport tab — rapport building techniques and opening lines
- [x] Cheat Sheet tab — quick reference for pitch, walkthrough, and close
- [x] Objections tab — 3 objection handlers with video players (dual-buffer A/B swap)
- [x] Product Value tab — value stack, why Lavie Labs, price reframes
- [x] Call Diagnostics tab — 8 diagnostics with symptom/root cause/fix/power line
- [x] Install instructions tab — how to add app to home screen (iOS & Android)
- [x] Dark Command Center design theme (deep navy, OKLCH colors)
- [x] Space Grotesk + DM Sans + Playfair Display fonts
- [x] Color-coded objection buttons (navy blue, teal, burgundy)
- [x] Video player with dual-buffer A/B swap for seamless clip transitions
- [x] Subtitles per video clip
- [x] Fade-in animations on tab switches
- [x] Sticky header with Lavie Labs branding
- [x] Tab navigation bar (hidden on home screen)
- [x] Coaching notes with green glow styling
- [x] Script blocks with left border accent
- [x] Accordion sections for Product Value tab
- [x] Database integration (users table with auth)
- [x] Manus OAuth authentication

## Pending / Future
- [ ] User progress tracking (which sections viewed)
- [ ] Admin panel for managing content
- [ ] Push notifications for new training content
- [x] Remove user approval requirement — allow all users to access without owner approval (platform-level: site is set to Public)

## AI Call Coach Feature
- [x] Add DEEPGRAM_API_KEY and OPENAI_API_KEY as secrets
- [x] Add call_analyses table to database schema
- [x] Build server: file upload endpoint (/api/call-upload), Deepgram transcription, OpenAI GPT-4 analysis
- [x] Build tRPC procedures: startAnalysis, getAnalysis, getMyAnalyses, getAllAnalyses (manager)
- [x] Build AI Call Coach UI: upload zone + analysis report view with scores/recommendations
- [x] Build manager dashboard: list all reps' calls with team avg score and per-rep breakdown
- [x] Add "AI Coach" card to home screen navigation
- [x] Write vitest tests for callAnalysis module
