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
  - Expo Go doesn't support SDK 56
  - `npm install -g eas-cli` → `eas build --platform ios --profile development`
  - Test EN62LSK (expect 0/100, fraud highlighted) and a clean car on real hardware

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

- [ ] **Step 1 — LLM keyword extraction (Gemini call 1)**
  - Send symptom to Gemini with a structured prompt: "Extract 3–5 search keywords from this symptom description. Return as a JSON array of strings only."
  - Example: "whining noise when turning" → `["steering", "power steering", "pump", "noise"]`
  - Parse JSON from Gemini response; fall back to splitting symptom on spaces if parsing fails

- [ ] **Step 2 — fault-search lookup**
  - Call `fault-search` internally via HTTP with `make`, `model`, `year`, `keywords` (comma-joined)
  - Returns candidate faults across all three provenance sources: DVSA Recall, Augur Research/HJ, DVSA MOT

- [ ] **Step 3 — semantic relevance scoring (Gemini call 2)**
  - Send original symptom + list of candidate fault descriptions to Gemini
  - Prompt: "For each fault, rate how likely it explains the symptom on a scale of 0.0 to 1.0. Return as a JSON array of numbers in the same order."
  - This is the NLP mapping step: free-text → structured fault classification

- [ ] **Step 4 — confidence calculation**
  - Apply provenance weights to each fault's relevance score:
    - DVSA Recall: × 0.50 (manufacturer-acknowledged defect)
    - Honest John / Augur Research: × 0.35 (editorially verified)
    - DVSA MOT: × 0.15 (frequency signal — guards against thin sample sizes)
  - `confidence = relevance_score × provenance_weight × 100`
  - Sort descending by confidence, return top 5

- [ ] **Response shape**
  ```json
  {
    "make": "Ford", "model": "Focus", "year": 2014,
    "symptom": "whining noise when turning",
    "diagnoses": [
      { "fault": "Power steering pump failure", "confidence": 74, "category": "Steering", "provenance": "Honest John", "source": "Honest John Carbycar" },
      { "fault": "Steering rack wear", "confidence": 51, "category": "Steering", "provenance": "DVSA MOT", "source": "DVSA MOT Anonymised Test Data 2024" }
    ]
  }
  ```

- [ ] **Deploy and test**
  - `supabase functions deploy vehicle-diagnose`
  - Test via browser URL with a known car and real symptom (e.g. Ford Mondeo 2018, "grinding noise when braking")
  - Verify confidence scores are plausible and provenance tags are correct

### 4b. App UI

- [ ] **Add entry point to `results.tsx`**
  - "Diagnose a symptom" button near the bottom of the results screen
  - Passes `make`, `model`, `year`, `reg` as route params — no re-fetch needed

- [ ] **Create `app/diagnose.tsx`**
  - Receives `make`, `model`, `year` from params — display as context header ("Diagnosing: 2018 Ford Mondeo")
  - Free-text input: "Describe what you noticed (e.g. grinding noise when braking)"
  - Submit button triggers call to `vehicle-diagnose` Edge Function
  - Loading state while waiting for response

- [ ] **Diagnosis results UI**
  - Ranked cards: confidence % (large, coloured by threshold) + fault description + category
  - Confidence colour: ≥70% red, ≥40% amber, <40% grey
  - Provenance badge on each card (reuse `PROVENANCE_COLOR` from results.tsx)
  - Example card: "74% likely — Power steering pump failure · Steering · Honest John"
  - Caveat banner at top: "This is not a mechanic's diagnosis. Have the car inspected before buying."

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
