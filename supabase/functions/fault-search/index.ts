// deno-lint-ignore-file
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * fault-search Edge Function
 *
 * Queries faults and recalls tables using Postgres full-text search.
 * Returns ranked, provenance-tagged results for a given make/model/year.
 *
 * Query params:
 *   make     — vehicle make (required)
 *   model    — vehicle model (required)
 *   year     — vehicle year as integer (required)
 *   keywords — comma-separated search terms (optional)
 *              e.g. "brake,gearbox,electrical"
 *              If omitted, returns all faults/recalls for the make/model/year.
 */

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url    = new URL(req.url);
    const make   = url.searchParams.get("make")?.trim();
    const model  = url.searchParams.get("model")?.trim();
    const yearRaw = url.searchParams.get("year");
    const keywordsRaw = url.searchParams.get("keywords")?.trim();

    if (!make || !model || !yearRaw) {
      return Response.json(
        { error: "make, model, and year are required" },
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

    // Parse keywords into a Postgres tsquery string: "brake,gearbox" → "brake | gearbox"
    const keywords = keywordsRaw
      ? keywordsRaw.split(",").map((k) => k.trim()).filter(Boolean)
      : [];
    const tsquery = keywords.length > 0 ? keywords.join(" | ") : null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // ── 1. Query faults table ─────────────────────────────────────────────────
    let faultsQuery = supabase
      .from("faults")
      .select("fault_description, fault_category, severity, source, year_from, year_to")
      .ilike("make", make)
      .ilike("model", `%${model}%`)
      .lte("year_from", year)
      .gte("year_to", year);

    if (tsquery) {
      faultsQuery = faultsQuery.textSearch("fts", tsquery, {
        type: "plain",
        config: "english",
      });
    }

    const { data: rawFaults, error: faultsError } = await faultsQuery
      .order("severity", { ascending: false })
      .limit(20);

    if (faultsError) {
      return Response.json(
        { error: `Faults query failed: ${faultsError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    const faultResults = (rawFaults ?? []).map((f: any) => ({
      description:  f.fault_description,
      category:     f.fault_category,
      severity:     f.severity,
      source:       f.source,
      provenance:   (f.source ?? "").toLowerCase().includes("recall")
                      ? "DVSA Recall"
                      : (f.source ?? "").toLowerCase().includes("honest john")
                        ? "Honest John"
                        : "Curated",
    }));

    // ── 2. Query recalls table ────────────────────────────────────────────────
    let recallsQuery = supabase
      .from("recalls")
      .select('"Recalls Number","Make","Model","Concern","Defect","Remedy","Launch Date","Build Start","Build End"')
      .ilike("Make", `%${make}%`)
      .ilike("Model", `%${model}%`);

    if (tsquery) {
      recallsQuery = recallsQuery.textSearch("fts", tsquery, {
        type: "plain",
        config: "english",
      });
    }

    const { data: rawRecalls, error: recallsError } = await recallsQuery.limit(20);

    if (recallsError) {
      return Response.json(
        { error: `Recalls query failed: ${recallsError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // Filter by build date range in TypeScript (dates stored as DD/MM/YYYY text)
    function parseDMY(s: string | null): Date | null {
      if (!s || !s.trim()) return null;
      const parts = s.trim().split("/");
      if (parts.length !== 3) return null;
      const [d, m, y] = parts;
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return isNaN(date.getTime()) ? null : date;
    }

    const vehicleBuildApprox = new Date(year, 0, 1);

    const recallResults = (rawRecalls ?? [])
      .filter((r: any) => {
        const buildStart = parseDMY(r["Build Start"]);
        const buildEnd   = parseDMY(r["Build End"]);
        if (!buildStart && !buildEnd) return true;
        if (buildStart && vehicleBuildApprox < buildStart) return false;
        if (buildEnd   && vehicleBuildApprox > buildEnd)   return false;
        return true;
      })
      .map((r: any) => ({
        description:   r["Defect"],
        category:      "Recall",
        severity:      "High",
        source:        `DVSA Recall ${r["Recalls Number"]} (issued ${r["Launch Date"]})`,
        concern:       r["Concern"],
        remedy:        r["Remedy"],
        recall_number: r["Recalls Number"],
        build_start:   r["Build Start"],
        build_end:     r["Build End"],
        provenance:    "DVSA Recall",
      }));

    // ── 3. Population stats from mot_aggregate ────────────────────────────────
    const { data: aggregateRows } = await supabase
      .from("mot_aggregate")
      .select("pass_rate, total_tests")
      .ilike("make", make)
      .ilike("model", model)
      .lte("year_from", year)
      .gte("year_to", year)
      .limit(1);

    const population = aggregateRows?.[0] ?? null;

    // ── 4. Combine and return ─────────────────────────────────────────────────
    const results = [
      ...recallResults,   // recalls first — safety-critical
      ...faultResults,
    ];

    return Response.json({
      make,
      model,
      year,
      keywords,
      results,
      population: population ? {
        pass_rate:   population.pass_rate,
        total_tests: population.total_tests,
        source:      "DVSA MOT Anonymised Test Data 2024",
      } : null,
      counts: {
        faults:  faultResults.length,
        recalls: recallResults.length,
      },
    }, { headers: corsHeaders });
  },
};
