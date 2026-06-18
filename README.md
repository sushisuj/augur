# Augur

<p align="center">
  <img src="assets/icon.png" width="120" alt="Augur logo" />
</p>

> **Work in progress.** Actively developed as a final-year dissertation project at the University of Portsmouth. Expect breaking changes.

A used-car buying decision-support tool for the UK market. Enter a registration plate and Augur pulls the vehicle's full DVSA MOT history, runs it through a scoring algorithm that detects odometer fraud and recurring failures, checks active manufacturer recalls, and generates a plain-English buyer verdict — grounded entirely in verified public data.

Built for buyers who've found a car they like but don't know whether it's actually worth the risk.

---

## Stack

- **Frontend:** React Native + Expo SDK 56 (TypeScript), Expo Router — runs on iOS, Android, and web
- **Backend:** Supabase Edge Functions (Deno / TypeScript)
- **Database:** Supabase (PostgreSQL) — DVSA MOT aggregate data, DVSA recall register, curated fault records
- **APIs:** DVSA MOT History API (per-vehicle test records)
- **AI:** Gemini 2.5 Flash (vehicle lookup summaries) · Llama 3.1 8B via Groq (model-level summaries, diagnosis)

---

## How it works

### Vehicle check (registration plate)

1. User enters a UK registration plate
2. `vehicle-lookup` Edge Function fetches the full MOT history from the DVSA API
3. Scoring algorithm (0–100) runs inside the function:
   - Instant floor if odometer fraud is detected (mileage regression + gap detection)
   - Deductions for recurring MOT failures and persistent advisories
   - Model reliability penalty from `mot_aggregate` (capped at 25 pts)
   - Consistency bonus for consecutive clean MOTs
4. Active DVSA recalls are matched by make, model, and build date
5. Gemini generates a 2–3 sentence buyer summary grounded in the scored data
6. Results screen shows score, verdict (Buy / Consider / Avoid), fraud warnings, MOT timeline, known faults with provenance badges, and active recalls

### Vehicle diagnosis

1. User describes a symptom in plain English ("grinding noise when braking")
2. `vehicle-diagnose` Edge Function:
   - Extracts 3–5 keywords via LLM and classifies the vehicle system involved
   - Queries `faults`, `recalls`, and `mot_aggregate` via full-text search
   - Scores each candidate fault for relevance to the symptom (0.0–1.0)
   - Blends relevance (70%) with provenance weight (30%) into a confidence score
   - Falls back to AI guidance when no DB matches are found
3. Results ranked by confidence with provenance badges (DVSA Recall · DVSA MOT · Augur Research)

### Model report (no reg required)

1. User enters make, model, and year
2. `model-summary` Edge Function queries aggregate data: MOT pass rate, common failure reasons, curated faults, active recalls
3. Numeric DVSA RfR codes are translated to plain English via LLM
4. Returns AI summary, pass rate with verdict, ranked failure list, faults, and recalls

### Recommendations

1. User completes a 5-step onboarding survey (usage type, body type, transmission, budget, seller type)
2. Persona saved to AsyncStorage
3. Recommendations screen selects a pool of 10 cars per usage category, then ranks by body-type proximity to the user's preference
4. Each card shows an AI summary grounded in DB records, running cost band, rationale, and a direct link to check that model

---

## Edge Functions

| Function | Purpose |
|---|---|
| `vehicle-lookup` | Full per-vehicle check: MOT history, scoring, fraud detection, recalls, AI summary |
| `vehicle-diagnose` | Symptom → fault match with confidence scoring |
| `fault-search` | Keyword-indexed fault/recall lookup (called internally by diagnose) |
| `model-summary` | Aggregate model report: pass rate, common failures, AI summary |

---

## Data Sources

| Source | Table | Provenance tag |
|---|---|---|
| DVSA Anonymised MOT Bulk Dataset (2024) | `mot_aggregate` | `DVSA MOT` |
| DVSA Vehicle Recall Register | `recalls` | `DVSA Recall` |
| Curated fault records (Augur Research) | `faults` | `Augur Research` |

All AI outputs are grounded in these verified records. The AI cannot reference faults that don't appear in the prompt data.

---

## App Screens

| Screen | Route | Description |
|---|---|---|
| Sign in / Register | `/` | Auth entry point |
| Dashboard | `/dashboard` | Hub: Check, Diagnose, Recommendations, Settings |
| Check a car | `/home` | Reg plate, VIN, or make/model/year entry |
| Vehicle report | `/results` | Full scored report for a specific vehicle |
| Diagnosis | `/diagnose` | Symptom-based fault matching |
| Model report | `/model-report` | Aggregate report by make/model/year |
| Recommendations | `/recommendations` | Persona-matched car suggestions |
| Onboarding | `/onboarding` | 5-step buyer persona survey |
| Settings | `/settings` | Profile, account, How Augur works |
| Transparency | `/transparency` | Scoring methodology and data sources explained |

---

## Status

| Area | Status |
|---|---|
| DVSA MOT History API integration | ✅ Done |
| Scoring algorithm (0–100) | ✅ Done |
| Odometer fraud detection | ✅ Done |
| DVSA MOT bulk data ingestion | ✅ Done |
| DVSA recall database integration | ✅ Done |
| Full-text fault search (`fault-search`) | ✅ Done |
| Vehicle diagnosis module | ✅ Done |
| AI buyer summaries (Gemini + Groq, DB-grounded) | ✅ Done |
| Onboarding survey + buyer persona | ✅ Done |
| Recommendations (persona-matched, 50 cars across 5 categories) | ✅ Done |
| Model report (make/model/year, no reg required) | ✅ Done |
| Transparency / methodology screen | ✅ Done |
| Frontend UI | ✅ Done (core screens) |
| Persona tone in vehicle lookup AI summary | 🟡 In progress |
| LLM evaluation (Gemini vs Haiku vs Llama) | 🔴 Not started |
| Supabase Auth wired up | 🔴 Not started |

---

## Dissertation Context

Augur is the engineering artefact for Computer Science (Year 3) at the University of Portsmouth. The core research contributions are:

- A provenance-tagged, queryable fault database grounding every AI claim in a verifiable source
- A confidence scoring model blending semantic relevance with data provenance weights
- A comparative LLM evaluation across accuracy, hallucination rate, tone adherence, and latency (in progress)

---

*Not production-ready.*
