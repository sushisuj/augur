/**
 * import-recalls.js
 * Reads RecallsFile.csv and inserts DVSA recall data into the Supabase faults table.
 *
 * Usage:
 *   node scripts/import-recalls.js path/to/RecallsFile.csv
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// --- Config ---
const SUPABASE_URL = "https://xtwyfppaksarclsdlzti.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Only import these makes (normalised to lowercase for matching)
const TARGET_MAKES = new Set([
  "ford", "volkswagen", "vw", "vauxhall", "bmw", "toyota", "honda",
  "nissan", "audi", "mercedes-benz", "mercedes benz", "mercedes-benz cars uk ltd",
  "mercedes benz uk limited", "renault", "peugeot", "citroen", "hyundai",
  "kia", "seat", "skoda", "volvo car", "land rover", "jaguar", "fiat",
  "mazda", "mitsubishi", "subaru", "suzuki", "lexus", "mini",
]);

// Normalise make name to something clean
function normaliseMake(raw) {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("mercedes")) return "Mercedes-Benz";
  if (lower === "vw") return "Volkswagen";
  if (lower.includes("volkswagen")) return "Volkswagen";
  if (lower.includes("toyota")) return "Toyota";
  if (lower.includes("volvo car")) return "Volvo";
  if (lower.includes("nissan")) return "Nissan";
  if (lower.includes("honda")) return "Honda";
  if (lower.includes("fiat")) return "Fiat";
  if (lower.includes("land rover")) return "Land Rover";
  // Title case everything else
  return raw.trim().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

// Parse a date string like "01/12/2006" and return the year, or null
function parseYear(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;
  const parts = dateStr.trim().split("/");
  if (parts.length === 3) {
    const year = parseInt(parts[2], 10);
    return isNaN(year) ? null : year;
  }
  return null;
}

// Very basic CSV parser that handles quoted fields
function parseCSV(content) {
  const lines = content.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_SERVICE_KEY environment variable.");
    console.error("Run: $env:SUPABASE_SERVICE_KEY='your-service-key' (PowerShell)");
    process.exit(1);
  }

  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/import-recalls.js path/to/RecallsFile.csv");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log(`Reading ${csvPath}...`);
  const content = fs.readFileSync(path.resolve(csvPath), "utf8");
  const rows = parseCSV(content);
  console.log(`Total recalls in file: ${rows.length}`);

  // Filter to target makes
  const filtered = rows.filter((r) => {
    const make = (r["Make"] || "").toLowerCase().trim();
    return [...TARGET_MAKES].some((t) => make.includes(t));
  });
  console.log(`Recalls matching target makes: ${filtered.length}`);

  // Map to faults schema
  const faults = filtered.map((r) => {
    const yearFrom = parseYear(r["Build Start"]);
    const yearTo = parseYear(r["Build End"]);

    return {
      make: normaliseMake(r["Make"] || ""),
      model: (r["Model"] || r["Recalls Model Information"] || "").trim(),
      fault_description: (r["Defect"] || "").trim(),
      fault_category: "Recall",
      severity: "High",
      source: `DVSA Recall ${(r["Recalls Number"] || "").trim()}`,
      year_from: yearFrom ?? 2000,
      year_to: yearTo ?? new Date().getFullYear(),
    };
  }).filter((f) => f.fault_description.length > 0 && f.model.length > 0);

  console.log(`Rows to insert after filtering: ${faults.length}`);

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < faults.length; i += BATCH_SIZE) {
    const batch = faults.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("faults").insert(batch);
    if (error) {
      console.error(`Error on batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`Inserted ${inserted}/${faults.length}...`);
    }
  }

  console.log(`Done. ${inserted} recalls imported.`);
}

main().catch(console.error);
