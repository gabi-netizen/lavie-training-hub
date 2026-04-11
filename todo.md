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

## Colour Zone Ordering (Green → Amber → Red)
- [x] Fix TalkRatioBadge tooltip zone order: Green first, then Amber, then Red
- [x] Fix TalkRatioLegend card zone order: Green first, then Amber, then Red
- [x] Audit and fix any other colour zone lists in CallCoach.tsx and Home.tsx (Home.tsx had none)

## 5-Tier Rep Status Badge (Needs Work → Developing → On Track → Proficient → Elite)
- [x] Create getRepStatus(score) helper: 0-39=Needs Work(red), 40-54=Developing(orange), 55-69=On Track(amber), 70-84=Proficient(green), 85-100=Elite(teal/gold)
- [x] Create RepStatusBadge component showing tier name + colour
- [x] Replace "avg" label in Manager View with RepStatusBadge (calculated from last 5 calls)
- [x] Show RepStatusBadge in Leaderboard next to rep score
- [x] Show RepStatusBadge in My Calls next to individual call score

## Team Performance Dashboard + Rep Profile Card
- [x] Add server procedure: getTeamDashboard - returns all reps with all-time avg, last-10 avg, trend, category scores, rank, call count
- [x] Build Team Dashboard tab (new tab in AI Coach) with rep cards grid: avatar initials, name, status badge, trend indicator (Improving/Stable/Declining), score
- [x] Build Rep Profile Card modal: opens on rep name click, shows score history chart, category breakdown bars, rank in team, talk ratio avg, best/worst call
- [x] Make Team Dashboard visible to all users (reps + managers), not just admins

## Team Dashboard Fix — Show All Reps + Table Layout
- [x] Fix getTeamDashboard to group by repName (not userId) so all calls appear regardless of who uploaded
- [x] Convert Team Dashboard UI from card grid to ranked table (sorted #1 top to last bottom)
- [x] Ensure reps with no userId (uploaded by manager) still appear in the table

## CloudTalk Integration
- [x] Store CLOUDTALK_API_KEY and CLOUDTALK_API_SECRET as secrets
- [x] Verify API key works against CloudTalk API
- [x] Build Dialler page with CloudTalk iframe embed (phone.cloudtalk.io)
- [x] Add window.postMessage event listener for: ringing, dialing, calling, hangup, ended, contact_info
- [x] Build contact card popup that auto-opens with caller name, number, company when call starts
- [x] Add note-taking field on contact card (saved per call)
- [x] Add new "Dialler" route in App.tsx

## Top Nav Redesign (CRM Layout)
- [x] Build persistent TopNav component: Lavie Labs logo + nav tabs + user avatar/logout
- [x] Nav tabs: Dialler | Training | AI Coach | Team | Leaderboard
- [x] Wrap all pages in AppLayout that renders TopNav at the top
- [x] Move Dialler to default landing page (/) for logged-in users
- [x] Training tab = current Home.tsx content (script, objections, cheat sheet etc.)
- [x] AI Coach tab = current CallCoach.tsx (upload + my calls + manager view)
- [x] Team tab = Team Dashboard (currently inside AI Coach)
- [x] Leaderboard tab = Leaderboard (currently inside AI Coach)
- [x] Mobile: top nav collapses to icon bar at bottom of screen

## Customer Card CRM System
- [x] Add `contacts` table to DB schema: id, name, email, phone, leadType, status, agentName, notes, robNotes, importedAt, updatedAt
- [x] Add `callNotes` table: id, contactId, agentId, note, createdAt
- [x] Run pnpm db:push to migrate
- [x] Server: importContacts procedure (parse CSV, upsert by email/phone)
- [x] Server: listContacts procedure (search, filter by leadType/status, pagination)
- [x] Server: getContact procedure (single contact with call notes)
- [x] Server: updateContact procedure (status, notes)
- [x] Server: addCallNote procedure
- [x] Build Contacts page: search bar + filter chips + contacts table
- [x] Build Contact Card modal: name/phone/email, lead type badge, status dropdown, click-to-call button, notes history, add note form
- [x] Add Contacts tab to TopNav
- [x] CSV import UI: upload button + column mapping + preview before import
- [x] Click-to-call from Contacts page and Dialler quick-dial panel
- [x] Quick Dial panel in Dialler right panel (search contacts, dial instantly)

## Role-Based Access Control (Admin vs Agent)
- [x] Protect contacts tRPC router — all procedures require admin role
- [x] Protect Dialler page — redirect non-admins to /training
- [x] Hide Dialler + Contacts tabs from TopNav for non-admin users
- [x] Add adminProcedure middleware to server/routers.ts
- [x] Promote owner user to admin in the database (Gabi Lavie already admin)
- [x] Build full customer card page /contacts/:id with 3-column CRM layout

## ContactCard Redesign
- [x] Redesign ContactCard with white/light background, professional proportions, clean CRM layout

## Email Integration (Postmark + ActiveCampaign)
- [x] Add POSTMARK_API_KEY secret
- [x] Build server/email.ts helper using Postmark API
- [x] Add email tRPC procedures: sendConfirmation, sendCallbackReminder, sendStatusUpdate
- [x] Add ACTIVECAMPAIGN_API_URL and ACTIVECAMPAIGN_API_KEY secrets
- [x] Build server/activecampaign.ts helper (add contact, trigger automation)
- [x] Wire email triggers to contact card: payment confirmation, callback reminder, status change

## ContactCard Action Panel
- [x] Redesign ContactCard: centralized Call/WhatsApp/Email/SMS action buttons near customer name, with quick call status change

## CRM Desktop Optimization
- [x] Contacts list: desktop-first layout, wider table, proper column widths, no mobile stacking
- [x] ContactCard: desktop-first 3-column layout, better proportions, full screen space utilization

## Agent Email System (trial+[agent]@lavielabs.com)
- [x] Add agentEmail field to contacts DB schema and migrate
- [x] Add sendEmailToContact tRPC procedure (sends via Postmark from trial+agent address)
- [x] Add compose email modal in ContactCard with subject + body fields
- [x] Show agent sub-address in ContactCard left panel
- [x] Add agent email column to Contacts list

## Light Theme Conversion (Full App)
- [x] Update global CSS variables in index.css to light theme (white bg, dark text, indigo accents)
- [x] Redesign TopNav and AppLayout to light theme
- [x] Redesign Home.tsx (Training page) to light theme
- [x] Redesign Dialler page to light theme
- [x] Redesign CallCoach (AI Coach) page to light theme
- [x] Verify Contacts and ContactCard pages (already light, fix any remaining dark elements)
