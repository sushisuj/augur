import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Get OAuth2 token from MOT History API
async function getMOTToken(): Promise<string> {
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
  return data.access_token;
}

// Look up vehicle by registration via MOT History API
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

// Normalise make name to match our DB
function normaliseMake(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("mercedes")) return "Mercedes-Benz";
  if (lower === "vw" || lower.includes("volkswagen")) return "Volkswagen";
  if (lower.includes("vauxhall")) return "Vauxhall";
  if (lower.includes("land rover")) return "Land Rover";
  // Title case
  return raw.trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Extract base model (first 2 words) for broader DB matching
function extractBaseModel(raw: string): string {
  const words = raw.trim().split(/\s+/);
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const reg = url.searchParams.get("reg")?.toUpperCase().replace(/\s/g, "");

    if (!reg) {
      return Response.json({ error: "No registration provided" }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // Look up real vehicle via MOT History API
    let vehicle: { make: string; model: string; year: number; reg: string };

    try {
      const token = await getMOTToken();
      const motData = await getVehicleByReg(reg, token);

      if (!motData) {
        return Response.json({ error: "Vehicle not found" }, { status: 404, headers: corsHeaders });
      }

      const make = normaliseMake(motData.make ?? "");
      const model = extractBaseModel(motData.model ?? "");
      const year = motData.firstUsedDate
        ? parseInt(motData.firstUsedDate.substring(0, 4))
        : new Date().getFullYear();

      vehicle = { make, model, year, reg };
    } catch (err: any) {
      return Response.json({ error: `Vehicle lookup failed: ${err.message}` }, { status: 500, headers: corsHeaders });
    }

    // Query faults table
    const { data: faults, error } = await supabase
      .from("faults")
      .select("fault_description, fault_category, severity, source, year_from, year_to")
      .ilike("make", vehicle.make)
      .ilike("model", `%${vehicle.model}%`)
      .lte("year_from", vehicle.year)
      .gte("year_to", vehicle.year)
      .order("severity", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    let summary = "No known faults found for this vehicle.";

    if (faults && faults.length > 0) {
      const faultList = faults
        .map((f) => `- ${f.fault_description} (${f.fault_category}, severity: ${f.severity})`)
        .join("\n");

      const prompt = `You are a used car buying assistant. A buyer is looking at a ${vehicle.year} ${vehicle.make} ${vehicle.model} (reg: ${vehicle.reg}).

Here are the known faults and recalls for this vehicle:
${faultList}

Write a concise 2-3 sentence summary of the main risks for a used car buyer. Be direct and practical. Highlight the most serious issues first.`;

      const apiKey = Deno.env.get("GEMINI_API_KEY");
      let geminiData: any = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        geminiData = await geminiRes.json();
        if (geminiRes.ok) break;
        if (geminiRes.status !== 503) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      summary = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Summary unavailable.";
    }

    return Response.json(
      { vehicle, summary, faults: faults ?? [], fault_count: faults?.length ?? 0 },
      { headers: corsHeaders }
    );
  },
};
