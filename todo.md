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
- [x] Add "What AI can and cannot do" disclaimer card to AI Call Coach page

## Call Coach Enhancements
- [x] Add repName, callDate, closeStatus fields to call_analyses schema
- [x] Update upload form with metadata fields (rep name, date, close status)
- [x] Update server procedures to store and return metadata
- [x] Build Leaderboard page: rankings with medals, call count, close rate, Most Improved badge
- [x] Add Leaderboard tab visible to all users in AI Call Coach

## AI Feedback & Training System
- [x] Add callDuration field to call_analyses schema (auto-detected from audio)
- [x] Add ai_feedback table (analysisId, userId, section, issue, comment)
- [x] Add server procedures: submitFeedback, getFeedbackSummary (admin)
- [x] Add "Flag as incorrect" button to analysis report with feedback modal
- [ ] Add avg call duration per rep to leaderboard and manager view
- [x] Add admin Feedback Review panel to see all flagged issues

## Edit Call Details
- [x] Add updateCallDetails tRPC procedure (repName, callDate, closeStatus)
- [x] Add "Edit Details" button in AnalysisReport to update close status, rep name, call date

## Last Edited By Feature
- [x] Add lastEditedByUserId and lastEditedByName columns to call_analyses schema
- [x] Update updateCallDetails helper to accept and store lastEditedBy info
- [x] Update updateCallDetails tRPC procedure to pass ctx.user info to helper
- [x] Display 'Last Edited By' in the analysis report header
- [x] Run pnpm db:push to migrate schema

## Customer Name Auto-Extraction
- [x] Add customerName column to call_analyses schema
- [x] Update CallAnalysisReport interface to include customerName field
- [x] Update AI prompt to extract customer name from transcript
- [x] Store extracted customerName after analysis
- [x] Add customerName to Edit Details modal for manual override
- [x] Display customer name in analysis report header and manager view
- [x] Run pnpm db:push to migrate schema

## Flag Button Visibility
- [x] Make "Flag Incorrect Analysis" button always visible (remove hover-only visibility), keep blue/white colors

## Edit Details - Call Type Field
- [x] Add Call Type dropdown to Edit Details modal (Opening / Cancel Trial / Win Back)

## Call Type Visibility Everywhere
- [x] Show call type badge in analysis report header (next to rep name, date, close status)
- [x] Show call type badge in manager view call rows
- [x] Show call type badge in leaderboard call entries (shown in MyCalls list rows)

## Delete Failed Calls
- [x] Add deleteAnalysis backend helper (only allows deleting error-status calls)
- [x] Add deleteAnalysis tRPC procedure (owner or admin, error-status only)
- [x] Add delete button in AnalysisReport for error-status calls
- [x] Add delete button in MyCalls list for error-status calls
- [x] After delete, navigate back to upload tab

## Manager View — Show All Calls
- [x] Fix Manager View to group calls by repName (not userId) so every call appears regardless of who uploaded it
- [x] Calls with no repName should appear under "Unknown Rep" group
- [x] Add expand/collapse toggle to show all calls per rep (previously limited to 5)

## Talk Ratio Visibility
- [x] Add TalkRatioBadge component showing Rep% vs Customer% with color coding
- [x] Show talk ratio badge in Manager View per-call rows
- [x] Show talk ratio badge in My Calls list rows
- [x] Show talk ratio prominently in AnalysisReport header stats

## Talk Ratio Fix
- [x] Fix repSpeechPct: now identifies rep as the speaker with most total speech time (not hardcoded Speaker 0)
- [x] Redesign TalkRatioBadge: visual mini-bar + percentage + color-coded label (Good / Too much / Too passive)

## Talk Ratio Legend
- [x] Change "Talk:" and "rep" label colors to white in TalkRatioBadge
- [x] Add a prominent TalkRatioLegend card (in English) visible on the AI Coach page above the tabs, showing the 3 color zones

## Prominent Talk Ratio in Report Header
- [x] Add a right-side panel in AnalysisReport header with: large Talk Ratio visual + Deal Status (Closed / Follow-up / Not Closed) displayed prominently

## Prominent Talk Ratio + Deal Status in Report Header
- [x] Add right-side panel in AnalysisReport header: large Talk Ratio circular gauge + Deal Status badge (Closed Deal / Follow-up / Not Closed)

## Cubes in Live Call Script + TalkRatio Tooltip
- [ ] Add motivational cubes section at the top of the Live Call Script tab (before the script sections)
- [ ] Add a condensed info section in Live Call Script tab (key stats, mindset reminders, quick facts)
- [x] Add hover tooltip on TalkRatioBadge in AI Coach showing the 3 zones explanation
