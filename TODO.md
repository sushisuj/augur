# Augur — Development To-Do

Work top to bottom. Each section unblocks the next.

---

## 1. Housekeeping (do first)

- [x] **Git commit all current changes**
  - Files: `app/results.tsx`, `supabase/functions/vehicle-lookup/index.ts`, `supabase/functions/vehicle-lookup/scoring.ts`, `supabase/functions/vehicle-lookup/scoring.test.ts`
  - Suggested message: `feat: scoring algorithm, fraud detection, results UI overhaul`

- [x] **Run scoring.test.ts properly**
  - `cd augur/supabase/functions/vehicle-lookup && deno run scoring.test.ts`
  - Should see 11 passed, 0 failed. Fix any failures before moving on.

- [x] **EAS build — get app on a physical device**
  - Expo Go now supports SDK 56 natively — no EAS dev build needed for JS changes
  - Install Expo Go from Play Store / App Store, scan QR, get live reload
  - EAS still required for production builds / TestFlight / native module additions

---

## 2. Data Pipeline — Summer Priority

This is the foundation everything else depends on. The supervisor's concern was that the data layer isn't verifiable enough. These tasks address that directly before any more frontend work happens.

### 2a. DVSA Anonymised MOT Test Data (Primary Source)

- [x] **Download the 2024 bulk dataset from GOV.UK**
  - Two files: test results file + failure items file
  - Join on shared test identifier to link outcomes to failure reasons

- [x] **Write an ingestion script**
  - Calculate model-level pass rates per make/model/age bracket
  - Rank the most frequent failure reasons per make/model/age
  - Output: structured rows ready for Supabase import

- [x] **Import into Supabase**
  - New table: `mot_aggregate` (make, model, year_from, year_to, failure_reason, frequency, pass_rate)
  - This replaces the manually seeded `faults` table as the primary reliability source
  - Keep manually seeded data — it gets a `source: "curated"` provenance tag

### 2b. DVSA Vehicle Recall Data (Safety Layer)

- [x] **Download the DVSA recall dataset from GOV.UK**
  - Fields: make, model, defect description, remedy, build date range of affected vehicles

- [x] **Import into Supabase**
  - New table: `recalls` (make, model, defect, remedy, build_date_from, build_date_to)
  - Filter at query time by the specific vehicle's build date — no hard age cutoff needed

- [x] **Wire up to Edge Function**
  - When a reg is looked up, query `recalls` filtered by make + model + vehicle build date
  - Surface relevant recalls in the results — these are safety-critical, show them prominently
  - Provenance tag: `"DVSA Recall"`

### 2c. Honest John Data Curation (Supplementary Source)

- [ ] **Manually curate known faults from Honest John Carbycar**
  - Focus on the initial set of models Augur covers (popular UK used cars)
  - Covers faults that don't appear in MOT records: electrical issues, premature wear, recurring mechanical problems
  - Enter into existing `faults` table with `source: "Honest John"` and `provenance: "curated"`

- [ ] **Attribution**
  - Every Honest John record must carry full attribution in the DB
  - UI must display "Source: Honest John" on any claim drawn from this data

---

## 3. Custom Internal API with Keyword Indexing

This is a core technical contribution, not just a backend task. The AI layer currently generates summaries from a flat prompt. This replaces that with a queryable, indexed data layer the AI retrieves from at runtime — grounding outputs in verifiable records rather than training knowledge.

- [x] **Enable Postgres full-text search on `faults` and `recalls` tables**
  - Add `tsvector` columns to both tables
  - Create GIN indexes for fast keyword lookup
  - Test queries: searching "brake", "gearbox slip", "electrical fault" should return ranked relevant records

- [x] **Build a new Edge Function: `fault-search`**
  - Accepts: `make`, `model`, `year`, `keywords[]`
  - Queries `faults` + `recalls` + `mot_aggregate` using full-text search
  - Returns: ranked fault records with source, severity, frequency, and provenance tag
  - This is the endpoint the AI (and later the diagnosis module) calls

- [x] **Update `vehicle-lookup` to call `fault-search` instead of direct DB query**
  - Currently does `.ilike("make", ...).ilike("model", ...)` — swap for `fault-search` call
  - Every fault in the Gemini prompt now comes from an indexed, attributed API response
  - This makes every AI claim auditable: you can trace it back to a specific DB record

- [x] **Provenance tagging on all API responses**
  - Every record returned by `fault-search` carries a provenance tag: `"DVSA MOT"`, `"DVSA Recall"`, `"Honest John"`, or `"Augur Research"`
  - Pass provenance tags through to the frontend — display source on each fault card in the results UI
  - Provenance tags in use: `"DVSA MOT"`, `"DVSA Recall"`, `"Honest John"`, `"Augur Research"`

---

## 4. Vehicle Diagnosis Module

Depends on Section 3 being in place. The confidence scores come from indexed fault records, not model inference — this is what makes them auditable.

### 4a. Edge Function: `vehicle-diagnose`

- [x] **Create `supabase/functions/vehicle-diagnose/index.ts`**
  - Accepts: `make`, `model`, `year`, `symptom` (free text)
  - Disable JWT verification in Supabase dashboard after deploy

- [x] **Step 1 — LLM keyword extraction (Gemini call 1)**
  - Gemini extracts 3–5 keywords from the symptom and returns a JSON array
  - Falls back to space-splitting if JSON parse fails

- [x] **Step 2 — fault-search lookup**
  - Calls `fault-search` internally with `make`, `model`, `year`, `keywords`
  - Returns candidate faults across all three provenance sources

- [x] **Step 3 — semantic relevance scoring (Gemini call 2)**
  - Sends original symptom + candidate fault descriptions to Gemini
  - Returns relevance scores 0.0–1.0 per fault

- [x] **Step 0 — symptom-to-system classification (Gemini call 0)** ← added this session
  - Runs in parallel with keyword extraction (no added latency)
  - Classifies symptom into one of 15 vehicle systems: Brakes, Engine, Steering, etc.
  - Returns `vehicle_system` + `system_confidence` (high/medium/low) in response

- [x] **Step 4 — confidence calculation** ← rebalanced this session
  - Old: `relevance × provenance_weight × 200` — structurally capped MOT faults at 30%
  - New: `(relevance × 0.70 + provenance_bonus × 0.30) × 100` — relevance dominates
  - Provenance bonuses: DVSA Recall 1.00, HJ/Augur 0.80, DVSA MOT 0.50
  - Filter: `relevance >= 25% AND confidence >= 20` — prevents zero-relevance recalls surfacing
  - Scoring prompt made strict: Gemini penalised for loose/indirect connections

- [x] **Step 5 — AI fallback guidance (Gemini call 3, conditional)** ← added this session
  - Only fires when diagnoses array is empty after filtering
  - Gemini produces 2–3 sentences of general guidance: system likely involved, what a mechanic checks, recommendation to inspect
  - Explicitly told not to invent specific fault names or part numbers
  - Returned as `fallback_guidance` string (null if not triggered)

- [x] **Deploy and test**
  - Tested with: Ford Mondeo 2018 "engine knocking in gear 2" → valid recall matches
  - Tested with: "windscreen fogs inside with heater on" → A/C compressor recall at 86%
  - Tested with: "car smells like birthday cake when accelerating" → exhaust/cooling recalls at 93%/90% (legitimate connection — sweet smell = coolant burning)
  - Tested with: "car only breaks down on Tuesdays" → fallback guidance fires correctly
  - Tested with: "duck quacking when reversing" → steering/suspension results (legitimate — worn CV/ball joint)
  - Accidental test: deploy command pasted as symptom → Gemini correctly identified it as a software command

### 4b. App UI

- [x] **Add entry point to `results.tsx`**
  - Glass card button above the HPI banner, passes `make`, `model`, `year` as route params

- [x] **Create `app/diagnose.tsx`**
  - Pre-filled vehicle chip when navigating from results; manual Make/Model/Year fields when opening standalone
  - Free-text symptom input (min 5 chars to enable submit)
  - Calls `vehicle-diagnose` Edge Function via GET with query params

- [x] **Diagnosis results UI**
  - Ranked cards with confidence circle (coloured ≥70% red, ≥40% amber, <40% grey)
  - Provenance badge per card; caveat banner at top
  - Vehicle system classification badge above results ("Classified as · Brakes")
  - AI fallback guidance card (amber left border, "AI GUIDANCE · not from verified records") when no DB matches
  - Three-tier graceful degradation: verified results → fallback guidance → empty state

---

## 5. App Features (continue after data pipeline)

These were already planned but depended on the data layer being solid first.

### 5a. Loading screen — progress steps

- [x] Replace blank spinner with sequential step messages
  - Steps: "Fetching MOT history" → "Checking active recalls" → "Analysing fault patterns" → "Generating buyer summary"
  - `useEffect` with `setInterval` advancing every 1.6s while `loading === true`
  - Dots: empty (pending) → accent spinner (active) → filled ✓ (done)
  - Reg plate shown large above the steps

### 5b. Onboarding survey

- [x] **Create `app/onboarding.tsx`** — 5-step paginated survey
  - Step 1 (usage, single-select): Daily commuter, Family car, Cheap car, City car, Workhorse
  - Step 2 (body_type, multi-select grid): Hatchback, Saloon, Estate, SUV, Coupé, Convertible, Pickup & Van
  - Step 3 (transmission, single-select): Manual, Automatic, No preference ← added
  - Step 4 (budget, single-select): Under £500, £500–£1,500, £1,500–£3,000, No set limit
  - Step 5 (seller, single-select): Main dealer, Independent dealer, Private seller, Not sure yet
  - Progress bar, Back button from step 2 onward, Skip survey link
  - Answers persisted to AsyncStorage under `augur_persona` on survey completion
  - Routes to `/recommendations` on finish

- [x] **Gate on first launch**
  - In `_layout.tsx`, read `augur_persona` on mount
  - If key doesn't exist, redirect to `/onboarding`
  - `recommendations` screen registered in Stack

- [x] **Settings screen**
  - `app/settings.tsx` — Profile (retake survey), Account (change password, sign out), About (version, data sources, How Augur works)

- [x] **Transparency / methodology screen**
  - `app/transparency.tsx` — scoring, fraud detection, diagnosis confidence, data sources, AI grounding, limitations
  - Linked from Settings → About → "How Augur works"

- [x] **Recommendations screen**
  - `app/recommendations.tsx` — persona-matched car suggestions
  - 10 cars per usage category across all 5 categories (50 cars total)
  - Body-type proximity ranking within each pool
  - "Augur's Choice" badge on primary pick; running cost badge; rationale text; DB-grounded AI summary
  - Staggered fetch (1s intervals) to avoid Groq free-tier rate limits
  - 4s timeout changes spinner text; three-state summary (loading/failed/done)

- [x] **Model report screen (no reg required)**
  - `app/model-report.tsx` — aggregate report by make/model/year
  - "Don't have the reg?" entry added to home screen alongside reg/VIN modes
  - MOT pass rate with colour-coded verdict (Great / Good / Average / Below average)
  - Numeric DVSA RfR codes translated to plain English via Groq
  - Known faults with provenance badges, active recalls
  - AI summary grounded in DB records; clear "model-level data" caveat banner
  - `model-summary` Edge Function extended: returns raw arrays, pass_rate, total_tests, verdict

### 5b-extra. Misc UI fixes (completed)

- [x] **Limited data banner** — shown when `population.total_tests < 50`; "Very limited data" tier for < 10
  - Discovered via Aixam Crossline test: niche vehicles get vague Gemini summaries with no fault data
  - Augur degrades gracefully — shows raw numbers rather than hallucinating reliability claims

- [x] **Reg plate normalisation** — `AB12CDE` → `AB12 CDE` before API call
  - DVSA API returns HTTP 500 on unspaced plates; normaliser inserts space at position 4 for standard 7-char UK format

- [x] **Dashboard scrollable** — switched from `View` to `ScrollView` with `flexGrow: 1` to fix layout on small screens

### 5c. Pass persona to Edge Function

- [ ] Read persona from AsyncStorage in `results.tsx` before fetch
- [ ] Append as query param: `?reg=${reg}&persona=${persona ?? 'none'}`
- [ ] Read in `index.ts`: `url.searchParams.get('persona')`

### 5d. Split AI summary + persona tone

- [ ] Two-section prompt in `index.ts`:
  - "This car" — vehicle-specific MOT findings
  - "This model" — population-level reliability from DB
- [ ] Persona tone rules:
  - `daily_commuter`: reliability focus, flag anything suggesting frequent repairs
  - `family_car`: safety-critical failures first, include NCAP rating if Gemini knows it, mention space/practicality
  - `first_car`: simplest possible language, mention insurance group and running costs, extra caution on recurring failures
- [ ] Return `{ summary_vehicle, summary_model }` instead of single `summary`
- [ ] Update `results.tsx` type and UI to show two summary cards

---

## 6. LLM Evaluation (Research Contribution)

The supervisor explicitly called this out as a standalone academic contribution. Don't skip it.

- [ ] **Define evaluation criteria**
  - Accuracy: does the summary correctly reflect the underlying data?
  - Hallucination rate: does the model invent faults not in the prompt?
  - Tone adherence: does persona adjustment actually change the output?
  - Latency: response time per model

- [ ] **Build a small ground-truth dataset**
  - 10-15 vehicles with known histories (EN62LSK as the fraud case, a few clean cars, a few with recurring failures)
  - For each, write what the ideal summary should say

- [ ] **Benchmark at least 3 configurations**
  - Gemini 2.5 Flash (current, thinking disabled)
  - Claude Haiku (as originally proposed)
  - One open-source option: Llama 3 or Mistral via a hosted inference endpoint
  - Score each against ground truth

- [ ] **Document findings in dissertation methodology chapter**
  - Which model was selected and why
  - Trade-offs between accuracy, latency, and cost

---

## 7. Auth

- [ ] **Enable Supabase Auth**
  - Email + password to start (can add OAuth later)
  - Protect any user-specific routes with RLS policies

- [ ] **Supabase RLS policies**
  - `faults` and `recalls` tables: public read, authenticated write
  - Future survey responses: tied to user ID

- [x] **Auth screens in app**
  - `app/index.tsx` — sign in / create account tab switcher, both route to `/dashboard`
  - `app/dashboard.tsx` — hub screen with cards for Check, Diagnose, Profile, Settings
  - Sign out in settings routes back to `/`

---

## 8. Dissertation Write-up

- [ ] **PID (Project Initiation Document)**
  - Scope, objectives, deliverables, timeline, risks
  - Required for formal submission

- [ ] **Literature review — five areas**
  - Decision support systems theory (Gorry & Scott Morton 1971, Simon 1955/1972)
  - Information asymmetry in used car markets (Akerlof 1970)
  - AI transparency and explainability (Goodman & Flaxman 2017, Wachter et al. 2017, Edwards & Veale 2018)
  - Data provenance in AI systems
  - Crowdsourced data quality (Hube et al. 2019, Shen et al. 2020)

- [ ] **Comparative analysis chapter**
  - HPI Check, mycarcheck.com, AutoTrader Check, DriveSage
  - Use the competitor table from supervisor feedback doc as the basis

- [ ] **Methodology chapter**
  - Technical and research approach
  - Data architecture and provenance design
  - Scoring algorithm design decisions
  - LLM evaluation methodology

---

## Deferred

- Crowdsourced ownership surveys — repositioned as supplementary, time-deferred per supervisor feedback
- Fine-tuning a domain-specific model (Llama 3 / Mistral) — active consideration, depends on LLM evaluation results
