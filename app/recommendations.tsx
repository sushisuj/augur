import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0d3lmcHBha3NhcmNsc2RsenRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDQ0MjIsImV4cCI6MjA5NzA4MDQyMn0.2tF9YmxFky0MT7Y6jn3bCn3GX21FgzPevB84uv8N42A";
const MODEL_SUMMARY_URL =
  "https://xtwyfppaksarclsdlzti.supabase.co/functions/v1/model-summary";

const C = {
  bg:          "#080a07",
  glass:       "rgba(255,255,255,0.10)" as const,
  glassBorder: "rgba(255,255,255,0.20)" as const,
  accent:      "#c2d635",
  textPrimary: "#ffffff",
  textMuted:   "#888",
  tagBg:       "rgba(194,214,53,0.12)" as const,
};

// ── Data ──────────────────────────────────────────────────────────────────────

type RunningCost = "low" | "medium" | "high";
type PriceBand   = "budget" | "mid" | "premium" | "top";

type CarRecommendation = {
  id: string;
  make: string;
  model: string;
  yearRange: string;
  yearFrom: number;
  yearTo: number;
  tags: string[];
  bodyTypes: string[];       // used for proximity ranking
  runningCost: RunningCost;  // annual running cost band
  priceBand: PriceBand;      // used purchase price band
  rationale: string;         // one sentence: why this car fits this usage category
};

async function fetchModelSummary(car: CarRecommendation): Promise<{ summary: string; recordsUsed: number } | null> {
  const cacheKey = `augur_model_summary_${car.id}`;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch { /* ignore cache errors */ }

  try {
    const qs = new URLSearchParams({
      make:      car.make,
      model:     car.model,
      year_from: String(car.yearFrom),
      year_to:   String(car.yearTo),
    });

    const res = await fetch(
      `${MODEL_SUMMARY_URL}?${qs}`,
      { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );

    const text = await res.text();
    console.log(`[model-summary] ${car.make} ${car.model} → HTTP ${res.status}:`, text);

    if (!res.ok) return null;

    const data = JSON.parse(text);
    if (!data.summary) return null;

    const result = { summary: data.summary, recordsUsed: data.records_used ?? 0 };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(result));
    return result;
  } catch (err) {
    console.log(`[model-summary] fetch error for ${car.make} ${car.model}:`, err);
    return null;
  }
}

const PICKS_BY_USAGE: Record<string, CarRecommendation[]> = {

  daily_commuter: [
    {
      id: "fiesta-mk7",
      make: "Ford", model: "Fiesta",
      yearRange: "2013 – 2019", yearFrom: 2013, yearTo: 2019,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Lowest insurance groups, cheap servicing, and the 1.0 EcoBoost returns 50+ mpg in real-world commuting.",
      tags: ["Hatchback", "Low insurance", "50+ mpg", "Watch: 1.0 EcoBoost coolant loss"],
    },
    {
      id: "yaris-mk3",
      make: "Toyota", model: "Yaris",
      yearRange: "2012 – 2020", yearFrom: 2012, yearTo: 2020,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "The hybrid drivetrain recovers energy in stop-start traffic, making it one of the cheapest cars to run in urban and suburban commutes.",
      tags: ["Hybrid available", "Exceptional reliability", "Cheap to tax", "Watch: older hybrid batteries"],
    },
    {
      id: "polo-mk6",
      make: "Volkswagen", model: "Polo",
      yearRange: "2018 – 2022", yearFrom: 2018, yearTo: 2022,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "More motorway refinement than the Fiesta without meaningfully higher running costs — still a small insurance group but noticeably quieter on longer runs.",
      tags: ["Hatchback", "Refined for its class", "MQB platform", "Watch: DSG service history"],
    },
    {
      id: "focus-mk3",
      make: "Ford", model: "Focus",
      yearRange: "2011 – 2018", yearFrom: 2011, yearTo: 2018,
      bodyTypes: ["hatchback", "estate"],
      runningCost: "medium", priceBand: "budget",
      rationale: "The 1.0 EcoBoost returns 45+ mpg while the comfortable ride takes the edge off longer daily drives — and Ford's dealer network keeps servicing costs low.",
      tags: ["Hatchback / Estate", "45+ mpg", "Wide dealer network", "Watch: cooling system on 1.0 EcoBoost"],
    },
    {
      id: "civic-mk10",
      make: "Honda", model: "Civic",
      yearRange: "2017 – 2022", yearFrom: 2017, yearTo: 2022,
      bodyTypes: ["hatchback"],
      runningCost: "medium", priceBand: "mid",
      rationale: "Honda's reliability record means near-zero unexpected repair costs; the quiet, well-insulated cabin significantly reduces fatigue on longer daily commutes.",
      tags: ["Hatchback", "Outstanding reliability", "Quiet cabin", "Watch: infotainment responsiveness"],
    },
    {
      id: "octavia-mk3",
      make: "Skoda", model: "Octavia",
      yearRange: "2017 – 2023", yearFrom: 2017, yearTo: 2023,
      bodyTypes: ["hatchback", "estate"],
      runningCost: "medium", priceBand: "mid",
      rationale: "Golf underpinnings at a lower price point, with a larger, more comfortable cabin that doubles as a practical family car — running costs are similar to its VW sibling.",
      tags: ["Hatchback / Estate", "Best value in class", "VW Group platform", "Watch: DPF on short runs"],
    },
    {
      id: "3series-g20",
      make: "BMW", model: "3 Series",
      yearRange: "2019 – present", yearFrom: 2019, yearTo: 2024,
      bodyTypes: ["saloon", "estate"],
      runningCost: "high", priceBand: "premium",
      rationale: "The 330e PHEV charged at home makes short commutes nearly free, and company car tax savings make it the most financially rational premium choice for high-mileage drivers.",
      tags: ["Saloon / Estate", "330e PHEV available", "Low BIK tax", "Watch: PHEV battery condition"],
    },
    {
      id: "a4-b9",
      make: "Audi", model: "A4",
      yearRange: "2016 – 2024", yearFrom: 2016, yearTo: 2024,
      bodyTypes: ["saloon", "estate"],
      runningCost: "high", priceBand: "premium",
      rationale: "The 40 TDI returns 50+ mpg on motorway runs with long service intervals — premium running costs offset by genuine efficiency at higher annual mileage.",
      tags: ["Saloon / Estate", "50+ mpg diesel", "Long service intervals", "Watch: timing chain tensioner"],
    },
    {
      id: "c-class-w206",
      make: "Mercedes-Benz", model: "C-Class",
      yearRange: "2021 – present", yearFrom: 2021, yearTo: 2024,
      bodyTypes: ["saloon", "estate"],
      runningCost: "high", priceBand: "premium",
      rationale: "The most comfort-oriented car in the executive segment — the air suspension option and noise insulation make daily driving genuinely easier over long distances.",
      tags: ["Saloon / Estate", "Comfort-biased", "Air suspension option", "Watch: MBUX software updates"],
    },
    {
      id: "e-class-w213",
      make: "Mercedes-Benz", model: "E-Class",
      yearRange: "2016 – 2023", yearFrom: 2016, yearTo: 2023,
      bodyTypes: ["saloon", "estate"],
      runningCost: "high", priceBand: "top",
      rationale: "The 220d returns 55+ mpg on motorway runs and covers high daily mileage as cheaply per mile as many smaller cars — S-Class refinement at used prices is hard to argue with.",
      tags: ["Saloon / Estate", "55+ mpg diesel", "S-Class refinement", "Watch: AdBlue consumption"],
    },
  ],

  family_car: [
    {
      id: "zafira-tourer-c",
      make: "Vauxhall", model: "Zafira Tourer",
      yearRange: "2012 – 2018", yearFrom: 2012, yearTo: 2018,
      bodyTypes: ["suv", "estate"],
      runningCost: "low", priceBand: "budget",
      rationale: "Seven seats for the price of a large hatchback — the 1.4T is cheap to insure and easy to service at any Vauxhall dealer.",
      tags: ["7 seats", "Budget 7-seater", "Low insurance", "Watch: sliding door mechanism"],
    },
    {
      id: "galaxy-mk3",
      make: "Ford", model: "Galaxy",
      yearRange: "2015 – 2023", yearFrom: 2015, yearTo: 2023,
      bodyTypes: ["suv", "estate"],
      runningCost: "medium", priceBand: "budget",
      rationale: "The most practical 7-seater in its class — all three rows are genuinely adult-usable, and the 2.0 TDCi returns strong mpg on school-run mileage.",
      tags: ["7 seats", "Best-in-class space", "2.0 TDCi", "Watch: DPF on short journeys"],
    },
    {
      id: "touran-mk2",
      make: "Volkswagen", model: "Touran",
      yearRange: "2015 – 2022", yearFrom: 2015, yearTo: 2022,
      bodyTypes: ["suv", "estate"],
      runningCost: "medium", priceBand: "mid",
      rationale: "Golf-quality interior with flexible three-row seating — the MQB platform means low long-term ownership costs compared to most MPVs in this segment.",
      tags: ["7 seats", "MQB platform", "Quality interior", "Watch: DSG service schedule"],
    },
    {
      id: "alhambra-mk2",
      make: "SEAT", model: "Alhambra",
      yearRange: "2011 – 2020", yearFrom: 2011, yearTo: 2020,
      bodyTypes: ["suv", "estate"],
      runningCost: "medium", priceBand: "mid",
      rationale: "Electrically sliding rear doors make child-loading far less stressful than any SUV, and all seven seats fold completely flat — the most family-practical MPV you can buy used.",
      tags: ["7 seats", "Sliding doors", "Flat-fold seats", "Watch: sliding door motors"],
    },
    {
      id: "kodiaq-mk1",
      make: "Skoda", model: "Kodiaq",
      yearRange: "2017 – 2022", yearFrom: 2017, yearTo: 2022,
      bodyTypes: ["suv"],
      runningCost: "medium", priceBand: "mid",
      rationale: "7-seat SUV at the price of a 5-seat competitor — the 2.0 TDI with DSG is the pick of the range for long-distance family use.",
      tags: ["7 seats optional", "SUV", "VW Group quality", "Watch: DSG oil service"],
    },
    {
      id: "sorento-mk4",
      make: "Kia", model: "Sorento",
      yearRange: "2020 – 2023", yearFrom: 2020, yearTo: 2023,
      bodyTypes: ["suv"],
      runningCost: "medium", priceBand: "mid",
      rationale: "7-year manufacturer warranty provides genuine peace of mind for families; the PHEV variant dramatically reduces running costs if you can charge at home.",
      tags: ["7 seats", "7-year warranty", "PHEV available", "Watch: hybrid battery history"],
    },
    {
      id: "c-max-mk2",
      make: "Ford", model: "Grand C-Max",
      yearRange: "2011 – 2019", yearFrom: 2011, yearTo: 2019,
      bodyTypes: ["suv", "hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Individual sliding rear seats and a wide tailgate make it the most versatile compact MPV at budget prices — the 1.0 EcoBoost cuts fuel bills significantly.",
      tags: ["7 seats", "Sliding individual seats", "1.0 EcoBoost", "Watch: EcoBoost coolant loss"],
    },
    {
      id: "xc60-mk2",
      make: "Volvo", model: "XC60",
      yearRange: "2017 – 2022", yearFrom: 2017, yearTo: 2022,
      bodyTypes: ["suv"],
      runningCost: "high", priceBand: "premium",
      rationale: "Consistently one of the highest Euro NCAP safety ratings in its class — the City Safety auto-braking and blindspot monitoring are standard even on base trims.",
      tags: ["Euro NCAP 5-star", "City Safety standard", "T8 PHEV available", "Watch: air suspension on R-Design"],
    },
    {
      id: "xc90-mk2",
      make: "Volvo", model: "XC90",
      yearRange: "2015 – 2022", yearFrom: 2015, yearTo: 2022,
      bodyTypes: ["suv"],
      runningCost: "high", priceBand: "top",
      rationale: "Seven seats in a genuinely premium package with class-leading safety tech — the T8 Recharge makes short family runs near-free if charged regularly.",
      tags: ["7 seats", "T8 PHEV", "Top safety ratings", "Watch: air suspension maintenance"],
    },
    {
      id: "x5-g05",
      make: "BMW", model: "X5",
      yearRange: "2018 – 2022", yearFrom: 2018, yearTo: 2022,
      bodyTypes: ["suv"],
      runningCost: "high", priceBand: "top",
      rationale: "The xDrive45e PHEV covers the school run on battery power, and the optional 7-seat configuration is the roomiest in the premium SUV class.",
      tags: ["7 seats optional", "xDrive45e PHEV", "Low BIK", "Watch: PHEV battery condition"],
    },
  ],

  cheap_car: [
    {
      id: "sandero-mk2",
      make: "Dacia", model: "Sandero",
      yearRange: "2013 – 2021", yearFrom: 2013, yearTo: 2021,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "The cheapest way into a new-generation reliable car — genuinely low purchase price, rock-bottom servicing costs, and nothing complicated to go wrong.",
      tags: ["Cheapest running costs", "Simple mechanicals", "Low insurance", "Watch: early SCe engine oil use"],
    },
    {
      id: "corsa-d",
      make: "Vauxhall", model: "Corsa",
      yearRange: "2006 – 2014", yearFrom: 2006, yearTo: 2014,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "The most abundant used car in the UK — parts are cheap, any garage knows them, and sub-£1,500 examples with reasonable history are easy to find.",
      tags: ["Abundant supply", "Cheap parts", "Easy to service", "Watch: timing chain on 1.2/1.4"],
    },
    {
      id: "polo-mk5",
      make: "Volkswagen", model: "Polo",
      yearRange: "2009 – 2017", yearFrom: 2009, yearTo: 2017,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Better built than most cars at this price — the 1.2 TSI is frugal and the cabin quality is well above what you'd expect at sub-£5k values.",
      tags: ["Above-class build quality", "1.2 TSI", "Low depreciation", "Watch: DSG service on automatics"],
    },
    {
      id: "aygo-mk1",
      make: "Toyota", model: "Aygo",
      yearRange: "2014 – 2021", yearFrom: 2014, yearTo: 2021,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Toyota's reliability record at city-car prices — the 1.0 VVT-i has essentially no known failure modes and returns 55+ mpg in real-world use.",
      tags: ["Toyota reliability", "55+ mpg", "Low tax", "Watch: air conditioning effectiveness"],
    },
    {
      id: "i20-mk1",
      make: "Hyundai", model: "i20",
      yearRange: "2015 – 2020", yearFrom: 2015, yearTo: 2020,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Five-year warranty on original purchase transfers peace of mind to used buyers — the 1.2 petrol is genuinely reliable and costs almost nothing to run.",
      tags: ["5-year warranty legacy", "Reliable 1.2", "Good used value", "Watch: rust on older examples"],
    },
    {
      id: "fabia-mk3",
      make: "Skoda", model: "Fabia",
      yearRange: "2015 – 2021", yearFrom: 2015, yearTo: 2021,
      bodyTypes: ["hatchback", "estate"],
      runningCost: "low", priceBand: "budget",
      rationale: "More car than any rival at this price — the boot is comically large for a supermini, and VW Group underpinnings mean better long-term reliability than most cheap options.",
      tags: ["Best-in-class boot", "Estate available", "VW Group parts", "Watch: timing belt interval"],
    },
    {
      id: "mx5-nc",
      make: "Mazda", model: "MX-5",
      yearRange: "2005 – 2015", yearFrom: 2005, yearTo: 2015,
      bodyTypes: ["convertible", "coupe"],
      runningCost: "low", priceBand: "budget",
      rationale: "The benchmark budget convertible — sub-£5k examples are plentiful, the 1.8/2.0 is virtually indestructible, and running costs sit comfortably in hatchback territory.",
      tags: ["Convertible / Roadster", "Sub-£5k options", "Exceptional reliability", "Watch: rust on sills and arches"],
    },
    {
      id: "picanto-mk2",
      make: "Kia", model: "Picanto",
      yearRange: "2011 – 2017", yearFrom: 2011, yearTo: 2017,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Kia's seven-year warranty means used examples often still have cover remaining — the 1.0 is almost indestructible and sits in very low insurance groups.",
      tags: ["Warranty may remain", "1.0 petrol", "Low insurance", "Watch: power steering pump noise"],
    },
    {
      id: "500c-mk2",
      make: "Fiat", model: "500C",
      yearRange: "2009 – 2019", yearFrom: 2009, yearTo: 2019,
      bodyTypes: ["convertible", "hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "A folding soft-top at city-car prices — the 1.2 is frugal and cheap to insure, and the open-air experience costs almost nothing extra over the standard 500.",
      tags: ["Convertible", "City-friendly", "Low insurance", "Watch: TwinAir timing belt on turbo versions"],
    },
    {
      id: "clio-mk3",
      make: "Renault", model: "Clio",
      yearRange: "2012 – 2019", yearFrom: 2012, yearTo: 2019,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "One of the most stylish options at budget prices — the 0.9 TCe returns strong mpg and the cabin quality punches well above its price point.",
      tags: ["Style at budget prices", "0.9 TCe efficient", "Good used supply", "Watch: EDC dual-clutch reliability"],
    },
  ],

  city_car: [
    {
      id: "up-mk1",
      make: "Volkswagen", model: "Up!",
      yearRange: "2012 – 2019", yearFrom: 2012, yearTo: 2019,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "The sharpest city car ever made — pinpoint steering, tiny footprint, and the 1.0 returns 55 mpg while costing almost nothing to insure or service.",
      tags: ["Best driving city car", "55 mpg", "Tiny footprint", "Watch: timing chain on 1.0 petrol"],
    },
    {
      id: "citigo-mk1",
      make: "Skoda", model: "Citigo",
      yearRange: "2012 – 2019", yearFrom: 2012, yearTo: 2019,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Mechanically identical to the VW Up! but typically £500–£1,000 cheaper used — same excellent build quality with lower badge premium.",
      tags: ["Same as VW Up!", "Lower price", "Excellent quality", "Watch: same timing chain as Up!"],
    },
    {
      id: "aygo-mk2",
      make: "Toyota", model: "Aygo",
      yearRange: "2014 – 2021", yearFrom: 2014, yearTo: 2021,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Toyota reliability in the smallest possible package — the 1.0 has no known issues, sits in insurance group 1, and returns 55+ mpg in city stop-start traffic.",
      tags: ["Insurance group 1", "55+ mpg city", "Toyota reliability", "Watch: air con on budget trims"],
    },
    {
      id: "i10-mk2",
      make: "Hyundai", model: "i10",
      yearRange: "2013 – 2019", yearFrom: 2013, yearTo: 2019,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Wider than most city cars, so it doesn't feel cramped inside — the automatic option is particularly good for city driving without the stress of a manual in traffic.",
      tags: ["Auto available", "Surprisingly roomy", "Low insurance", "Watch: auto gearbox hesitation"],
    },
    {
      id: "500-mk3",
      make: "Fiat", model: "500",
      yearRange: "2015 – 2022", yearFrom: 2015, yearTo: 2022,
      bodyTypes: ["hatchback", "convertible"],
      runningCost: "low", priceBand: "budget",
      rationale: "The best-looking thing you can park on a narrow street — the TwinAir engine is frugal and the Convertible version opens up for pennies more than the fixed-roof.",
      tags: ["Iconic styling", "Convertible available", "Easy to park", "Watch: TwinAir timing belt"],
    },
    {
      id: "mini-f56",
      make: "MINI", model: "Hatch",
      yearRange: "2014 – 2020", yearFrom: 2014, yearTo: 2020,
      bodyTypes: ["hatchback"],
      runningCost: "medium", priceBand: "mid",
      rationale: "The most fun city car you can buy used — the Cooper S turns parking into the best part of your day, and MINI's dealer network keeps it well supported.",
      tags: ["Best driver's city car", "Cooper S option", "Premium feel", "Watch: timing chain rattle on startup"],
    },
    {
      id: "smart-eq-fortwo",
      make: "Smart", model: "EQ Fortwo",
      yearRange: "2017 – 2022", yearFrom: 2017, yearTo: 2022,
      bodyTypes: ["hatchback", "convertible"],
      runningCost: "low", priceBand: "mid",
      rationale: "Zero running costs if you charge at home and near-zero maintenance — also the easiest car to park in any city in the UK, bar none.",
      tags: ["Full electric", "Near-zero running costs", "Easiest to park", "Watch: range in cold weather"],
    },
    {
      id: "c1-mk2",
      make: "Citroën", model: "C1",
      yearRange: "2014 – 2021", yearFrom: 2014, yearTo: 2021,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "The same underpinnings as the Toyota Aygo at slightly lower used prices — the 5-door makes city parking easy without sacrificing rear access.",
      tags: ["5-door available", "Aygo underpinnings", "Low insurance", "Watch: service history gaps"],
    },
    {
      id: "picanto-mk3",
      make: "Kia", model: "Picanto",
      yearRange: "2017 – 2023", yearFrom: 2017, yearTo: 2023,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "budget",
      rationale: "Better equipped than its price suggests — even base trims get Apple CarPlay and autonomous emergency braking, things you'd pay more for elsewhere.",
      tags: ["AEB standard", "CarPlay standard", "Kia warranty", "Watch: infotainment software bugs"],
    },
    {
      id: "polo-mk6-city",
      make: "Volkswagen", model: "Polo",
      yearRange: "2018 – 2022", yearFrom: 2018, yearTo: 2022,
      bodyTypes: ["hatchback"],
      runningCost: "low", priceBand: "mid",
      rationale: "Bigger than a true city car but still easy to thread through traffic — the 1.0 TSI 95 hits the sweet spot of city usability and motorway capability for a daily driver.",
      tags: ["City + motorway capable", "1.0 TSI 95", "MQB platform", "Watch: DSG oil service history"],
    },
  ],

  workhorse: [
    {
      id: "l200-mk5",
      make: "Mitsubishi", model: "L200",
      yearRange: "2015 – 2019", yearFrom: 2015, yearTo: 2019,
      bodyTypes: ["pickup"],
      runningCost: "medium", priceBand: "budget",
      rationale: "3.1-tonne tow rating and a 1-tonne payload at the lowest price point in this class — the 2.4 DI-D is less powerful than rivals but near-bulletproof over high mileage.",
      tags: ["3.1t tow rating", "1t payload", "Durable 2.4 DI-D", "Watch: rear diff on high-mileage examples"],
    },
    {
      id: "ranger-t6",
      make: "Ford", model: "Ranger",
      yearRange: "2012 – 2019", yearFrom: 2012, yearTo: 2019,
      bodyTypes: ["pickup"],
      runningCost: "medium", priceBand: "budget",
      rationale: "The most common pickup truck in the UK means the widest parts availability and the most competitive independent servicing costs — the 2.2 TDCi is well proven.",
      tags: ["Most popular pickup", "Wide parts availability", "2.2 TDCi proven", "Watch: EGR valve on high mileage"],
    },
    {
      id: "hilux-mk8",
      make: "Toyota", model: "Hilux",
      yearRange: "2016 – 2021", yearFrom: 2016, yearTo: 2021,
      bodyTypes: ["pickup"],
      runningCost: "medium", priceBand: "mid",
      rationale: "The benchmark for durability — if the car needs to work hard every day without failure and live on a farm or building site, nothing else comes close.",
      tags: ["Legendary reliability", "Work-site proven", "High resale value", "Watch: higher purchase price premium"],
    },
    {
      id: "navara-np300",
      make: "Nissan", model: "Navara",
      yearRange: "2016 – 2021", yearFrom: 2016, yearTo: 2021,
      bodyTypes: ["pickup"],
      runningCost: "medium", priceBand: "mid",
      rationale: "Independent rear suspension makes it significantly more comfortable to drive daily compared to solid-axle pickups — a better all-rounder if it doubles as a daily driver.",
      tags: ["Independent rear suspension", "2.3 dCi twin-turbo", "Most car-like pickup", "Watch: rear chassis flex reports"],
    },
    {
      id: "amarok-v6",
      make: "Volkswagen", model: "Amarok",
      yearRange: "2016 – 2022", yearFrom: 2016, yearTo: 2022,
      bodyTypes: ["pickup"],
      runningCost: "high", priceBand: "premium",
      rationale: "The 3.0 V6 TDI produces 550Nm — more torque than any rival — and the interior quality is closer to an executive car than a working truck.",
      tags: ["3.0 V6 TDI", "550Nm torque", "Premium interior", "Watch: DSG service history essential"],
    },
    {
      id: "caddy-mk4",
      make: "Volkswagen", model: "Caddy",
      yearRange: "2015 – 2020", yearFrom: 2015, yearTo: 2020,
      bodyTypes: ["pickup", "estate"],
      runningCost: "low", priceBand: "budget",
      rationale: "The urban workhorse — a 4.2m³ load bay in a car-derived van that parks like a hatchback, with running costs well below any pickup truck.",
      tags: ["4.2m³ load bay", "Compact dimensions", "Car-derived running costs", "Watch: DSG clutch on early models"],
    },
    {
      id: "transit-connect-mk2",
      make: "Ford", model: "Transit Connect",
      yearRange: "2013 – 2021", yearFrom: 2013, yearTo: 2021,
      bodyTypes: ["pickup", "estate"],
      runningCost: "low", priceBand: "budget",
      rationale: "750kg payload in a van that drives like a Focus — the 1.5 EcoBlue is efficient, and Ford's vast dealer network keeps service costs as low as any light commercial.",
      tags: ["750kg payload", "Drives like a car", "Low service costs", "Watch: EcoBlue injectors at high mileage"],
    },
    {
      id: "defender-mk1",
      make: "Land Rover", model: "Defender",
      yearRange: "2012 – 2016", yearFrom: 2012, yearTo: 2016,
      bodyTypes: ["suv", "pickup"],
      runningCost: "high", priceBand: "premium",
      rationale: "Unmatched off-road capability with commercial payload options — a 90 or 110 hardtop does everything no other vehicle on this list can, and values are holding firm.",
      tags: ["Best off-road", "Holds value", "Commercial variants", "Watch: everything — needs regular maintenance"],
    },
    {
      id: "landcruiser-150",
      make: "Toyota", model: "Land Cruiser",
      yearRange: "2010 – 2018", yearFrom: 2010, yearTo: 2018,
      bodyTypes: ["suv"],
      runningCost: "high", priceBand: "premium",
      rationale: "The closest thing to a Toyota Hilux in SUV form — 3.5-tonne tow rating, proper low-range transfer box, and a durability record that makes 250,000 miles entirely unremarkable.",
      tags: ["3.5t tow rating", "Low-range 4WD", "250k+ mile proven", "Watch: suspension wear on offroad examples"],
    },
    {
      id: "dmax-mk3",
      make: "Isuzu", model: "D-Max",
      yearRange: "2017 – 2021", yearFrom: 2017, yearTo: 2021,
      bodyTypes: ["pickup"],
      runningCost: "medium", priceBand: "mid",
      rationale: "5-year/125k-mile warranty on original purchase — a serious workhorse at a lower price than the Hilux with comparable durability from Isuzu's commercial vehicle heritage.",
      tags: ["5-year/125k warranty", "3.5t tow rating", "Commercial heritage", "Watch: DPF on site-use examples"],
    },
  ],
};

// ── Proximity map ─────────────────────────────────────────────────────────────
// Ordered from closest match to furthest for each body type.
// Position in array = proximity rank (lower = closer).

const BODY_TYPE_PROXIMITY: Record<string, string[]> = {
  hatchback:   ["saloon", "estate", "coupe", "suv", "convertible", "pickup"],
  saloon:      ["hatchback", "estate", "coupe", "suv", "convertible", "pickup"],
  estate:      ["saloon", "suv", "hatchback", "pickup", "coupe", "convertible"],
  suv:         ["estate", "pickup", "hatchback", "saloon", "coupe", "convertible"],
  coupe:       ["hatchback", "saloon", "convertible", "estate", "suv", "pickup"],
  convertible: ["coupe", "hatchback", "saloon", "estate", "suv", "pickup"],
  pickup:      ["suv", "estate", "saloon", "hatchback", "coupe", "convertible"],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pickRecommendations(persona: Record<string, any> | null): {
  primary: CarRecommendation;
  others: CarRecommendation[];
} {
  const usage     = persona?.usage ?? "daily_commuter";
  const bodyTypes: string[] = persona?.body_type ?? [];

  // Get the pool for this usage type, fall back to daily_commuter
  const pool = (PICKS_BY_USAGE[usage]?.length ? PICKS_BY_USAGE[usage] : PICKS_BY_USAGE["daily_commuter"]) as CarRecommendation[];

  // Primary: first car in the pool matching the user's preferred body type
  let primaryBodyType = "hatchback";
  let primary: CarRecommendation | undefined;
  for (const bt of bodyTypes) {
    primary = pool.find((p) => p.bodyTypes.includes(bt));
    if (primary) { primaryBodyType = bt; break; }
  }
  if (!primary) primary = pool[0];

  // Others: remaining pool sorted by body type proximity
  const proximityOrder = BODY_TYPE_PROXIMITY[primaryBodyType] ?? [];
  const others = pool
    .filter((p) => p.id !== primary!.id)
    .sort((a, b) => {
      const rankA = proximityOrder.findIndex((bt) => a.bodyTypes.includes(bt));
      const rankB = proximityOrder.findIndex((bt) => b.bodyTypes.includes(bt));
      return (rankA === -1 ? 999 : rankA) - (rankB === -1 ? 999 : rankB);
    });

  return { primary, others };
}

// ── Components ────────────────────────────────────────────────────────────────

function CarCard({
  car,
  isTop,
  summary,
  recordsUsed,
  timedOut,
  onCheck,
}: {
  car: CarRecommendation;
  isTop: boolean;
  summary: string | null | undefined; // undefined = loading, null = failed, string = done
  recordsUsed: number;
  timedOut: boolean;
  onCheck: () => void;
}) {
  return (
    <View style={[styles.card, isTop && styles.cardTop]}>
      {isTop && (
        <View style={styles.choiceBadge}>
          <Text style={styles.choiceBadgeText}>AUGUR'S CHOICE</Text>
        </View>
      )}

      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardMake}>{car.make}</Text>
          <Text style={[styles.cardModel, isTop && styles.cardModelTop]}>{car.model}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text style={styles.cardYear}>{car.yearRange}</Text>
          <View style={[styles.costBadge, styles[`cost_${car.runningCost}`]]}>
            <Text style={styles.costBadgeText}>
              {car.runningCost === "low" ? "Low running cost" : car.runningCost === "medium" ? "Medium running cost" : "High running cost"}
            </Text>
          </View>
        </View>
      </View>

      {/* Why this car for this usage */}
      <Text style={styles.rationale}>{car.rationale}</Text>

      {/* AI summary — undefined = still loading, null = failed, string = done */}
      {summary === undefined ? (
        <View style={styles.summaryLoading}>
          <ActivityIndicator size="small" color={C.textMuted} />
          <Text style={styles.summaryLoadingText}>
            {timedOut ? "Sorry, this is taking longer than usual." : "Analysing records…"}
          </Text>
        </View>
      ) : summary ? (
        <View style={styles.summaryBlock}>
          <Text style={styles.summaryText}>{summary}</Text>
          {recordsUsed > 0 && (
            <Text style={styles.summaryAttribution}>
              Based on {recordsUsed} verified record{recordsUsed !== 1 ? "s" : ""} · AI summary
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.tags}>
        {car.tags.map((t) => (
          <View key={t} style={styles.tag}>
            <Text style={styles.tagText}>{t}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.checkBtn, isTop && styles.checkBtnTop]}
        onPress={onCheck}
        activeOpacity={0.8}
      >
        <Text style={[styles.checkBtnText, isTop && styles.checkBtnTextTop]}>
          Check a {car.make} {car.model}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

// undefined = not yet fetched (show spinner), null = fetch failed (show nothing), object = done
type SummaryMap = Record<string, { summary: string; recordsUsed: number } | null | undefined>;

export default function RecommendationsScreen() {
  const router = useRouter();
  const [primary,   setPrimary]   = useState<CarRecommendation>(PICKS_BY_USAGE.daily_commuter[0]);
  const [others,    setOthers]    = useState<CarRecommendation[]>(PICKS_BY_USAGE.daily_commuter.slice(1));
  const [summaries, setSummaries] = useState<SummaryMap>({});
  const [timedOut,  setTimedOut]  = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("augur_persona").then((raw) => {
      const persona = raw ? JSON.parse(raw) : null;
      const { primary: p, others: o } = pickRecommendations(persona);
      setPrimary(p);
      setOthers(o);

      // After 4s, flip timedOut so any still-spinning cards show a message instead
      const timeout = setTimeout(() => setTimedOut(true), 4000);

      // Fetch primary immediately, then others staggered to avoid Groq rate limits
      fetchModelSummary(p).then((result) => {
        setSummaries((prev) => ({ ...prev, [p.id]: result }));
      });

      o.forEach((car, i) => {
        setTimeout(() => {
          fetchModelSummary(car).then((result) => {
            setSummaries((prev) => ({ ...prev, [car.id]: result }));
          });
        }, 1000 * (i + 1)); // 1s, 2s, 3s... between each
      });
    });
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Good picks for you</Text>
        <Text style={styles.subtitle}>
          Based on your preferences. Tap any card to start checking that model.
        </Text>
      </View>

      {/* ── Primary pick ── */}
      <CarCard
        isTop
        car={primary}
        summary={primary.id in summaries ? (summaries[primary.id]?.summary ?? null) : undefined}
        recordsUsed={summaries[primary.id]?.recordsUsed ?? 0}
        timedOut={timedOut}
        onCheck={() => router.push("/home")}
      />

      {/* ── Close choices ── */}
      <Text style={styles.sectionLabel}>Close choices</Text>
      {others.map((car) => (
        <CarCard
          key={car.id}
          isTop={false}
          car={car}
          summary={car.id in summaries ? (summaries[car.id]?.summary ?? null) : undefined}
          recordsUsed={summaries[car.id]?.recordsUsed ?? 0}
          timedOut={timedOut}
          onCheck={() => router.push("/home")}
        />
      ))}

      {/* ── CTA ── */}
      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.replace("/dashboard")}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Go to dashboard</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 24, paddingBottom: 48 },

  // Header
  header:   { marginBottom: 24, marginTop: 16 },
  title:    { fontSize: 28, fontWeight: "800", color: C.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textMuted, lineHeight: 21 },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 12,
  },

  // Card base
  card: {
    backgroundColor: C.glass,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 14,
  },
  // Top pick — accent ring
  cardTop: {
    borderWidth: 2,
    borderColor: C.accent,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },

  // Augur's Choice badge
  choiceBadge: {
    alignSelf: "flex-start",
    backgroundColor: C.accent,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  choiceBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: C.bg,
    letterSpacing: 1,
  },

  // Card internals
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardMake: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  cardModel:    { fontSize: 22, fontWeight: "800", color: C.textPrimary },
  cardModelTop: { fontSize: 24 },
  cardYear:     { fontSize: 13, color: C.textMuted, marginTop: 4 },
  cardPitch:    { fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 21 },

  // Rationale
  rationale: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    lineHeight: 19,
    fontStyle: "italic",
  },

  // Running cost badge
  costBadge: {
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  costBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
  },
  cost_low: {
    backgroundColor: "rgba(74,222,128,0.15)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.3)",
  } as any,
  cost_medium: {
    backgroundColor: "rgba(251,191,36,0.15)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.3)",
  } as any,
  cost_high: {
    backgroundColor: "rgba(248,113,113,0.15)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.3)",
  } as any,

  // Summary
  summaryLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  summaryLoadingText: {
    fontSize: 13,
    color: C.textMuted,
  },
  summaryTimeout: {
    fontSize: 13,
    color: C.textMuted,
    fontStyle: "italic",
  },
  summaryBlock: {
    gap: 6,
  },
  summaryText: {
    fontSize: 14,
    color: "rgba(255,255,255,0.80)",
    lineHeight: 22,
  },
  summaryAttribution: {
    fontSize: 11,
    color: C.textMuted,
    fontStyle: "italic",
  },

  // Tags
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag:  {
    backgroundColor: C.tagBg,
    borderWidth: 1,
    borderColor: "rgba(194,214,53,0.25)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 12, fontWeight: "600", color: C.accent },

  // Check button
  checkBtn: {
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  checkBtnTop: {
    borderColor: C.accent,
    backgroundColor: "rgba(194,214,53,0.08)",
  },
  checkBtnText:    { fontSize: 14, fontWeight: "700", color: C.textMuted },
  checkBtnTextTop: { color: C.accent },

  // Bottom CTA
  btn: {
    backgroundColor: C.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { fontSize: 16, fontWeight: "700", color: C.bg },
});
