/**
 * import-mot-failures.js
 *
 * Processes DVSA MOT 2024 data and imports common failure patterns into the faults table.
 *
 * Usage:
 *   node scripts/import-mot-failures.js "path/to/Data Files"
 *
 * Requires:
 *   $env:SUPABASE_SERVICE_KEY = 'your-service-role-key'
 *
 * The Data Files folder must contain:
 *   - item_detail.csv         (from lookup.zip)
 *   - item_group.csv          (from lookup.zip)
 *   - MOT Testing data failure item (2024)/test_item_YYYYMM.csv
 *   - MOT testing data results (2024)/test_result_YYYYMM.csv
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://xtwyfppaksarclsdlzti.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Only import failures that affect at least this fraction of tested vehicles
const MIN_FAILURE_RATE = 0.02; // 2%

// Maximum faults to import per (make, model, year) combination
const TOP_N_PER_GROUP = 15;

const TARGET_MAKES_LOWER = new Set([
  "ford", "volkswagen", "vw", "vauxhall", "bmw", "toyota", "honda",
  "nissan", "audi", "mercedes-benz", "mercedes benz", "renault", "peugeot",
  "citroen", "hyundai", "kia", "seat", "skoda", "volvo", "land rover",
  "jaguar", "fiat", "mazda", "mitsubishi", "subaru", "suzuki", "lexus", "mini",
]);

const MONTHS = [
  "202401","202402","202403","202404","202405","202406",
  "202407","202408","202409","202410","202411","202412",
];

// ── Normalise helpers ─────────────────────────────────────────────────────────

function normaliseMake(raw) {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("mercedes")) return "Mercedes-Benz";
  if (lower === "vw" || lower.includes("volkswagen")) return "Volkswagen";
  if (lower.includes("vauxhall")) return "Vauxhall";
  if (lower.includes("land rover")) return "Land Rover";
  if (lower.includes("toyota")) return "Toyota";
  if (lower.includes("nissan")) return "Nissan";
  if (lower.includes("honda")) return "Honda";
  if (lower.includes("fiat")) return "Fiat";
  if (lower.includes("volvo")) return "Volvo";
  // Title case everything else
  return raw.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function normaliseModel(raw) {
  return raw.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function isTargetMake(raw) {
  const lower = raw.toLowerCase().trim();
  return [...TARGET_MAKES_LOWER].some(t => lower.includes(t));
}

// ── CSV streaming ─────────────────────────────────────────────────────────────

/**
 * Streams a pipe-separated or comma-separated CSV file line by line.
 * Calls onRow(rowObject) for each data row.
 */
function streamCSV(filePath, separator, onRow) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers = null;
    let lineNum = 0;

    rl.on("line", (line) => {
      lineNum++;
      if (!line.trim()) return;
      const values = line.split(separator);
      if (lineNum === 1) {
        headers = values.map(h => h.trim());
        return;
      }
      const row = {};
      headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
      onRow(row);
    });

    rl.on("close", resolve);
    rl.on("error", reject);
    stream.on("error", reject);
  });
}

// ── Load RFR lookup ───────────────────────────────────────────────────────────

/**
 * Returns a Map<rfr_id (number), { description: string, category: string }>
 */
async function loadLookup(dataDir) {
  console.log("Loading RFR lookup tables...");

  // item_group: test_item_id → { name, parent_id } per test_class_id
  // We'll prefer class 4 (passenger cars) but fall back to any class
  const groupByItemId = new Map(); // test_item_id → item_name (prefer class 4)

  await streamCSV(path.join(dataDir, "item_group.csv"), "|", (row) => {
    const itemId = parseInt(row["test_item_id"]);
    const classId = parseInt(row["test_class_id"]);
    const name = row["item_name"] ?? "";
    const parentId = parseInt(row["parent_id"]);

    if (!groupByItemId.has(itemId)) {
      groupByItemId.set(itemId, { name, parentId, classId });
    } else if (classId === 4) {
      // Prefer class 4 (passenger cars)
      groupByItemId.set(itemId, { name, parentId, classId });
    }
  });

  // Build top-level category by following parent_id chain
  function getTopCategory(testItemId) {
    let current = testItemId;
    let depth = 0;
    let lastName = null;
    while (depth < 10) {
      const entry = groupByItemId.get(current);
      if (!entry) break;
      if (entry.parentId === 0 || entry.parentId === current) {
        // This is a top-level or root node — use the one before it
        return lastName ?? entry.name;
      }
      lastName = entry.name;
      current = entry.parentId;
      depth++;
    }
    return lastName ?? "General";
  }

  // item_detail: rfr_id → { description, test_item_id } per test_class_id
  const rfrLookup = new Map(); // rfr_id → { description, category }

  await streamCSV(path.join(dataDir, "item_detail.csv"), "|", (row) => {
    const rfrId = parseInt(row["rfr_id"]);
    const classId = parseInt(row["test_class_id"]);
    const desc = (row["rfr_insp_manual_desc"] || row["rfr_desc"] || "").trim();
    const testItemId = parseInt(row["test_item_id"]);

    if (!desc) return;

    if (!rfrLookup.has(rfrId)) {
      const category = getTopCategory(testItemId);
      rfrLookup.set(rfrId, { description: desc, category, classId });
    } else if (classId === 4) {
      // Prefer class 4 descriptions
      const category = getTopCategory(testItemId);
      rfrLookup.set(rfrId, { description: desc, category, classId });
    }
  });

  console.log(`Loaded ${rfrLookup.size} RFR descriptions.`);
  return rfrLookup;
}

// ── Process one month ─────────────────────────────────────────────────────────

async function processMonth(month, dataDir, failureCounts, testCounts) {
  const resultFile = path.join(
    dataDir,
    "MOT testing data results (2024)",
    `test_result_${month}.csv`
  );
  const itemFile = path.join(
    dataDir,
    "MOT Testing data failure item (2024)",
    `test_item_${month}.csv`
  );

  if (!fs.existsSync(resultFile) || !fs.existsSync(itemFile)) {
    console.log(`  Skipping ${month} — files not found.`);
    return;
  }

  // Pass 1: build testId → vehicleKey map for target makes only
  // vehicleKey = `${make}|${model}|${year}`
  const vehicleMap = new Map();
  let resultRows = 0;

  await streamCSV(resultFile, ",", (row) => {
    resultRows++;
    const rawMake = row["make"] ?? "";
    if (!isTargetMake(rawMake)) return;

    const testId = row["test_id"];
    if (!testId) return;

    // Only class 4 (passenger cars)
    if (row["test_class_id"] !== "4") return;

    const make = normaliseMake(rawMake);
    const model = normaliseModel(row["model"] ?? "");
    if (!model) return;

    // Year from first_use_date (YYYY-MM-DD)
    const firstUse = row["first_use_date"] ?? "";
    const year = parseInt(firstUse.substring(0, 4));
    if (isNaN(year) || year < 1990 || year > 2024) return;

    const vehicleKey = `${make}|${model}|${year}`;
    vehicleMap.set(testId, vehicleKey);

    // Count total tests per group
    testCounts.set(vehicleKey, (testCounts.get(vehicleKey) ?? 0) + 1);
  });

  console.log(`  ${month}: ${resultRows.toLocaleString()} result rows, ${vehicleMap.size.toLocaleString()} target vehicles`);

  // Pass 2: count failures
  let itemRows = 0;
  let matched = 0;

  await streamCSV(itemFile, ",", (row) => {
    itemRows++;

    // Only count actual failures (F = fail), not advisories
    if (row["rfr_type_code"] !== "F") return;

    const testId = row["test_id"];
    const vehicleKey = vehicleMap.get(testId);
    if (!vehicleKey) return;

    const rfrId = row["rfr_id"];
    if (!rfrId) return;

    const failKey = `${vehicleKey}|${rfrId}`;
    failureCounts.set(failKey, (failureCounts.get(failKey) ?? 0) + 1);
    matched++;
  });

  console.log(`  ${month}: ${itemRows.toLocaleString()} item rows, ${matched.toLocaleString()} matched failures`);

  // Free memory before next month
  vehicleMap.clear();
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_SERVICE_KEY) {
    console.error("Missing SUPABASE_SERVICE_KEY. Run:");
    console.error("  $env:SUPABASE_SERVICE_KEY='your-key'");
    process.exit(1);
  }

  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('Usage: node scripts/import-mot-failures.js "path/to/Data Files"');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load lookup tables
  const rfrLookup = await loadLookup(dataDir);

  // Process all months
  // failureCounts: `${make}|${model}|${year}|${rfrId}` → count
  // testCounts:    `${make}|${model}|${year}` → count
  const failureCounts = new Map();
  const testCounts = new Map();

  for (const month of MONTHS) {
    process.stdout.write(`Processing ${month}... `);
    await processMonth(month, dataDir, failureCounts, testCounts);
  }

  console.log("\nAggregating results...");

  // Group failures by (make, model, year) and sort by rate descending
  // structure: groupKey → [{ rfrId, count, rate }]
  const grouped = new Map();

  for (const [failKey, count] of failureCounts) {
    const lastPipe = failKey.lastIndexOf("|");
    const vehicleKey = failKey.substring(0, lastPipe);
    const rfrId = parseInt(failKey.substring(lastPipe + 1));

    const total = testCounts.get(vehicleKey) ?? 0;
    if (total === 0) continue;

    const rate = count / total;
    if (rate < MIN_FAILURE_RATE) continue;

    if (!grouped.has(vehicleKey)) grouped.set(vehicleKey, []);
    grouped.get(vehicleKey).push({ rfrId, count, rate });
  }

  // Build faults rows
  const faults = [];

  for (const [vehicleKey, failures] of grouped) {
    const [make, model, yearStr] = vehicleKey.split("|");
    const year = parseInt(yearStr);

    // Sort by rate desc, take top N
    failures.sort((a, b) => b.rate - a.rate);
    const top = failures.slice(0, TOP_N_PER_GROUP);

    for (const { rfrId, rate } of top) {
      const rfr = rfrLookup.get(rfrId);
      if (!rfr) continue;

      let severity;
      if (rate >= 0.15) severity = "High";
      else if (rate >= 0.05) severity = "Medium";
      else severity = "Low";

      faults.push({
        make,
        model,
        fault_description: rfr.description,
        fault_category: rfr.category,
        severity,
        source: "MOT Data 2024",
        year_from: year,
        year_to: year,
      });
    }
  }

  console.log(`Faults to insert: ${faults.length.toLocaleString()}`);

  if (faults.length === 0) {
    console.log("Nothing to insert — check your data paths and threshold settings.");
    return;
  }

  // Insert in batches of 500
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < faults.length; i += BATCH_SIZE) {
    const batch = faults.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("faults").insert(batch);
    if (error) {
      console.error(`Error on batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\rInserted ${inserted}/${faults.length}...`);
    }
  }

  console.log(`\nDone. ${inserted} MOT fault records imported.`);
}

main().catch(console.error);
