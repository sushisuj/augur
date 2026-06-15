# Augur

> **Work in progress.** Actively developed as a final-year dissertation project at the University of Portsmouth. Expect breaking changes and incomplete features.

A used-car buying assistant for the UK market. Scan any registration plate and Augur pulls the car's full official MOT history, runs it through a scoring algorithm that detects odometer fraud, recurring failures, and persistent advisories, then generates a plain-English buyer verdict — all in a few seconds.

Built for buyers who've found a car they like but don't know whether it's actually worth the risk.

## Stack

- **Frontend:** React Native + Expo SDK 56 (TypeScript), Expo Router
- **Backend:** Supabase Edge Functions (Deno / TypeScript)
- **Database:** Supabase (PostgreSQL) — seeded model fault and recall data
- **APIs:** DVSA MOT History API for full per-vehicle test records
- **AI:** Gemini 2.5 Flash — plain-English buyer summaries generated from real MOT data

## How it works

1. User enters a registration plate
2. Edge Function fetches the full MOT history from the DVSA API
3. Scoring algorithm (0–100) runs locally in the function:
   - Instant 0 if odometer fraud is detected
   - Deductions for recurring failures and persistent advisories
   - Model reliability penalty from the faults DB (capped at 25pts)
   - Consistency bonus for consecutive clean MOTs
4. Gemini generates a 2–3 sentence buyer summary from the scored data
5. Results screen shows score, verdict, fraud warnings, MOT history, and known model issues

## Status

| Area | Status |
|---|---|
| Project setup | ✅ Done |
| DVSA MOT History API integration | ✅ Done |
| Scoring algorithm | ✅ Done |
| Odometer fraud detection | ✅ Done |
| Model faults database | ✅ Done |
| AI buyer summary (Gemini) | ✅ Done |
| Frontend UI | 🟡 In progress |
| Onboarding survey / buyer persona | 🔴 Not started |
| Auth | 🔴 Not started |
| Crowdsourced reliability data | 🔴 Not started |

## Dissertation Context

Augur is the engineering project for MEng Computer Science (third year) at the University of Portsmouth.

---

*Not ready for use.*
