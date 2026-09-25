"use strict";

const crypto = require("crypto");

const API_SYMBOL = "evejs.fourModeAsteroidBelts";
const BRIDGE_SYMBOL = "evejs.fourModeAsteroidBelts.miningBridge";
const ASTEROID_TRANSFORM_MARKER = "/* FOUR_MODE_ASTEROID_TRANSFORM:0.12.9-beta-1 */";
const MINING_TRANSFORM_MARKER = "/* FOUR_MODE_MINING_TRANSFORM:0.12.9-beta-1 */";
const ASTEROID_DISTRIBUTION_SEAM_SHA256 = "7cdb848ab2bb90e44edd8af7b8ccde66b79718ab3aca4fafa9736201b53ea9a3";
const ASTEROID_CURSOR_SEAM_SHA256 = "82f366d56d3b41f0e4d1cd58aa55abaed1469ebd9ecc352f3baba1f74f5335a8";

function hashText(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function count(source, needle) {
  let result = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    result++;
    offset += needle.length;
  }
  return result;
}

function uniqueIndex(source, needle, label) {
  const matches = count(source, needle);
  if (matches === 0) throw new Error(`${label}: required semantic anchor missing`);
  if (matches !== 1) throw new Error(`${label}: semantic anchor is ambiguous (${matches} matches)`);
  return source.indexOf(needle);
}

function replaceUnique(source, search, replacement, label) {
  const index = uniqueIndex(source, search, label);
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

function replaceOwnedRange(source, start, end, replacement, expectedSha256, label) {
  const startIndex = uniqueIndex(source, start, `${label} start`);
  const endIndex = uniqueIndex(source, end, `${label} end`);
  if (endIndex <= startIndex) throw new Error(`${label}: semantic range order is invalid`);
  const incomingSeam = source.slice(startIndex, endIndex);
  const actualSha256 = hashText(incomingSeam);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`${label}: semantic seam changed incompatibly (${actualSha256})`);
  }
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

function withPreservedNewlines(source, label, transform) {
  if (typeof source !== "string") throw new TypeError(`${label}: source must be a string`);
  const withoutCrLf = source.replace(/\r\n/g, "");
  if (withoutCrLf.includes("\r")) throw new Error(`${label}: unsupported carriage-return newline style`);
  const usesCrLf = source.includes("\r\n");
  if (usesCrLf && withoutCrLf.includes("\n")) throw new Error(`${label}: mixed newline styles are unsafe`);
  const normalized = usesCrLf ? source.replace(/\r\n/g, "\n") : source;
  const output = transform(normalized);
  return usesCrLf ? output.replace(/\n/g, "\r\n") : output;
}

function rejectExistingTransform(source, options) {
  const markerMatches = count(source, options.marker);
  const ownedCounts = options.ownedMarkers.map((marker) => count(source, marker));
  if (markerMatches === 1 && ownedCounts.every((matches) => matches === 1)) {
    throw new Error(`${options.label}: Four transform is already installed`);
  }
  if (markerMatches > 0 || ownedCounts.some((matches) => matches > 0)) {
    throw new Error(`${options.label}: conflicting Four transform detected`);
  }
}

const ASTEROID_DISTRIBUTION = `function getFourModeOreDistribution() {
  if (!fourModeOreDistribution) {
    fourModeOreDistribution = fourModeAsteroidBeltsApi.createOreDistribution({ resolveItemByTypeID, classifyMiningMaterialType });
  }
  return fourModeOreDistribution;
}

function getFourModeSecurityMetadata(systemID) {
  const metadata = getSecurityMetadata(systemID);
  const row = getSolarSystemByID(toPositiveInt(systemID, 0)) || {};
  // Clean 0.12.7 derives a fallback class but drops whether the source row had
  // an explicit class. Four-Mode must preserve that distinction before it can
  // safely enable historical known-space profiles.
  return {
    ...metadata,
    hasExplicitSecurityClass: Boolean(String(row.securityClass || "").trim()),
  };
}

function buildEffectiveSystemOrePool(systemID, options = {}) {
  return getFourModeOreDistribution().buildEffectiveSystemOrePool(systemID, {
    distributionMode: options.distributionMode ?? fourModeAsteroidBeltsApi.policy.getSnapshot().mode,
    retailPool: buildSystemOrePool(systemID),
    securityMetadata: getFourModeSecurityMetadata(systemID),
  });
}

function buildEnrichedSystemOrePool(systemID) {
  return buildEffectiveSystemOrePool(systemID);
}

function buildBeltOreSubset(orePool, securityClass, rng, options = {}) {
  return getFourModeOreDistribution().buildBeltOreSubset(orePool, securityClass, rng, options);
}

`;

const ASTEROID_CURSOR = `function createBeltFieldSpawnCursor(scene, belt, options = {}) {
  if (!scene || !belt) return null;
  const style = asteroidData.getFieldStyleByID(belt.fieldStyleID);
  const fieldProfile = buildCurvedFieldProfile(scene, belt, style, asteroidData.getBeltsForSystem(scene.systemID));
  const totalCount = Math.max(0, toPositiveInt(fieldProfile.count, 0));
  const cursor = { scene, belt, style, fieldProfile, totalCount, asteroidIndex: 0, spawned: [], done: totalCount <= 0, recorded: false };
  if (cursor.done) return cursor;
  cursor.rng = createRng(toPositiveInt(belt.fieldSeed, belt.itemID));
  cursor.enriched = buildEffectiveSystemOrePool(scene.systemID, { distributionMode: options.distributionMode });
  cursor.systemOrePool = cursor.enriched.orePool;
  cursor.beltSubset = buildBeltOreSubset(cursor.systemOrePool, cursor.enriched.securityClass, cursor.rng, { effectiveDistributionMode: cursor.enriched.effectiveDistributionMode });
  cursor.legacyClusterOffsets = [];
  return cursor;
}

function recordCompletedBeltFieldCursor(cursor) {
  if (!cursor || cursor.recorded || cursor.totalCount <= 0) return;
  cursor.recorded = true;
  recordAsteroidBootstrap(cursor.scene, {
    beltID: toPositiveInt(cursor.belt && cursor.belt.itemID, 0), spawnedCount: cursor.spawned.length,
    orePool: cursor.systemOrePool, beltSubset: cursor.beltSubset,
    fieldProfile: { count: cursor.fieldProfile.count, authoredCount: cursor.fieldProfile.authoredCount, multiBeltOrbit: cursor.fieldProfile.multiBeltOrbit, axisSpanMeters: cursor.fieldProfile.axisSpanMeters, ribbonWidthMeters: cursor.fieldProfile.ribbonWidthMeters, visualRibbonWidthMeters: cursor.fieldProfile.visualRibbonWidthMeters, bowMeters: cursor.fieldProfile.bowMeters, laneCount: cursor.fieldProfile.laneCount, sideOffsetMeters: cursor.fieldProfile.sideOffsetMeters },
    securityClass: cursor.enriched.securityClass, securityStatus: cursor.enriched.securityStatus,
  });
}

function stepBeltFieldSpawnCursor(cursor, options = {}) {
  if (!cursor) return { success: false, errorMsg: "BELT_SPAWN_CURSOR_NOT_FOUND" };
  if (cursor.done) return { success: true, data: { done: true, processed: 0, spawned: [] } };
  const maxEntities = Math.max(1, toPositiveInt(options.maxEntities, 1)); const spawned = []; let processed = 0;
  while (cursor.asteroidIndex < cursor.totalCount && processed < maxEntities) {
    const asteroidIndex = cursor.asteroidIndex++; processed++;
    const entity = cursor.beltSubset.length > 0
      ? buildSystemOreAsteroidEntity(cursor.scene, cursor.belt, asteroidIndex, cursor.totalCount, cursor.fieldProfile, cursor.rng, cursor.beltSubset)
      : buildDecorativeFallbackAsteroidEntity(cursor.belt, cursor.style, asteroidIndex, cursor.legacyClusterOffsets, cursor.rng);
    if (entity && cursor.scene.addStaticEntity(entity)) { cursor.spawned.push(entity); spawned.push(entity); }
  }
  if (cursor.asteroidIndex >= cursor.totalCount) { cursor.done = true; recordCompletedBeltFieldCursor(cursor); }
  return { success: true, data: { done: cursor.done, processed, spawned } };
}

function populateBeltField(scene, belt) {
  const cursor = createBeltFieldSpawnCursor(scene, belt);
  if (!cursor || cursor.done) return [];
  while (!cursor.done) {
    const result = stepBeltFieldSpawnCursor(cursor, { maxEntities: Math.max(1, cursor.totalCount - cursor.asteroidIndex) });
    if (!result.success) break;
  }
  return cursor.spawned;
}

`;

const SCENE_PLAN = `function createSceneAsteroidFieldSpawnPlan(scene, options = {}) {
  if (!scene) return { success: false, errorMsg: "SCENE_NOT_FOUND" };
  if (options.resetSummary === true) resetMiningStartupSummary(scene);
  scene._asteroidFieldsInitialized = true;
  const belts = config.asteroidFieldsEnabled === true ? asteroidData.getBeltsForSystem(scene.systemID) : [];
  return { success: true, data: { scene, belts, beltIndex: 0, currentBeltCursor: null, distributionMode: options.distributionMode, spawned: [], done: belts.length <= 0 } };
}

function stepSceneAsteroidFieldSpawnPlan(plan, options = {}) {
  if (!plan || !plan.scene || !Array.isArray(plan.belts)) return { success: false, errorMsg: "ASTEROID_SPAWN_PLAN_INVALID" };
  if (plan.done) return { success: true, data: { done: true, processed: 0, spawned: [] } };
  const maxEntities = Math.max(1, toPositiveInt(options.maxEntities, 1)); const now = typeof options.now === "function" ? options.now : Date.now;
  const timeBudgetMs = Number.isFinite(Number(options.timeBudgetMs)) ? Math.max(1, Number(options.timeBudgetMs)) : Infinity;
  const startedAt = now(); const spawned = []; let processed = 0;
  while (processed < maxEntities && now() - startedAt < timeBudgetMs) {
    if (!plan.currentBeltCursor) {
      if (plan.beltIndex >= plan.belts.length) { plan.done = true; break; }
      plan.currentBeltCursor = createBeltFieldSpawnCursor(plan.scene, plan.belts[plan.beltIndex++], { distributionMode: plan.distributionMode });
      if (!plan.currentBeltCursor || plan.currentBeltCursor.done) { plan.currentBeltCursor = null; continue; }
    }
    const result = stepBeltFieldSpawnCursor(plan.currentBeltCursor, { maxEntities: Math.max(1, maxEntities - processed) });
    if (!result.success) return result;
    processed += result.data.processed; spawned.push(...result.data.spawned); plan.spawned.push(...result.data.spawned);
    if (result.data.done) plan.currentBeltCursor = null;
  }
  if (!plan.currentBeltCursor && plan.beltIndex >= plan.belts.length) plan.done = true;
  return { success: true, data: { done: plan.done, processed, spawned } };
}

`;

function transformAsteroidService(source) {
  return withPreservedNewlines(source, "asteroid service transform", (incoming) => {
    rejectExistingTransform(incoming, {
      marker: ASTEROID_TRANSFORM_MARKER,
      label: "asteroid service transform",
      ownedMarkers: [
        `Symbol.for("${API_SYMBOL}")`,
        "function getFourModeOreDistribution()",
        "function buildEffectiveSystemOrePool(systemID, options = {})",
        "function createBeltFieldSpawnCursor(scene, belt, options = {})",
        "function createSceneAsteroidFieldSpawnPlan(scene, options = {})",
      ],
    });
    let output = replaceUnique(
      incoming,
      'const path = require("path");',
      `const path = require("path");\n${ASTEROID_TRANSFORM_MARKER}\nconst fourModeAsteroidBeltsApi = globalThis[Symbol.for("${API_SYMBOL}")];\nif (!fourModeAsteroidBeltsApi) throw new Error("FOUR_MODE_ASTEROID_BELTS_API_MISSING");\nlet fourModeOreDistribution = null;`,
      "asteroid API",
    );
    output = replaceOwnedRange(
      output,
      "function buildEnrichedSystemOrePool",
      "function selectSystemOreType",
      ASTEROID_DISTRIBUTION,
      ASTEROID_DISTRIBUTION_SEAM_SHA256,
      "asteroid distribution",
    );
    output = replaceOwnedRange(
      output,
      "function populateBeltField",
      "function listGeneratedAsteroidEntities",
      ASTEROID_CURSOR,
      ASTEROID_CURSOR_SEAM_SHA256,
      "asteroid cursor",
    );
    output = replaceUnique(
      output,
      "function handleSceneCreated(scene) {",
      `${SCENE_PLAN}function handleSceneCreated(scene) {`,
      "asteroid scene plan",
    );
    output = replaceUnique(
      output,
      "  resetSceneAsteroidFields,\n",
      "  resetSceneAsteroidFields,\n  createSceneAsteroidFieldSpawnPlan,\n  stepSceneAsteroidFieldSpawnPlan,\n",
      "asteroid public exports",
    );
    output = replaceUnique(
      output,
      "    buildEnrichedSystemOrePool,\n",
      "    buildEnrichedSystemOrePool,\n    buildEffectiveSystemOrePool,\n",
      "asteroid effective-pool testing export",
    );
    output = replaceUnique(
      output,
      "    buildBeltOreSubset,\n",
      "    buildBeltOreSubset,\n    createBeltFieldSpawnCursor,\n    stepBeltFieldSpawnCursor,\n",
      "asteroid cursor testing exports",
    );
    return output;
  });
}

function transformMiningRuntimeState(source) {
  return withPreservedNewlines(source, "mining runtime transform", (incoming) => {
    rejectExistingTransform(incoming, {
      marker: MINING_TRANSFORM_MARKER,
      label: "mining runtime transform",
      ownedMarkers: [
        `Symbol.for("${API_SYMBOL}")`,
        `Symbol.for("${BRIDGE_SYMBOL}")`,
        "beltVolumeMultiplier ?? fourModeAsteroidBeltsApi.policy.getSnapshot().volumeMultiplier",
      ],
    });
    let output = replaceUnique(
      incoming,
      'const path = require("path");',
      `const path = require("path");\n${MINING_TRANSFORM_MARKER}\nconst fourModeAsteroidBeltsApi = globalThis[Symbol.for("${API_SYMBOL}")];\nif (!fourModeAsteroidBeltsApi) throw new Error("FOUR_MODE_ASTEROID_BELTS_API_MISSING");`,
      "mining API",
    );
    output = replaceUnique(
      output,
      "function estimateOriginalQuantity(scene, entity, yieldType, templateEntry = null) {",
      "function estimateOriginalQuantity(scene, entity, yieldType, templateEntry = null, options = {}) {",
      "mining estimate signature",
    );
    output = replaceUnique(
      output,
      "  const estimatedVolume = clamp(\n    (toFiniteNumber(entity && entity.radius, 0) ** 2) * quantityScale * quantityMultiplier,\n    minimumVolume,\n    maximumVolume,\n  );",
      "  const beltVolumeMultiplier = toInt(entity && entity.beltID, 0) > 0\n    ? clamp(toFiniteNumber(options.beltVolumeMultiplier ?? fourModeAsteroidBeltsApi.policy.getSnapshot().volumeMultiplier, 1), 0.01, 1000)\n    : 1;\n  const estimatedVolume = clamp(\n    (toFiniteNumber(entity && entity.radius, 0) ** 2) * quantityScale * quantityMultiplier * beltVolumeMultiplier,\n    minimumVolume,\n    maximumVolume,\n  );",
      "mining volume",
    );
    output = replaceUnique(
      output,
      "function buildMineableState(scene, entity, persistedState = null) {",
      "function buildMineableState(scene, entity, persistedState = null, options = {}) {",
      "mining state signature",
    );
    output = replaceUnique(
      output,
      "  const estimatedOriginalQuantity = estimateOriginalQuantity(\n    scene,\n    entity,\n    yieldType,\n    templateEntry,\n  );",
      "  const estimatedOriginalQuantity = estimateOriginalQuantity(\n    scene,\n    entity,\n    yieldType,\n    templateEntry,\n    options,\n  );",
      "mining state options",
    );
    output = replaceUnique(
      output,
      "  removePersistedSystemEntity,\n",
      `  removePersistedSystemEntity,\n  [Symbol.for("${BRIDGE_SYMBOL}")]: Object.freeze({\n    ensureSceneMiningState, buildMineableState, applyYieldPresentationToEntity,\n    readPersistedSystemState, writePersistedState, removePersistedState,\n  }),\n`,
      "mining bridge",
    );
    return output;
  });
}

function validateAsteroidService(source) {
  transformAsteroidService(source);
  return true;
}

function validateMiningRuntimeState(source) {
  transformMiningRuntimeState(source);
  return true;
}

module.exports = {
  API_SYMBOL,
  BRIDGE_SYMBOL,
  ASTEROID_TRANSFORM_MARKER,
  MINING_TRANSFORM_MARKER,
  hashText,
  count,
  transformAsteroidService,
  transformMiningRuntimeState,
  validateAsteroidService,
  validateMiningRuntimeState,
};
