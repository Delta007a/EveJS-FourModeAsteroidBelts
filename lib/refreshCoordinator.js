"use strict";

const { BRIDGE_SYMBOL } = require("./sourceTransforms");

const DEFAULT_ENTITY_BUDGET = 24;
const DEFAULT_TIME_BUDGET_MS = 6;

function toInt(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function cloneStatus(job) {
  if (!job) return null;
  return Object.freeze({
    active: job.active === true, state: job.state, jobID: job.jobID, systemID: job.systemID,
    phase: job.phase, settingsSnapshot: job.settingsSnapshot, oldEntityCount: job.oldEntities.length,
    removedCount: job.removedCount, spawnedCount: job.spawnedCount, hydratedCount: job.hydratedCount,
    sliceCount: job.sliceCount, maxSliceMs: job.maxSliceMs, totalWallMs: Date.now() - job.startedAtMs,
    errorMsg: job.errorMsg || null,
  });
}

function createCoordinator(options = {}) {
  const schedule = options.schedule || setImmediate;
  const now = options.now || Date.now;
  let activeJob = null; let lastJob = null; let nextJobID = 1;

  function release(job, state, errorMsg = null) {
    job.active = false; job.state = state; job.phase = state; job.errorMsg = errorMsg;
    job.totalWallMs = now() - job.startedAtMs;
    if (activeJob === job) activeJob = null;
    lastJob = job;
  }
  function isCurrent(job) {
    try { return job.isSceneCurrent(job.scene, job.systemID) === true; } catch (_error) { return false; }
  }
  function entityExists(scene, entityID) {
    return Array.isArray(scene && scene.staticEntities) && scene.staticEntities.some((entity) => toInt(entity && entity.itemID) === toInt(entityID));
  }
  function normalizedRemovalSucceeded(result, scene, entityID) {
    return result === true || (result && result.success === true) || !entityExists(scene, entityID);
  }
  function requireDependencies(job) {
    const bridge = job.miningRuntimeState[Symbol.for(BRIDGE_SYMBOL)];
    if (!bridge) throw new Error("FOUR_MODE_MINING_BRIDGE_MISSING");
    if (typeof job.asteroidService.createSceneAsteroidFieldSpawnPlan !== "function" || typeof job.asteroidService.stepSceneAsteroidFieldSpawnPlan !== "function") throw new Error("FOUR_MODE_ASTEROID_PLAN_MISSING");
    job.bridge = bridge;
  }
  function initialize(job) {
    requireDependencies(job);
    const cache = job.bridge.ensureSceneMiningState(job.scene);
    job.cache = cache;
    job.persistedByEntityID = job.bridge.readPersistedSystemState(job.systemID);
    job.oldEntities = [...(job.scene.staticEntities || [])].filter((entity) => toInt(entity && entity.beltID) > 0 && String(entity && entity.kind || "").toLowerCase() === "asteroid");
    const liveIDs = new Set(job.oldEntities.map((entity) => String(toInt(entity.itemID))));
    job.orphanPersistedIDs = Object.keys(job.persistedByEntityID).filter((id) => toInt(job.persistedByEntityID[id] && job.persistedByEntityID[id].beltID) > 0 && !liveIDs.has(String(toInt(id))));
    job.orphanCacheIDs = job.cache && job.cache.byEntityID instanceof Map
      ? [...job.cache.byEntityID.entries()].filter(([id, state]) => toInt(state && state.beltID) > 0 && !liveIDs.has(String(toInt(id)))).map(([id]) => toInt(id))
      : [];
    job.phase = "remove";
  }
  function removeOne(job) {
    if (job.removeIndex >= job.oldEntities.length) { job.phase = "remove-orphans"; return; }
    const entity = job.oldEntities[job.removeIndex++]; const entityID = toInt(entity.itemID); const prior = job.persistedByEntityID[String(entityID)] || null;
    if (prior && job.bridge.removePersistedState(job.scene, entityID) !== true) throw new Error(`PERSISTENCE_REMOVE_FAILED:${entityID}`);
    let result;
    try { result = job.scene.removeStaticEntity(entityID, { broadcast: job.broadcast, nowMs: job.nowMs }); }
    catch (error) { if (prior) job.bridge.writePersistedState(job.scene, prior, { persistBaseline: true }); throw error; }
    if (!normalizedRemovalSucceeded(result, job.scene, entityID)) {
      if (prior) job.bridge.writePersistedState(job.scene, prior, { persistBaseline: true });
      throw new Error(`ENTITY_REMOVE_FAILED:${entityID}`);
    }
    if (job.cache && job.cache.byEntityID) job.cache.byEntityID.delete(entityID);
    job.removedCount++;
  }
  function removeOrphan(job) {
    if (job.orphanIndex >= job.orphanPersistedIDs.length) { job.phase = "clear-orphan-cache"; return; }
    const entityID = toInt(job.orphanPersistedIDs[job.orphanIndex++]);
    if (job.bridge.removePersistedState(job.scene, entityID) !== true) throw new Error(`ORPHAN_PERSISTENCE_REMOVE_FAILED:${entityID}`);
    if (job.cache && job.cache.byEntityID) job.cache.byEntityID.delete(entityID);
  }
  function clearOrphanCache(job) {
    if (job.orphanCacheIndex >= job.orphanCacheIDs.length) { job.phase = "spawn-init"; return; }
    if (job.cache && job.cache.byEntityID) job.cache.byEntityID.delete(job.orphanCacheIDs[job.orphanCacheIndex++]);
  }
  function initSpawn(job) {
    const result = job.asteroidService.createSceneAsteroidFieldSpawnPlan(job.scene, { distributionMode: job.settingsSnapshot.mode, resetSummary: true });
    if (!result || result.success !== true) throw new Error(result && result.errorMsg || "SPAWN_PLAN_FAILED");
    job.spawnPlan = result.data; job.phase = "spawn";
  }
  function spawnStep(job, remaining, deadline) {
    const result = job.asteroidService.stepSceneAsteroidFieldSpawnPlan(job.spawnPlan, { maxEntities: Math.max(1, remaining), timeBudgetMs: Math.max(1, deadline - now()), now });
    if (!result || result.success !== true) throw new Error(result && result.errorMsg || "SPAWN_STEP_FAILED");
    const spawned = result.data.spawned || [];
    job.spawnedCount += spawned.length;
    for (const entity of spawned) {
      const state = job.bridge.buildMineableState(job.scene, entity, null, { beltVolumeMultiplier: job.settingsSnapshot.volumeMultiplier });
      if (state) {
        job.bridge.applyYieldPresentationToEntity(entity, state);
        if (job.cache && job.cache.byEntityID) job.cache.byEntityID.set(toInt(entity.itemID), state);
        job.hydratedCount++;
      }
    }
    if (result.data.done === true) job.phase = "complete";
    return Math.max(1, toInt(result.data.processed, 1));
  }
  function runSlice(job) {
    if (activeJob !== job || !job.active) return;
    const sliceStart = now(); const deadline = sliceStart + job.timeBudgetMs; let work = 0;
    try {
      while (work < job.entityBudget && now() < deadline) {
        if (!isCurrent(job)) { release(job, "cancelled", "SCENE_INVALIDATED"); return; }
        if (job.phase === "init") { initialize(job); work++; }
        else if (job.phase === "remove") { removeOne(job); work++; }
        else if (job.phase === "remove-orphans") { removeOrphan(job); work++; }
        else if (job.phase === "clear-orphan-cache") { clearOrphanCache(job); work++; }
        else if (job.phase === "spawn-init") { initSpawn(job); work++; }
        else if (job.phase === "spawn") work += spawnStep(job, job.entityBudget - work, deadline);
        else if (job.phase === "complete") { release(job, "completed"); return; }
        else throw new Error(`UNKNOWN_PHASE:${job.phase}`);
      }
      job.sliceCount++; job.maxSliceMs = Math.max(job.maxSliceMs, now() - sliceStart);
      schedule(() => runSlice(job));
    } catch (error) {
      job.sliceCount++; job.maxSliceMs = Math.max(job.maxSliceMs, now() - sliceStart);
      release(job, "failed", error && error.message || String(error));
    }
  }
  function start(scene, dependencies = {}, startOptions = {}) {
    if (activeJob) return { success: false, errorMsg: "BELT_REFRESH_IN_PROGRESS", data: cloneStatus(activeJob) };
    if (!scene) return { success: false, errorMsg: "SCENE_NOT_FOUND" };
    const settings = startOptions.settingsSnapshot || {};
    const job = {
      active: true, state: "running", phase: "init", jobID: nextJobID++, scene, systemID: toInt(scene.systemID),
      asteroidService: dependencies.asteroidService, miningRuntimeState: dependencies.miningRuntimeState,
      isSceneCurrent: startOptions.isSceneCurrent, broadcast: startOptions.broadcast === true, nowMs: startOptions.nowMs,
      entityBudget: Math.max(1, toInt(startOptions.entityBudget, DEFAULT_ENTITY_BUDGET)), timeBudgetMs: Math.max(1, Number(startOptions.timeBudgetMs) || DEFAULT_TIME_BUDGET_MS),
      settingsSnapshot: Object.freeze({ mode: String(settings.mode), volumeMultiplier: Number(settings.volumeMultiplier) }),
      oldEntities: [], orphanPersistedIDs: [], orphanCacheIDs: [], removeIndex: 0, orphanIndex: 0, orphanCacheIndex: 0,
      removedCount: 0, spawnedCount: 0, hydratedCount: 0, sliceCount: 0, maxSliceMs: 0, startedAtMs: now(), errorMsg: null,
    };
    if (typeof job.isSceneCurrent !== "function") return { success: false, errorMsg: "SCENE_AUTHORITY_CHECK_MISSING" };
    activeJob = job; lastJob = job;
    try { schedule(() => runSlice(job)); } catch (error) { release(job, "failed", error.message); return { success: false, errorMsg: "BELT_REFRESH_SCHEDULE_FAILED", data: cloneStatus(job) }; }
    return { success: true, data: cloneStatus(job) };
  }
  return Object.freeze({ start, getStatus: () => cloneStatus(activeJob || lastJob), _testing: { normalizedRemovalSucceeded, runSlice } });
}

module.exports = { createCoordinator, DEFAULT_ENTITY_BUDGET, DEFAULT_TIME_BUDGET_MS };
