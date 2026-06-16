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

- [ ] **EAS build — get app on a physical device**
  - Expo Go doesn't support SDK 56
  - `npm install -g eas-cli` → `eas build --platform ios --profile development`
  - Test EN62LSK (expect 0/100, fraud highlighted) and a clean car on real hardware

---

## 2. Data Pipeline — Summer Priority

This is the foundation everything else depends on. The supervisor's concern was that the data layer isn't verifiable enough. These tasks address that directly before any more frontend work happens.

### 2a. DVSA Anonymised MOT Test Data (Primary Source)

- [ ] **Download the 2024 bulk dataset from GOV.UK**
  - Two files: test results file + failure items file
  - Join on shared test identifier to link outcomes to failure reasons

- [ ] **Write an ingestion script**
  - Calculate model-level pass rates per make/model/age bracket
  - Rank the most frequent failure reasons per make/model/age
  - Output: structured rows ready for Supabase import

- [ ] **Import into Supabase**
  - New table: `mot_aggregate` (make, model, year_from, year_to, failure_reason, frequency, pass_rate)
  - This replaces the manually seeded `faults` table as the primary reliability source
  - Keep manually seeded data — it gets a `source: "curated"` provenance tag

### 2b. DVSA Vehicle Recall Data (Safety Layer)

- [ ] **Download the DVSA recall dataset from GOV.UK**
  - Fields: make, model, defect description, remedy, build date range of affected vehicles

- [ ] **Import into Supabase**
  - New table: `recalls` (make, model, defect, remedy, build_date_from, build_date_to)
  - Filter at query time by the specific vehicle's build date — no hard age cutoff needed

- [ ] **Wire up to Edge Function**
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

- [ ] **Enable Postgres full-text search on `faults` and `recalls` tables**
  - Add `tsvector` columns to both tables
  - Create GIN indexes for fast keyword lookup
  - Test queries: searching "brake", "gearbox slip", "electrical fault" should return ranked relevant records

- [ ] **Build a new Edge Function: `fault-search`**
  - Accepts: `make`, `model`, `year`, `keywords[]`
  - Queries `faults` + `recalls` + `mot_aggregate` using full-text search
  - Returns: ranked fault records with source, severity, frequency, and provenance tag
  - This is the endpoint the AI (and later the diagnosis module) calls

- [ ] **Update `vehicle-lookup` to call `fault-search` instead of direct DB query**
  - Currently does `.ilike("make", ...).ilike("model", ...)` — swap for `fault-search` call
  - Every fault in the Gemini prompt now comes from an indexed, attributed API response
  - This makes every AI claim auditable: you can trace it back to a specific DB record

- [ ] **Provenance tagging on all API responses**
  - Every record returned by `fault-search` carries a provenance tag: `"DVSA MOT"`, `"DVSA Recall"`, `"Honest John"`, or `"Curated"`
  - Pass provenance tags through to the frontend — display source on each fault card in the results UI

---

## 4. Vehicle Diagnosis Module

Depends on the custom API (Section 3) being in place first. The confidence scores come from indexed fault data, not model inference.

- [ ] **New screen: `app/diagnose.tsx`**
  - Entry point: "Describe what's wrong with the car"
  - Free-text input field + submit button
  - Requires a make/model/year to be set (either from a recent lookup or manual input)

- [ ] **Edge Function: `diagnose`**
  - Input: symptom description (free text) + make + model + year
  - Step 1: LLM extracts keywords from the symptom description (e.g. "whining noise when turning" → ["steering", "power steering", "noise", "turning"])
  - Step 2: Call `fault-search` with those keywords
  - Step 3: Compute confidence scores from weighted combination of:
    - DVSA MOT failure frequency for this make/model/age (how common is this fault?)
    - Honest John corroboration (is this a documented known issue?)
    - DVSA recall match (is there a manufacturer-acknowledged defect?)
  - Step 4: Return ranked list of probable causes with confidence percentages

- [ ] **Results UI for diagnosis**
  - Ranked list: "74% — Power steering pump failure (documented across 2012-2015 Ford Focus, source: DVSA MOT Data)"
  - Each entry shows confidence %, fault description, and provenance
  - Caveat banner: "This is not a mechanic's diagnosis. Get the car inspected before buying."

---

## 5. App Features (continue after data pipeline)

These were already planned but depended on the data layer being solid first.

### 5a. Loading screen — progress steps

- [ ] Replace blank spinner with sequential step messages
  - Cycle through: "Fetching MOT history..." → "Analysing faults..." → "Generating buyer summary..."
  - `useEffect` with `setInterval` advancing through steps every ~1.5s while `loading === true`

### 5b. Onboarding survey

- [ ] **Create `app/onboarding.tsx`**
  - "How will you mainly use this car?"
  - Three large tappable tiles: Daily commuter / Family car / First car & budget buy
  - Save to AsyncStorage under key `augur_persona`, navigate to home
  - Skip link saves `null`

- [ ] **Gate on first launch**
  - In `_layout.tsx`, read `augur_persona` on mount
  - If key doesn't exist, redirect to `/onboarding`

- [ ] **Settings screen to re-take survey**
  - `app/settings.tsx` — same three tiles, current selection highlighted
  - Overwrites `augur_persona` in AsyncStorage

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

- [ ] **Auth screens in app**
  - `app/login.tsx` and `app/register.tsx`
  - Redirect unauthenticated users away from protected routes

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
