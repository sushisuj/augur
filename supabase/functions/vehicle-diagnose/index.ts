// deno-lint-ignore-file
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * vehicle-diagnose Edge Function
 *
 * Accepts a free-text symptom description and returns a ranked list of
 * probable fault causes with confidence scores for the given make/model/year.
 *
 * Three-step LLM pipeline:
 *   0. Gemini classifies the symptom into a vehicle system (e.g. "Brakes", "Engine")
 *   1. Gemini extracts structured keywords from the symptom (NLP mapping layer)
 *   2. fault-search retrieves candidate faults from all three data sources
 *   3. Gemini scores each candidate for semantic relevance (0.0–1.0)
 *   4. Blended confidence: relevance (70%) + provenance bonus (30%)
 *
 * Confidence model:
 *   confidence = (relevance × 0.70 + provenance_bonus × 0.30) × 100
 *
 *   Provenance bonuses:
 *   DVSA Recall    → 1.00  — manufacturer-acknowledged defect
 *   Honest John /
 *   Augur Research → 0.80  — editorially verified known fault
 *   DVSA MOT       → 0.50  — frequency signal
 *
 * Query params:
 *   make    — vehicle make (required)
 *   model   — vehicle model (required)
 *   year    — vehicle year as integer (required)
 *   symptom — free-text symptom description (required)
 */

const PROVENANCE_BONUS: Record<string, number> = {
  "DVSA Recall":    1.00,
  "Honest John":    0.80,
  "Augur Research": 0.80,
  "DVSA MOT":       0.50,
};

const VEHICLE_SYSTEMS = [
  "Brakes", "Engine", "Steering", "Gearbox", "Clutch",
  "Suspension", "Electrical", "Exhaust", "Cooling", "Fuel System",
  "Tyres", "Air Conditioning", "Body", "Transmission", "Unknown",
];

async function claudeCall(apiKey: string, prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (res.ok) {
      return data?.content?.[0]?.text ?? "";
    }
    if (res.status !== 529) break; // 529 = Anthropic overloaded
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return "";
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url     = new URL(req.url);
    const make    = url.searchParams.get("make")?.trim();
    const model   = url.searchParams.get("model")?.trim();
    const yearRaw = url.searchParams.get("year");
    const symptom = url.searchParams.get("symptom")?.trim();

    if (!make || !model || !yearRaw || !symptom) {
      return Response.json(
        { error: "make, model, year, and symptom are all required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const year = parseInt(yearRaw);
    if (isNaN(year)) {
      return Response.json(
        { error: "year must be a valid integer" },
        { status: 400, headers: corsHeaders }
      );
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")!;

    // ── Step 0: Classify symptom into a vehicle system ───────────────────────
    // Runs in parallel with Step 1 — both are independent Gemini calls.
    // The classification is returned to the client as context, and could be
    // used in future to pre-filter fault-search results by category.

    const classifyPrompt = `You are a vehicle diagnostic assistant.
Classify the following symptom into exactly one vehicle system from this list:
${VEHICLE_SYSTEMS.join(", ")}.

Return ONLY a JSON object with two fields: "system" (string from the list) and "confidence" ("high", "medium", or "low").
No explanation, no markdown, no code fences.

Symptom: "${symptom}"

Example output: {"system": "Brakes", "confidence": "high"}`;

    // ── Step 1: Extract keywords from symptom ────────────────────────────────
    // Ask Gemini to map free-text → structured fault search terms.
    // This is the NLP mapping layer — converting unstructured input to
    // structured fault categories before the weighted lookup can occur.

    const keywordPrompt = `You are a vehicle fault diagnostic assistant.
Extract 3 to 5 search keywords from the following symptom description that would best match fault records in a vehicle fault database.
Return ONLY a JSON array of strings. No explanation, no markdown, no code fences. Just the array.

Symptom: "${symptom}"

Example output: ["brake", "disc", "calliper", "grinding"]`;

    // Fire classify + keyword extraction in parallel
    const [classifyRaw, keywordRaw] = await Promise.all([
      claudeCall(apiKey, classifyPrompt),
      claudeCall(apiKey, keywordPrompt),
    ]);

    // Parse system classification
    let vehicleSystem = "Unknown";
    let systemConfidence = "low";
    try {
      const cleaned = classifyRaw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (VEHICLE_SYSTEMS.includes(parsed.system)) vehicleSystem = parsed.system;
      if (["high", "medium", "low"].includes(parsed.confidence)) systemConfidence = parsed.confidence;
    } catch { /* leave defaults */ }

    let keywords: string[] = [];
    try {
      // Strip markdown code fences if Gemini wraps anyway
      const cleaned = keywordRaw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      keywords = JSON.parse(cleaned);
      if (!Array.isArray(keywords)) keywords = [];
    } catch {
      // Fallback: split symptom on spaces and take first 4 words
      keywords = symptom.split(/\s+/).slice(0, 4);
    }

    if (keywords.length === 0) {
      keywords = symptom.split(/\s+/).slice(0, 4);
    }

    // ── Step 2: Call fault-search with extracted keywords ────────────────────
    // If keyword search returns nothing (fts mismatch), fall back to the full
    // model lookup with no keywords — Gemini's semantic scoring in Step 3
    // handles the relevance filtering instead.

    async function fetchFaultSearch(withKeywords: boolean): Promise<any[]> {
      const qs = withKeywords && keywords.length > 0
        ? `make=${encodeURIComponent(make!)}&model=${encodeURIComponent(model!)}&year=${year}&keywords=${encodeURIComponent(keywords.join(","))}`
        : `make=${encodeURIComponent(make!)}&model=${encodeURIComponent(model!)}&year=${year}`;

      const res = await fetch(
        new URL(`/functions/v1/fault-search?${qs}`, Deno.env.get("SUPABASE_URL")!).toString(),
        {
          headers: {
            Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) throw new Error(`fault-search ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.results ?? [];
    }

    let candidates: any[];
    try {
      candidates = await fetchFaultSearch(true);
      if (candidates.length === 0) {
        // Keyword search found nothing — fall back to full model lookup
        candidates = await fetchFaultSearch(false);
      }
    } catch (err: any) {
      return Response.json(
        { error: `fault-search failed: ${err.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    if (candidates.length === 0) {
      return Response.json({
        make, model, year, symptom, keywords,
        diagnoses: [],
        message: "No matching faults found in the database for this vehicle.",
      }, { headers: corsHeaders });
    }

    // Deduplicate by description (same fault can appear from both faults + recalls tables)
    const seen = new Set<string>();
    const dedupedCandidates = candidates.filter((c: any) => {
      const key = (c.description ?? "").toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ── Step 3: Score each candidate for semantic relevance ──────────────────
    // Gemini rates how well each fault description matches the original symptom.
    // This is separate from the provenance weight — it's pure semantic match.

    const candidateList = dedupedCandidates
      .map((c: any, i: number) => `${i + 1}. ${c.description}`)
      .join("\n");

    const scoringPrompt = `You are a strict vehicle fault diagnostic assistant.
A user noticed this symptom: "${symptom}"

Rate how directly each of the following faults explains that exact symptom.
Be conservative. Only score above 0.5 if the fault could directly and plausibly produce the described symptom.
Score 0.0 if the connection requires a significant logical leap or is coincidental (e.g. both involve noise but different systems entirely).
Score 0.0 if the fault is from a completely unrelated vehicle system.
A clutch recall is NOT relevant to a fogging windscreen. A brake recall is NOT relevant to an electrical symptom.
Return ONLY a JSON array of numbers in the same order as the list. No explanation, no markdown, no code fences.

Faults:
${candidateList}

Example output for 3 faults: [0.85, 0.10, 0.00]`;

    const scoringRaw = await claudeCall(apiKey, scoringPrompt);

    let relevanceScores: number[] = [];
    try {
      const cleaned = scoringRaw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      relevanceScores = JSON.parse(cleaned);
      if (!Array.isArray(relevanceScores)) relevanceScores = [];
    } catch {
      relevanceScores = [];
    }

    // ── Step 4: Blended confidence = relevance (70%) + provenance bonus (30%) ─
    // This ensures semantic match quality dominates over data source.
    // A highly relevant MOT fault can outscore a loosely-matched recall.

    const diagnoses = dedupedCandidates
      .map((c: any, i: number) => {
        const relevance = typeof relevanceScores[i] === "number"
          ? Math.max(0, Math.min(1, relevanceScores[i]))
          : 0.5;

        const provenanceBonus = PROVENANCE_BONUS[c.provenance] ?? 0.50;
        const confidence = Math.round((relevance * 0.70 + provenanceBonus * 0.30) * 100);

        return {
          fault:      c.description,
          category:   c.category,
          confidence, // 0–100
          provenance: c.provenance,
          source:     c.source,
          relevance:  Math.round(relevance * 100), // raw semantic score for debugging
        };
      })
      .filter((d: any) => d.relevance >= 25 && d.confidence >= 20)
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 5);

    // ── Step 5 (fallback): General guidance if no verified results ──────────────
    // Only runs when the DB returned nothing. Gemini provides general advice
    // clearly labelled as AI-generated — no confidence score, no provenance.

    let fallbackGuidance: string | null = null;

    if (diagnoses.length === 0) {
      const fallbackPrompt = `You are a cautious vehicle diagnostic assistant helping a used car buyer in the UK.
A user is looking at a ${year} ${make} ${model} and noticed this symptom: "${symptom}"

We have no verified fault records in our database for this symptom on this vehicle.
Write 2–3 sentences of general guidance: what vehicle system this symptom likely relates to, what a mechanic would typically check, and a clear recommendation to have the car professionally inspected before buying.
Do not invent specific fault names or part numbers. Do not give a diagnosis. Be honest that this is general guidance only.
Write in plain English. No bullet points, no markdown.`;

      fallbackGuidance = await claudeCall(apiKey, fallbackPrompt);
      if (!fallbackGuidance?.trim()) fallbackGuidance = null;
    }

    return Response.json({
      make,
      model,
      year,
      symptom,
      keywords,
      vehicle_system:    vehicleSystem,
      system_confidence: systemConfidence,
      diagnoses,
      fallback_guidance: fallbackGuidance,
    }, { headers: corsHeaders });
  },
};
