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
 * Two-step LLM pipeline:
 *   1. Gemini extracts structured keywords from the symptom (NLP mapping layer)
 *   2. fault-search retrieves candidate faults from all three data sources
 *   3. Gemini scores each candidate for semantic relevance (0.0–1.0)
 *   4. Provenance weights are applied to produce final confidence %
 *
 * Confidence model:
 *   DVSA Recall    × 0.50  — manufacturer-acknowledged defect
 *   Honest John /
 *   Augur Research × 0.35  — editorially verified known fault
 *   DVSA MOT       × 0.15  — frequency signal; guards against thin sample bias
 *
 * Query params:
 *   make    — vehicle make (required)
 *   model   — vehicle model (required)
 *   year    — vehicle year as integer (required)
 *   symptom — free-text symptom description (required)
 */

const PROVENANCE_WEIGHTS: Record<string, number> = {
  "DVSA Recall":    0.50,
  "Honest John":    0.35,
  "Augur Research": 0.35,
  "DVSA MOT":       0.15,
};

async function geminiCall(apiKey: string, prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const data = await res.json();
    if (res.ok) {
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    if (res.status !== 503) break;
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

    const apiKey = Deno.env.get("GEMINI_API_KEY")!;

    // ── Step 1: Extract keywords from symptom ────────────────────────────────
    // Ask Gemini to map free-text → structured fault search terms.
    // This is the NLP mapping layer — converting unstructured input to
    // structured fault categories before the weighted lookup can occur.

    const keywordPrompt = `You are a vehicle fault diagnostic assistant.
Extract 3 to 5 search keywords from the following symptom description that would best match fault records in a vehicle fault database.
Return ONLY a JSON array of strings. No explanation, no markdown, no code fences. Just the array.

Symptom: "${symptom}"

Example output: ["brake", "disc", "calliper", "grinding"]`;

    const keywordRaw = await geminiCall(apiKey, keywordPrompt);

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

    const scoringPrompt = `You are a vehicle fault diagnostic assistant.
A user noticed this symptom: "${symptom}"

Rate how relevant each of the following known faults or recalls is to that symptom.
A fault is relevant if it could plausibly produce or relate to the described symptom, even indirectly.
Score each from 0.0 (completely unrelated) to 1.0 (directly explains the symptom).
Be generous — a brake-related recall is still relevant to a braking symptom even if the defect description uses different words.
Return ONLY a JSON array of numbers in the same order as the list. No explanation, no markdown, no code fences.

Faults:
${candidateList}

Example output for 3 faults: [0.85, 0.42, 0.10]`;

    const scoringRaw = await geminiCall(apiKey, scoringPrompt);

    let relevanceScores: number[] = [];
    try {
      const cleaned = scoringRaw.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      relevanceScores = JSON.parse(cleaned);
      if (!Array.isArray(relevanceScores)) relevanceScores = [];
    } catch {
      relevanceScores = [];
    }

    // ── Step 4: Apply provenance weights → final confidence ──────────────────

    const diagnoses = dedupedCandidates
      .map((c: any, i: number) => {
        const relevance   = typeof relevanceScores[i] === "number"
          ? Math.max(0, Math.min(1, relevanceScores[i]))
          : 0.5; // fallback if scoring response is malformed

        const weight      = PROVENANCE_WEIGHTS[c.provenance] ?? 0.15;
        const confidence  = Math.round(relevance * weight * 200); // ×200 so max (1.0 × 0.5) = 100

        return {
          fault:       c.description,
          category:    c.category,
          confidence,  // 0–100
          provenance:  c.provenance,
          source:      c.source,
          relevance:   Math.round(relevance * 100), // raw semantic match % for debugging
        };
      })
      .filter((d: any) => d.confidence >= 5)
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 5); // top 5 only

    return Response.json({
      make,
      model,
      year,
      symptom,
      keywords,
      diagnoses,
    }, { headers: corsHeaders });
  },
};
