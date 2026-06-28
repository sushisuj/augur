// deno-lint-ignore-file
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeScore } from "./scoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── MOT History API ───────────────────────────────────────────────────────────

// Cache the OAuth token for the lifetime of the Deno isolate (up to ~1 hour).
// Each cold start gets a fresh token; warm invocations skip the round-trip.
let _motTokenCache: { value: string; expiresAt: number } | null = null;

async function getMOTToken(): Promise<string> {
  if (_motTokenCache && Date.now() < _motTokenCache.expiresAt) {
    return _motTokenCache.value;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: Deno.env.get("MOT_CLIENT_ID")!,
    client_secret: Deno.env.get("MOT_CLIENT_SECRET")!,
    scope: Deno.env.get("MOT_SCOPE")!,
  });

  const res = await fetch(Deno.env.get("MOT_TOKEN_URL")!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Tokens are typically valid 1 hour; cache for 55 min to be safe
  _motTokenCache = { value: data.access_token, expiresAt: Date.now() + 55 * 60 * 1000 };
  return _motTokenCache.value;
}

async function getVehicleByReg(reg: string, token: string): Promise<any | null> {
  const res = await fetch(
    `https://history.mot.api.gov.uk/v1/trade/vehicles/registration/${reg}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Api-Key": Deno.env.get("MOT_API_KEY")!,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MOT API error ${res.status}: ${text}`);
  }

  return res.json();
}

async function getVehicleByVIN(vin: string, token: string): Promise<any | null> {
  const res = await fetch(
    `https://history.mot.api.gov.uk/v1/trade/vehicles/vin/${vin}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Api-Key": Deno.env.get("MOT_API_KEY")!,
        Accept: "application/json",
      },
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MOT API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Normalisation ─────────────────────────────────────────────────────────────

function normaliseMake(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("mercedes")) return "Mercedes-Benz";
  if (lower === "vw" || lower.includes("volkswagen")) return "Volkswagen";
  if (lower.includes("vauxhall")) return "Vauxhall";
  if (lower.includes("land rover")) return "Land Rover";
  return raw.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Words that are trim/variant descriptors, not model names
const TRIM_WORDS = new Set([
  "edition", "sport", "se", "limited", "premium", "plus", "pro",
  "elite", "executive", "titanium", "zetec", "ghia", "lx", "ex",
  "dx", "active", "design", "line", "cross", "style", "motion",
]);

function normaliseModelWord(w: string): string {
  // Alphanumeric model codes: XC60, A3, GLC, RS4, CX5, 3008 → uppercase
  if (/^[A-Za-z]{1,4}\d/.test(w) || /^\d+[A-Za-z]*$/.test(w)) return w.toUpperCase();
  // Short all-cap words likely to be acronyms: GTI, AMG, TDI, TSI, TT
  if (w.length <= 4 && w === w.toUpperCase() && /^[A-Z]+$/.test(w)) return w;
  // Title case everything else
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function extractBaseModel(raw: string): string {
  const words = raw.trim().split(/\s+/);
  // Strip trailing trim-level words, keep up to 2 meaningful words
  const meaningful = words.filter((w) => !TRIM_WORDS.has(w.toLowerCase()));
  return meaningful.slice(0, 2).map(normaliseModelWord).join(" ");
}

// ── MOT history processing ────────────────────────────────────────────────────

/**
 * Returns a summary of each MOT test: date, result, mileage, failure/advisory counts.
 */
function extractMOTHistory(motTests: any[]): any[] {
  if (!motTests || motTests.length === 0) return [];

  return motTests.map((test) => ({
    date: test.completedDate?.substring(0, 10) ?? "Unknown",
    result: test.testResult ?? "UNKNOWN",
    mileage: test.odometerValue ? parseInt(test.odometerValue) : null,
    mileage_unit: test.odometerUnit ?? "MI",
    failures: (test.rfrAndComments ?? []).filter((r: any) => r.type === "FAIL").length,
    advisories: (test.rfrAndComments ?? []).filter((r: any) => r.type === "ADVISORY").length,
  }));
}

/**
 * Extracts unique failures and advisories from this specific vehicle's MOT tests.
 * Deduplicates by description, keeping the most recent occurrence.
 */
function extractVehicleIssues(motTests: any[]): any[] {
  if (!motTests || motTests.length === 0) return [];

  const seen = new Map<string, any>();

  for (const test of motTests) {
    const date = test.completedDate?.substring(0, 10) ?? "Unknown";

    for (const rfr of (test.rfrAndComments ?? [])) {
      const text = (rfr.text ?? "").trim();
      if (!text) continue;

      const type: string = rfr.type ?? "";
      if (type !== "FAIL" && type !== "ADVISORY") continue;

      const key = text.toLowerCase();

      // Keep most recent occurrence (motTests is newest-first)
      if (!seen.has(key)) {
        seen.set(key, {
          fault_description: text,
          fault_category: type === "FAIL" ? "MOT Failure" : "Advisory",
          severity: rfr.dangerous ? "High" : type === "FAIL" ? "Medium" : "Low",
          source: `This vehicle (MOT ${date})`,
          provenance: "vehicle",
        });
      }
    }
  }

  // Sort: failures before advisories, dangerous first
  const SRANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  return Array.from(seen.values()).sort(
    (a, b) => (SRANK[b.severity] ?? 0) - (SRANK[a.severity] ?? 0)
  );
}


// ── Fault deduplication ───────────────────────────────────────────────────────

function dedupFaults(faults: any[]): any[] {
  const SEVERITY_RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const seen = new Map<string, any>();
  for (const fault of faults) {
    const key = fault.fault_description.toLowerCase().trim();
    const existing = seen.get(key);
    if (!existing || (SEVERITY_RANK[fault.severity] ?? 0) > (SEVERITY_RANK[existing.severity] ?? 0)) {
      seen.set(key, fault);
    }
  }
  return Array.from(seen.values());
}

// scoring logic is in scoring.ts

// ── Main handler ──────────────────────────────────────────────────────────────

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const reg = url.searchParams.get("reg")?.toUpperCase().replace(/\s/g, "");
    const vin = url.searchParams.get("vin")?.toUpperCase().replace(/\s/g, "");

    if (!reg && !vin) {
      return Response.json({ error: "Provide either reg or vin" }, { status: 400, headers: corsHeaders });
    }

    // ── Persona (optional) ────────────────────────────────────────────────────
    let persona: Record<string, any> | null = null;
    try {
      const raw = url.searchParams.get("persona");
      if (raw && raw !== "none") persona = JSON.parse(raw);
    } catch { /* ignore malformed persona */ }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // 1. Look up vehicle via MOT History API
    let vehicle: { make: string; model: string; year: number; reg: string };
    let motHistory: any[] = [];
    let vehicleIssues: any[] = [];
    let motTests: any[] = [];

    try {
      const token = await getMOTToken();
      const motData = vin
        ? await getVehicleByVIN(vin, token)
        : await getVehicleByReg(reg!, token);

      if (!motData) {
        return Response.json({ error: "Vehicle not found" }, { status: 404, headers: corsHeaders });
      }

      const make = normaliseMake(motData.make ?? "");
      const model = extractBaseModel(motData.model ?? "");
      const year = motData.firstUsedDate
        ? parseInt(motData.firstUsedDate.substring(0, 4))
        : new Date().getFullYear();

      vehicle = { make, model, year, reg };

      motTests = motData.motTests ?? [];
      motHistory = extractMOTHistory(motTests);
      vehicleIssues = extractVehicleIssues(motTests);
    } catch (err: any) {
      return Response.json({ error: `Vehicle lookup failed: ${err.message}` }, { status: 500, headers: corsHeaders });
    }

    // 2. Call fault-search Edge Function for all model-level data
    const faultSearchUrl = new URL(
      `/functions/v1/fault-search?make=${encodeURIComponent(vehicle.make)}&model=${encodeURIComponent(vehicle.model)}&year=${vehicle.year}`,
      Deno.env.get("SUPABASE_URL")!
    );

    const faultSearchRes = await fetch(faultSearchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")!}`,
        "Content-Type": "application/json",
      },
    });

    let faultSearchData: any = { results: [], population: null, counts: { faults: 0, recalls: 0 } };
    if (faultSearchRes.ok) {
      faultSearchData = await faultSearchRes.json();
    } else {
      const errText = await faultSearchRes.text();
      return Response.json(
        { error: `fault-search failed (${faultSearchRes.status}): ${errText}`, url: faultSearchUrl.toString() },
        { status: 500, headers: corsHeaders }
      );
    }

    // Separate results by provenance
    const allResults: any[] = faultSearchData.results ?? [];

    const activeRecalls = allResults
      .filter((r: any) => r.provenance === "DVSA Recall")
      .map((r: any) => ({
        recall_number: r.recall_number,
        concern:       r.concern,
        defect:        r.description,
        remedy:        r.remedy,
        launch_date:   r.source,
        build_start:   r.build_start,
        build_end:     r.build_end,
        provenance:    "DVSA Recall",
      }));

    const rawFaults = allResults
      .filter((r: any) => r.provenance !== "DVSA Recall")
      .map((r: any) => ({
        fault_description: r.description,
        fault_category:    r.category,
        severity:          r.severity,
        source:            r.source,
        provenance:        r.provenance,
      }));

    const modelFaults = dedupFaults(rawFaults);

    const aggregatePassRate: number | undefined =
      faultSearchData.population?.pass_rate ?? undefined;
    const aggregateTotalTests: number | undefined =
      faultSearchData.population?.total_tests ?? undefined;

    // 3. Compute Augur Score using scoring.ts
    const rawTests = motTests ?? [];
    const scoring = computeScore(rawTests, modelFaults, aggregatePassRate);
    const { score, verdict, flags, breakdown } = scoring;

    // 4. Single Gemini call: fault clustering + buyer summary
    let summary = "No known faults found for this vehicle.";

    if (true) {
      const clockingNote = flags.clockingDetected
        ? `\nCRITICAL: Odometer fraud detected. The mileage on this vehicle's MOT records decreased between tests, which is physically impossible. The odometer has almost certainly been tampered with (clocked). The true mileage is unknown. This is the primary reason for the 0/100 score.\n`
        : "";

      const recurringNote = flags.recurringFailures.length > 0
        ? `\nRecurring failures on this vehicle (appeared multiple MOTs):\n${flags.recurringFailures.map((f) => `- "${f.description}" (${f.occurrences}x, most recent: ${f.mostRecentDate})`).join("\n")}`
        : "";

      const persistentNote = flags.persistentAdvisories.length > 0
        ? `\nPersistent advisories (owner has not addressed these):\n${flags.persistentAdvisories.map((f) => `- "${f.description}" (${f.occurrences}x)`).join("\n")}`
        : "";

      // ── Build persona tone block ────────────────────────────────────────────
      let personaBlock = "";
      if (persona) {
        const usageTone: Record<string, string> = {
          daily_commuter: "This buyer uses their car daily for commuting. Reliability and running costs are their top priority — flag anything suggesting frequent repairs or high maintenance bills. Mention fuel economy implications if relevant.",
          family_car:     "This buyer needs a family car. Safety is the top priority — lead with any safety-critical failures or recalls. Mention anything that affects passenger protection, child seat anchors, or NCAP implications if relevant.",
          cheap_car:      "This buyer wants to keep costs as low as possible. Frame every fault in terms of likely repair cost. Flag anything expensive to fix first. Keep language simple — assume no mechanical knowledge.",
          city_car:       "This buyer primarily drives in the city. Focus on stop-start reliability, low-speed drivetrain issues, and anything that would affect urban usability or insurance cost.",
          workhorse:      "This buyer needs a working vehicle for towing or carrying loads. Focus on drivetrain and structural reliability under heavy use. Flag any issues that would affect towing capacity or payload.",
        };

        const budgetNote: Record<string, string> = {
          under_500:  "Their annual repair budget is under £500 — flag anything likely to exceed this in a single repair.",
          "500_1500": "Their annual repair budget is £500–£1,500.",
          "1500_3000":"Their annual repair budget is £1,500–£3,000.",
          no_limit:   "Running costs are not a primary concern for this buyer.",
        };

        const sellerNote: Record<string, string> = {
          private:    "This is a private sale — there are no consumer rights protections if faults emerge after purchase. Be more cautious in tone and flag anything that should be independently inspected before committing.",
          indie_dealer:"Buying from an independent dealer. Standard consumer rights apply but standards vary.",
          main_dealer: "Buying from a main dealer — manufacturer warranty likely still applies or a dealer warranty is offered. Less need to flag minor issues.",
          unsure:      "",
        };

        const usage   = persona.usage   as string | undefined;
        const budget  = persona.budget  as string | undefined;
        const seller  = persona.seller  as string | undefined;

        const parts = [
          usage  && usageTone[usage]   ? `Buyer profile: ${usageTone[usage]}`   : "",
          budget && budgetNote[budget] ? budgetNote[budget]                      : "",
          seller && sellerNote[seller] ? sellerNote[seller]                      : "",
        ].filter(Boolean);

        if (parts.length) {
          personaBlock = `\nBUYER CONTEXT (adjust your summary tone accordingly):\n${parts.join("\n")}\n`;
        }
      }

      const prompt = `You are a used car buying assistant. A buyer is considering a ${vehicle.year} ${vehicle.make} ${vehicle.model} (reg: ${vehicle.reg}).
${personaBlock}${clockingNote}
Issues found on THIS SPECIFIC VEHICLE from its MOT history:
${vehicleIssues.length > 0 ? vehicleIssues.map((f) => `- ${f.fault_description} (${f.source})`).join("\n") : "None recorded."}
${recurringNote}${persistentNote}

Model-wide known faults for ${vehicle.make} ${vehicle.model} (${vehicle.year}):
${modelFaults.length > 0 ? modelFaults.map((f) => `- ${f.fault_description} (${f.fault_category}, severity: ${f.severity})`).join("\n") : "None recorded."}

Active DVSA recalls for this vehicle (build year ~${vehicle.year}):
${activeRecalls.length > 0 ? activeRecalls.map((r: { concern: any; defect: any; recall_number: any; launch_date: any; }) => `- ${r.concern}: ${r.defect} (Recall ${r.recall_number}, issued ${r.launch_date})`).join("\n") : "No active recalls found."}

Population reliability (DVSA MOT data, ${vehicle.make} ${vehicle.model} ${vehicle.year} bracket):
${aggregatePassRate !== undefined
  ? `${Math.round(aggregatePassRate * 100)}% MOT pass rate across ${aggregateTotalTests?.toLocaleString() ?? "many"} tests. ${aggregatePassRate >= 0.85 ? "This model is generally reliable." : aggregatePassRate >= 0.70 ? "Average reliability for its class." : "This model has a notably high failure rate."}`
  : "No population data available."}

Augur Score: ${score}/100 — ${verdict}
Clean MOT streak: ${flags.cleanStreak} consecutive passes.

Write a concise 2-3 sentence buyer summary in plain English. Do NOT use bullet points, lists, dashes, or headers — write in flowing prose only. Follow these rules strictly:
- If odometer fraud was detected, lead with that — the true mileage is unknown and the car must be avoided.
- If active recalls are listed above, tell the buyer to ask the seller whether the recall was completed, and mention that any main dealer can verify this against the VIN for free.
- If no recalls are listed, do not mention recalls at all.
- Be direct and practical — the reader may have no car knowledge. No filler phrases.
Output: plain prose only, 2-3 sentences, no formatting whatsoever.`;

      const apiKey = Deno.env.get("GROQ_API_KEY")!;
      let summaryText = "Summary unavailable.";

      for (let attempt = 1; attempt <= 3; attempt++) {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type":  "application/json",
          },
          body: JSON.stringify({
            model:      "llama-3.1-8b-instant",
            max_tokens: 1024,
            messages:   [{ role: "user", content: prompt }],
          }),
        });
        const groqData = await groqRes.json();
        if (groqRes.ok) {
          summaryText = groqData?.choices?.[0]?.message?.content ?? "Summary unavailable.";
          break;
        }
        if (groqRes.status !== 429) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      summary = summaryText;
    }

    return Response.json({
      vehicle,
      score,
      verdict,
      summary,
      flags,
      breakdown,
      mot_history: motHistory,
      vehicle_issues: vehicleIssues,
      model_faults: modelFaults,
      fault_count: vehicleIssues.length + modelFaults.length,
      mileage_warning: flags.clockingDetected
        ? "Mileage discrepancy detected between MOT tests. This is a strong indicator of odometer fraud."
        : null,
      population: aggregatePassRate !== undefined ? {
        pass_rate: aggregatePassRate,
        total_tests: aggregateTotalTests,
        source: "DVSA MOT Anonymised Test Data 2024",
      } : null,
      recalls: activeRecalls,
    }, { headers: corsHeaders });
  },
};
