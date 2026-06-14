# Augur

> **This project is a work in progress.** It is being actively developed as a final-year dissertation project at the University of Portsmouth. Expect breaking changes, incomplete features, and missing documentation.

---

A used-car buying assistant for the UK market. Augur pulls official DVLA MOT history and tax data, overlays crowdsourced owner reliability reports, and uses an AI layer to generate a plain-English verdict on any car — covering reliability, value, and suitability — answered from real data, not guesswork.

Built for buyers who know what they want but don't know whether a specific car is worth the risk.

## Stack

- **Frontend:** React Native + Expo (TypeScript)
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL with pgvector for vector storage
- **AI:** RAG pipeline via the Anthropic API — natural language questions answered from real listing and reliability data
- **Auth:** JWT tokens, hashed passwords, protected routes

## Status

| Area | Status |
|---|---|
| Project setup | 🟡 In progress |
| DVLA API integration | 🔴 Not started |
| Crowdsourced reliability data | 🔴 Not started |
| RAG pipeline | 🔴 Not started |
| Auth | 🔴 Not started |
| Frontend UI | 🔴 Not started |

## Dissertation Context

Augur is the engineering project for MEng Computer Science (third year) at the University of Portsmouth. Development started summer 2025, with a working prototype target of October 2025.

---

*Not ready for use. Check back later.*
