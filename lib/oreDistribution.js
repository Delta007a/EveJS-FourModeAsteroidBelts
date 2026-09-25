"use strict";

const { DEFAULTS, normalizeMode } = require("../config");

const FAMILY_IDS = Object.freeze({
  Veldspar: [1230, 17470, 17471], Scordite: [1228, 17463, 17464],
  Pyroxeres: [1224, 17459, 17460], Plagioclase: [18, 17455, 17456],
  Omber: [1227, 17867, 17868], Kernite: [20, 17452, 17453],
  Jaspet: [1226, 17448, 17449], Hemorphite: [1231, 17444, 17445],
  Hedbergite: [21, 17440, 17441], "Dark Ochre": [1232, 17436, 17437],
  Gneiss: [1229, 17865, 17866], Crokite: [1225, 17432, 17433],
  Bistot: [1223, 17428, 17429], Arkonor: [22, 17425, 17426],
  Mercoxit: [11396, 17869, 17870], Spodumain: [19, 17466, 17467],
});
for (const ids of Object.values(FAMILY_IDS)) Object.freeze(ids);
const FAMILY_BY_ID = new Map(Object.entries(FAMILY_IDS).flatMap(([name, ids]) => ids.map((id) => [id, name])));

const PRE = Object.freeze({
  A: "Scordite,Veldspar", B: "Pyroxeres,Scordite,Veldspar", B1: "Kernite,Pyroxeres,Scordite,Veldspar", B2: "Jaspet,Kernite,Pyroxeres,Scordite,Veldspar", B3: "Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Veldspar",
  C: "Plagioclase,Pyroxeres,Scordite,Veldspar", C1: "Kernite,Plagioclase,Pyroxeres,Scordite,Veldspar", C2: "Hedbergite,Kernite,Plagioclase,Pyroxeres,Scordite,Veldspar",
  D: "Plagioclase,Scordite,Veldspar", D1: "Plagioclase,Scordite,Veldspar,Omber", D2: "Jaspet,Plagioclase,Scordite,Veldspar,Omber", D3: "Hemorphite,Jaspet,Plagioclase,Scordite,Veldspar,Omber",
  E: "Kernite,Plagioclase,Scordite,Veldspar,Omber", E1: "Hedbergite,Kernite,Plagioclase,Scordite,Veldspar,Omber",
  F: "Hedbergite,Hemorphite,Scordite,Veldspar,Omber", F1: "Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Omber", F2: "Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Gneiss,Omber", F3: "Bistot,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Gneiss,Omber", F4: "Arkonor,Bistot,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Gneiss,Omber", F5: "Arkonor,Bistot,Hedbergite,Hemorphite,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Omber", F6: "Arkonor,Bistot,Hedbergite,Hemorphite,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber", F7: "Arkonor,Bistot,Hedbergite,Hemorphite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber",
  G: "Kernite,Plagioclase,Scordite,Veldspar,Omber", G1: "Kernite,Plagioclase,Scordite,Veldspar,Gneiss,Omber", G2: "Kernite,Plagioclase,Pyroxeres,Scordite,Veldspar,Gneiss,Omber", G3: "Kernite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Omber", G4: "Bistot,Kernite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Omber", G5: "Bistot,Crokite,Kernite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Omber", G6: "Bistot,Crokite,Kernite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber", G7: "Bistot,Crokite,Dark Ochre,Kernite,Plagioclase,Pyroxeres,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber",
  H: "Hemorphite,Jaspet,Pyroxeres,Scordite,Veldspar", H1: "Hedbergite,Hemorphite,Jaspet,Pyroxeres,Scordite,Veldspar", H2: "Dark Ochre,Hedbergite,Hemorphite,Jaspet,Pyroxeres,Scordite,Veldspar", H3: "Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Veldspar", H4: "Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Veldspar", H5: "Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Spodumain,Veldspar", H6: "Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Spodumain,Veldspar,Mercoxit", H7: "Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Pyroxeres,Scordite,Spodumain,Veldspar,Mercoxit",
  I: "Hedbergite,Hemorphite,Scordite,Veldspar,Omber", I1: "Hedbergite,Hemorphite,Jaspet,Scordite,Veldspar,Omber", I2: "Hedbergite,Hemorphite,Jaspet,Scordite,Spodumain,Veldspar,Omber", I3: "Hedbergite,Hemorphite,Jaspet,Scordite,Spodumain,Veldspar,Omber", I4: "Dark Ochre,Hedbergite,Hemorphite,Jaspet,Scordite,Spodumain,Veldspar,Gneiss,Omber", I5: "Arkonor,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Scordite,Spodumain,Veldspar,Gneiss,Omber", I6: "Arkonor,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber", I7: "Arkonor,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Kernite,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber",
  J: "Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J1: "Dark Ochre,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J2: "Crokite,Dark Ochre,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J3: "Bistot,Crokite,Dark Ochre,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J4: "Bistot,Crokite,Dark Ochre,Hemorphite,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J5: "Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar", J6: "Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar,Mercoxit", J7: "Arkonor,Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Jaspet,Plagioclase,Pyroxeres,Scordite,Veldspar,Mercoxit",
  K: "Hedbergite,Hemorphite,Scordite,Veldspar,Omber", K1: "Dark Ochre,Hedbergite,Hemorphite,Scordite,Veldspar,Omber", K2: "Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Omber", K3: "Crokite,Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Omber", K4: "Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Omber", K5: "Arkonor,Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Omber", K6: "Arkonor,Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Mercoxit,Omber", K7: "Arkonor,Bistot,Crokite,Dark Ochre,Hedbergite,Hemorphite,Scordite,Spodumain,Veldspar,Gneiss,Mercoxit,Omber",
});

const BANDS = Object.freeze([
  [0.85, "Veldspar,Scordite"], [0.65, "Veldspar,Scordite,Pyroxeres"],
  [0.45, "Veldspar,Scordite,Pyroxeres,Plagioclase,Omber"],
  [0.25, "Pyroxeres,Plagioclase,Omber,Kernite,Jaspet"],
  [0.05, "Kernite,Jaspet,Hemorphite,Hedbergite"],
  [-0.25, "Hemorphite,Hedbergite,Dark Ochre,Gneiss"],
  [-0.55, "Dark Ochre,Gneiss,Crokite,Bistot"],
  [-Infinity, "Crokite,Bistot,Arkonor,Mercoxit"],
]);
const PROFILES = Object.freeze({
  retail: { base: "retail", enrichment: false },
  "evejs-fixed": { base: "retail", enrichment: true },
  "pre-scarcity": { base: "pre-scarcity", enrichment: false },
  "pre-scarcity-enriched": { base: "pre-scarcity", enrichment: true },
});
const BUCKET_FAMILIES = Object.freeze({
  common: new Set("Veldspar,Scordite,Pyroxeres,Plagioclase,Omber,Kernite,Jaspet".split(",")),
  uncommon: new Set("Hemorphite,Hedbergite,Spodumain,Gneiss,Dark Ochre".split(",")),
  rare: new Set("Crokite,Bistot,Arkonor,Mercoxit".split(",")),
});
const BUCKETS = Object.freeze({ common: { min: 2, max: 4, weight: 6 }, uncommon: { min: 1, max: 3, weight: 5 }, rare: { min: 1, max: 2, weight: 2.5 } });

function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function positiveInt(value) { const n = Math.trunc(Number(value) || 0); return n > 0 ? n : 0; }
function familyName(row) {
  const byId = FAMILY_BY_ID.get(positiveInt(row && row.typeID));
  if (byId) return byId;
  const name = String(row && row.name || "").trim();
  for (const family of Object.keys(FAMILY_IDS).sort((a, b) => b.length - a.length)) {
    if (name === family || name.startsWith(`${family} `) || name.includes(`${family} II-Grade`) || name.includes(`${family} III-Grade`)) return family;
  }
  return name.replace(/\s+(II|III)-Grade$/i, "").trim();
}
function gradeIndex(row) {
  const name = String(row && row.name || "");
  if (/III-Grade/i.test(name)) return 2;
  if (/II-Grade/i.test(name)) return 1;
  return 0;
}
function shuffle(values, rng) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(rng() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function create(options = {}) {
  const resolveItemByTypeID = options.resolveItemByTypeID;
  const classify = options.classifyMiningMaterialType;
  if (typeof resolveItemByTypeID !== "function" || typeof classify !== "function") throw new Error("Ore distribution dependencies unavailable");
  function candidates(names, metadata = {}) {
    const result = [];
    for (const name of names) for (const typeID of FAMILY_IDS[name] || []) {
      const row = resolveItemByTypeID(typeID); const classification = row && classify(row);
      if (row && classification && classification.kind === "ore") result.push({ ...row, familyName: name, weight: 1, spawnWeight: 1, ...metadata });
    }
    return result;
  }
  function normalizeRows(rows) {
    return (Array.isArray(rows) ? rows : []).filter((row) => row && classify(row)?.kind === "ore").map((row) => ({ ...row, familyName: familyName(row), spawnWeight: Math.max(0.000001, finite(row.spawnWeight ?? row.weight, 1)) })).sort((a, b) => String(a.familyName).localeCompare(String(b.familyName)) || positiveInt(a.typeID) - positiveInt(b.typeID));
  }
  function merge(base, extra) {
    const map = new Map();
    for (const row of [...base, ...extra]) { const id = positiveInt(row.typeID); if (!id) continue; const prior = map.get(id); map.set(id, prior ? { ...row, ...prior, evejsEnriched: !!(row.evejsEnriched || prior.evejsEnriched), preScarcity: !!(row.preScarcity || prior.preScarcity) } : row); }
    return [...map.values()];
  }
  function buildEffectiveSystemOrePool(systemID, input = {}) {
    const mode = normalizeMode(input.distributionMode, DEFAULTS.asteroidBeltOreDistribution);
    const profile = PROFILES[mode];
    const metadata = input.securityMetadata || {};
    const securityClass = String(metadata.securityClass || "").trim().toUpperCase();
    const securityStatus = finite(metadata.securityStatus, 0);
    const supported = positiveInt(systemID) >= 30000000 && positiveInt(systemID) < 31000000 && metadata.hasExplicitSecurityClass === true && /^[A-K](?:[1-7])?$/.test(securityClass);
    const retail = normalizeRows(input.retailPool || []);
    const historical = profile.base === "pre-scarcity" && supported ? candidates(String(PRE[securityClass] || "").split(",").filter(Boolean), { preScarcity: true }) : [];
    const base = historical.length ? historical : retail;
    const enrichmentNames = supported ? String((BANDS.find(([min]) => securityStatus >= min) || [0, ""])[1]).split(",").filter(Boolean) : [];
    const enriched = profile.enrichment && supported ? candidates(enrichmentNames, { evejsEnriched: true }) : [];
    return { orePool: normalizeRows(merge(base, enriched)), securityClass, securityStatus, effectiveDistributionMode: supported ? mode : "retail", requestedDistributionMode: mode };
  }
  function buildBeltOreSubset(orePool, _securityClass, rng, input = {}) {
    const rows = normalizeRows(orePool); const mode = normalizeMode(input.effectiveDistributionMode, "retail");
    if (mode === "retail") return rows.map((row) => ({ ...row, spawnWeight: Math.max(0.000001, finite(row.spawnWeight, 1)) * [1.35, 1, 0.7][gradeIndex(row)], spawnBucket: "retail" }));
    const groups = new Map(); for (const row of rows) { const name = familyName(row); if (!groups.has(name)) groups.set(name, []); groups.get(name).push(row); }
    const selected = [];
    for (const [bucket, rule] of Object.entries(BUCKETS)) {
      const names = [...groups.keys()].filter((name) => BUCKET_FAMILIES[bucket].has(name));
      const count = Math.min(names.length, rule.min + Math.floor(rng() * (rule.max - rule.min + 1)));
      for (const name of shuffle(names, rng).slice(0, count)) for (const row of groups.get(name)) selected.push({ ...row, spawnWeight: rule.weight * [1.35, 1, 0.7][gradeIndex(row)], spawnBucket: bucket });
    }
    return selected.length ? selected : rows.slice(0, 6).map((row) => ({ ...row, spawnWeight: 1, spawnBucket: "fallback" }));
  }
  return Object.freeze({ buildEffectiveSystemOrePool, buildBeltOreSubset });
}

module.exports = { create, FAMILY_IDS, PRE, BANDS, PROFILES, BUCKETS, familyName, gradeIndex };
