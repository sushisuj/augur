# Augur — Development To-Do

Work top to bottom. Cross off as you go.

---

## 1. Housekeeping (do first)

- [ ] **Git commit all current changes**
  - Files: `app/results.tsx`, `supabase/functions/vehicle-lookup/index.ts`, `supabase/functions/vehicle-lookup/scoring.ts`, `supabase/functions/vehicle-lookup/scoring.test.ts`
  - Suggested message: `feat: scoring algorithm, fraud detection, results UI overhaul`

- [ ] **Run scoring.test.ts properly**
  - `cd augur/supabase/functions/vehicle-lookup && deno run scoring.test.ts`
  - Should see 11 passed, 0 failed
  - Fix any failures before moving on

- [ ] **EAS build — get app on a physical device**
  - Expo Go doesn't support SDK 56, so the simulator is the only test environment right now
  - Install EAS CLI: `npm install -g eas-cli`
  - Run `eas build --platform ios --profile development` (or android)
  - Scan QR to install on device
  - Test EN62LSK and a clean car on real hardware

---

## 2. Loading screen — progress steps

Currently just a spinner that says "Checking EN62LSK..." with no indication of what's happening. The Edge Function takes 3-6 seconds; the user has no feedback.

- [ ] **Replace blank spinner with sequential step messages**
  - Steps to cycle through: "Fetching MOT history..." → "Analysing faults..." → "Generating buyer summary..."
  - Implementation: use a `useEffect` with a `setInterval` that advances through the steps every ~1.5s while `loading === true`
  - Keep the existing `ActivityIndicator`, just add the step text beneath it
  - No fake progress bars — just the text cycling

---

## 3. Onboarding survey

First-launch screen that captures the buyer's primary use case. This feeds directly into the AI summary tone (Step 5).

- [ ] **Create `app/onboarding.tsx`**
  - Full-screen card: "How will you mainly use this car?"
  - Three options as large tappable tiles:
    - Daily commuter (reliability, fuel economy)
    - Family car (safety, space)
    - First car & budget buy (running costs, insurance, simplicity)
  - On selection: save to AsyncStorage under key `augur_persona`, navigate to `/(tabs)/` or `index`
  - Skip link at bottom ("I'll decide later") — saves `null`, goes to home

- [ ] **Gate the onboarding on first launch**
  - In `app/_layout.tsx` or `index.tsx`, on mount read `augur_persona` from AsyncStorage
  - If key doesn't exist (never been set), redirect to `/onboarding`
  - If key exists (including `null` for skipped), proceed to home as normal

- [ ] **Add Settings screen to re-take survey**
  - Add a Settings button/icon to the home screen header or tab bar
  - `app/settings.tsx` — shows the same three tiles plus a "Reset" option
  - On selection: overwrite `augur_persona` in AsyncStorage, navigate back to home
  - Show current selection as highlighted/checked

---

## 4. Pass persona to Edge Function

Once the persona is captured, pass it through so the backend can use it.

- [ ] **Read persona in `results.tsx` before fetch**
  - `const persona = await AsyncStorage.getItem('augur_persona');`
  - Append as query param: `?reg=${reg}&persona=${persona ?? 'none'}`

- [ ] **Read persona in `index.ts` (Edge Function)**
  - `const persona = url.searchParams.get('persona') ?? 'none';`
  - Pass it into the Gemini prompt builder

---

## 5. Split AI summary + persona tone

The buyer summary currently comes back as a single block of text. Split it into two sections with tone adjusted per persona.

- [ ] **Update Edge Function (`index.ts`) — two-section prompt**
  - Section 1 — "This car": vehicle-specific findings (MOT failures, clocking, recurring faults)
  - Section 2 — "This model": population-level reliability (DB faults, known recalls)
  - Return as `{ summary_vehicle: string, summary_model: string }` instead of single `summary`

- [ ] **Persona tone rules in the prompt**
  - `daily_commuter`: focus on reliability and whether the car can handle high mileage; flag anything that suggests it'll need frequent repairs
  - `family_car`: flag safety-critical failures; ask Gemini to include NCAP rating if it knows it for this make/model/year; mention space/practicality if relevant
  - `first_car`: use the simplest possible language; mention insurance group and running cost implications; be extra cautious about recommending anything with recurring failures

- [ ] **Update `VehicleResult` type in `results.tsx`**
  - Replace `summary: string` with `summary_vehicle: string` and `summary_model: string`

- [ ] **Update results UI to show two summary cards**
  - "About this car" card → `summary_vehicle`
  - "About this model" card → `summary_model`
  - Both under the existing Buyer Summary section header

---

## 6. UI polish

No specific brief yet — revisit once features above are done. Notes so far:

- [ ] **Review overall visual design** — cards, typography, spacing
- [ ] **Score display** — consider a circular progress ring or colour gradient instead of plain number
- [ ] **Empty states** — what does the app show if a car has no MOT history at all? (brand new car)

---

## 7. Dissertation / academic

- [ ] **Write full PID (Project Initiation Document)**
  - Scope, objectives, deliverables, timeline, risks
  - Required for dissertation submission

- [ ] **Dissertation proposal**
  - Research question, methodology, related work section

---

## Deferred (not in current scope)

These were discussed but parked until core features are stable:

- Crowdsourced reliability data (owner reports)
- Auth (user accounts)
- Car recommendation engine ("find me a first car") — out of scope for Augur's current premise
