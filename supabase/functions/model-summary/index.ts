// deno-lint-ignore-file
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * model-summary Edge Function
 *
 * Generates a short used-car buying summary for a specific make/model/year range,
 * grounded in verified data from the Augur database.
 *
 * Data sources used:
 *   mot_aggregate  — most common MOT failure reasons for this model
 *   faults         — known faults (Honest John / Augur Research provenance)
 *   recalls        — active DVSA safety recalls
 *
 * The AI summary is explicitly grounded in these records — it cannot
 * invent faults that don't appear in the prompt data.
 *
 * Query params:
 *   make      — vehicle make (required)
 *   model     — vehicle model (required)
 *   year_from — start of year range as integer (required)
 *   year_to   — end of year range as integer (required)
 */

async function groqCall(apiKey: string, prompt: string, maxTokens = 200): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:      "llama-3.1-8b-instant",
        max_tokens: maxTokens,
        messages:   [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (res.ok) return data?.choices?.[0]?.message?.content?.trim() ?? "";
    if (res.status !== 529) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return "";
}

/** Translate DVSA RfR numeric codes to plain English using Groq. */
async function translateRfrCodes(
  apiKey: string,
  codes: string[]
): Promise<Record<string, string>> {
  if (!codes.length) return {};
  const prompt = `These are DVSA MOT RfR (Reason for Refusal) numeric codes from the UK MOT Inspection Manual. Translate each to a short plain-English description a car buyer would understand.

Return ONLY valid JSON with no explanation or markdown, in this exact format: {"<code>": "<description>"}

Codes to translate: ${codes.join(", ")}

Keep each description under 8 words. Examples of good descriptions: "Headlamp aim incorrect", "Tyre tread below legal limit", "Stop lamp not working", "Brake performance insufficient".`;

  const raw = await groqCall(apiKey, prompt, 300);
  // Strip any markdown code fences Groq might add
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return {};
  }
}

function verdictFromPassRate(rate: number | null): string {
  if (rate === null) return "Unknown";
  if (rate >= 0.90)  return "Great";
  if (rate >= 0.80)  return "Good";
  if (rate >= 0.70)  return "Average";
  return "Below average";
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url      = new URL(req.url);
    const make     = url.searchParams.get("make")?.trim();
    const model    = url.searchParams.get("model")?.trim();
    const yearFrom = parseInt(url.searchParams.get("year_from") ?? "0");
    const yearTo   = parseInt(url.searchParams.get("year_to")   ?? "0");

    if (!make || !model || !yearFrom || !yearTo) {
      return Response.json(
        { error: "make, model, year_from, and year_to are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = Deno.env.get("GROQ_API_KEY")!;

    // ── Query 1: Top MOT failure reasons (+ pass rate) ────────────────────────
    const { data: motData } = await supabase
      .from("mot_aggregate")
      .select("failure_reason, frequency, pass_rate, total_tests")
      .ilike("make",  `%${make}%`)
      .ilike("model", `%${model}%`)
      .order("frequency", { ascending: false })
      .limit(5);

    // ── Query 2: Known faults from curated sources ────────────────────────────
    const { data: faultData } = await supabase
      .from("faults")
      .select("description, category, provenance")
      .ilike("make",  `%${make}%`)
      .ilike("model", `%${model}%`)
      .limit(8);

    // ── Query 3: Active recalls ───────────────────────────────────────────────
    const { data: recallData } = await supabase
      .from("recalls")
      .select("defect")
      .ilike("make",  `%${make}%`)
      .ilike("model", `%${model}%`)
      .limit(4);

    // ── Pass rate + verdict ───────────────────────────────────────────────────
    // All rows for the same make/model/year bracket share the same pass_rate
    const passRate   = motData?.[0]?.pass_rate   ?? null;
    const totalTests = motData?.[0]?.total_tests ?? 0;
    const verdict    = verdictFromPassRate(passRate);

    // ── Translate numeric RfR codes if needed ─────────────────────────────────
    const allReasons = (motData ?? []).map((r: any) => String(r.failure_reason ?? ""));
    const numericCodes: string[] = Array.from(new Set(allReasons.filter((r: string) => /^\d+$/.test(r))));

    const codeTranslations = await translateRfrCodes(apiKey, numericCodes);

    const resolveReason = (raw: string): string =>
      /^\d+$/.test(raw ?? "") ? (codeTranslations[raw] ?? raw) : raw;

    // ── Build grounded prompt ─────────────────────────────────────────────────
    const motSection = motData?.length
      ? `MOT failure data (most common failures, as % of tests):\n${motData
          .map((r: any) => `- ${resolveReason(r.failure_reason)} (${(r.frequency * 100).toFixed(1)}% of tests)`)
          .join("\n")}`
      : "No MOT aggregate data available for this model.";

    const faultSection = faultData?.length
      ? `Known faults (verified records):\n${faultData
          .map((r: any) => `- ${r.description} [${r.provenance}]`)
          .join("\n")}`
      : "No curated fault records available.";

    const recallSection = recallData?.length
      ? `Active DVSA recalls:\n${recallData
          .map((r: any) => `- ${r.defect}`)
          .join("\n")}`
      : "No active recalls on record.";

    const passRateNote = passRate !== null
      ? `MOT pass rate: ${(passRate * 100).toFixed(1)}% (based on ${totalTests.toLocaleString()} tests)`
      : "";

    const summaryPrompt = `You are a UK used car buying assistant writing a short summary for a car buying app.

Vehicle: ${yearFrom}–${yearTo} ${make} ${model}
${passRateNote}

Here is the verified data we have for this model from our database:

${motSection}

${faultSection}

${recallSection}

Using only the data above, write 2–3 sentences of practical buying advice for someone considering this car.
Rules:
- Do NOT reference fault codes, internal IDs, or technical identifiers — describe the fault in plain English
- Mention the most common issue to watch for
- If the data supports it, suggest the best year or variant to prioritise
- Be direct and specific — no filler phrases like "it's essential to", "it's important to note", or "when considering"
- Plain prose only. No bullet points, no markdown, no headers
- If the data is too sparse to say anything meaningful, say so in one sentence rather than padding with generic advice`;

    const summary = await groqCall(apiKey, summaryPrompt);

    if (!summary) {
      return Response.json(
        { error: "AI summary generation failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    const totalRecords =
      (motData?.length ?? 0) +
      (faultData?.length ?? 0) +
      (recallData?.length ?? 0);

    return Response.json({
      make,
      model,
      year_from:    yearFrom,
      year_to:      yearTo,
      summary,
      records_used: totalRecords,
      pass_rate:    passRate,
      total_tests:  totalTests,
      verdict,
      sources: {
        mot_failures: motData?.length ?? 0,
        known_faults: faultData?.length ?? 0,
        recalls:      recallData?.length ?? 0,
      },
      // Raw arrays for display — failure reasons translated to plain English
      mot_failures: (motData ?? []).map((r: any) => ({
        reason:    resolveReason(r.failure_reason),
        frequency: r.frequency,
      })),
      known_faults: (faultData ?? []).map((r: any) => ({
        description: r.description,
        category:    r.category,
        provenance:  r.provenance,
      })),
      recalls: (recallData ?? []).map((r: any) => ({
        defect: r.defect,
      })),
    }, { headers: corsHeaders });
  },
};
