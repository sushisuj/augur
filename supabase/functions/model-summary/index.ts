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

async function groqCall(apiKey: string, prompt: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:      "llama-3.1-8b-instant",
        max_tokens: 200,
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

    // ── Query 1: Top MOT failure reasons for this model ──────────────────────
    const { data: motData } = await supabase
      .from("mot_aggregate")
      .select("failure_reason, frequency")
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

    const totalRecords =
      (motData?.length ?? 0) +
      (faultData?.length ?? 0) +
      (recallData?.length ?? 0);

    // ── Build grounded prompt ─────────────────────────────────────────────────
    const motSection = motData?.length
      ? `MOT failure data (most common failures):\n${motData
          .map((r: any) => `- ${r.failure_reason} (frequency: ${r.frequency})`)
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

    const prompt = `You are a UK used car buying assistant writing a short summary for a car buying app.

Vehicle: ${yearFrom}–${yearTo} ${make} ${model}

Here is the verified data we have for this model from our database:

${motSection}

${faultSection}

${recallSection}

Using only the data above, write 2–3 sentences of practical buying advice for someone considering this car.
Rules:
- Do NOT reference fault codes, internal IDs, or technical identifiers — describe the fault in plain English instead (e.g. "lighting failures" not "code 31194")
- Mention the most common issue to watch for
- If the data supports it, suggest the best year or variant to prioritise
- Be direct and specific — no filler phrases like "it's essential to", "it's important to note", or "when considering"
- Plain prose only. No bullet points, no markdown, no headers
- If the data is too sparse to say anything meaningful, say so in one sentence rather than padding with generic advice`;

    const apiKey = Deno.env.get("GROQ_API_KEY")!;
    const summary = await groqCall(apiKey, prompt);

    if (!summary) {
      return Response.json(
        { error: "AI summary generation failed" },
        { status: 500, headers: corsHeaders }
      );
    }

    return Response.json({
      make,
      model,
      year_from:      yearFrom,
      year_to:        yearTo,
      summary,
      records_used:   totalRecords,
      sources: {
        mot_failures: motData?.length ?? 0,
        known_faults: faultData?.length ?? 0,
        recalls:      recallData?.length ?? 0,
      },
    }, { headers: corsHeaders });
  },
};
