"use strict";

const path = require("path");
const { ALLOWED_MODES, VOLUME_MIN, VOLUME_MAX, normalizeMode } = require("../config");

function formatRefresh(status) {
  if (!status) return "Belt refresh: idle.";
  if (status.active) return `Belt refresh: running job=${status.jobID} phase=${status.phase} removed=${status.removedCount}/${status.oldEntityCount} spawned=${status.spawnedCount} slices=${status.sliceCount}.`;
  return `Belt refresh: ${status.state} job=${status.jobID} removed=${status.removedCount} spawned=${status.spawnedCount} slices=${status.sliceCount}${status.errorMsg ? ` error=${status.errorMsg}` : ""}.`;
}

function create(options) {
  const { policy, coordinator, runtimeRoot } = options;
  function dependencies() {
    if (typeof options.resolveDependencies === "function") return options.resolveDependencies();
    return {
      spaceRuntime: require(path.join(runtimeRoot, "server/src/space/runtime")),
      asteroidService: require(path.join(runtimeRoot, "server/src/space/asteroids/asteroidService")),
      miningRuntimeState: require(path.join(runtimeRoot, "server/src/services/mining/miningRuntimeState")),
    };
  }
  function getScene(session, deps) { return deps.spaceRuntime.getSceneForSession(session); }
  function isSceneCurrent(scene, systemID, deps) { return !!(deps.spaceRuntime.scenes && deps.spaceRuntime.scenes.get(Number(systemID)) === scene); }
  function shouldRetryLast() { const status = coordinator.getStatus(); return status && (status.state === "failed" || status.state === "cancelled"); }
  function apply(scene, key, value, changed, forceRefresh, deps) {
    const running = coordinator.getStatus();
    if (running && running.active) return { success: false, errorMsg: "BELT_REFRESH_IN_PROGRESS", data: running };
    if (!changed && !forceRefresh && !shouldRetryLast()) return { success: true, data: { changed: false, refreshStarted: false } };
    let mutation = null;
    try { if (changed) mutation = policy.setPersisted(key, value); }
    catch (error) { return { success: false, errorMsg: error.code || "CONFIG_SAVE_FAILED", detail: error.message }; }
    const snapshot = policy.getSnapshot();
    const result = coordinator.start(scene, { asteroidService: deps.asteroidService, miningRuntimeState: deps.miningRuntimeState }, {
      broadcast: true, settingsSnapshot: snapshot,
      isSceneCurrent: (candidate, systemID) => isSceneCurrent(candidate, systemID, deps),
    });
    if (!result.success && mutation) {
      try { policy.restore(mutation.previous); } catch (rollbackError) { result.rollbackError = rollbackError.message; }
    }
    return result.success ? { success: true, data: { changed, refreshStarted: true, refreshStatus: result.data, snapshot } } : result;
  }
  function parse(text) { const tokens = String(text || "").trim().split(/\s+/u).filter(Boolean); const refresh = tokens.at(-1)?.toLowerCase() === "refresh"; return { tokens, refresh }; }
  function modeStatusMessage() {
    const status = policy.getStatus("asteroidBeltOreDistribution");
    return `Asteroid belt ore mode: ${status.activeValue}. Persisted=${status.persistedValue}. Source=${status.source}. ${formatRefresh(coordinator.getStatus())} Usage: /beltmode <${ALLOWED_MODES.join("|")}> [refresh]`;
  }
  function volumeStatusMessage() {
    const status = policy.getStatus("miningBeltVolumeMultiplier");
    return `Asteroid belt ore volume multiplier: ${status.activeValue}x. Persisted=${status.persistedValue}x. Source=${status.source}. Applies only to generated normal-belt rocks before the existing EveJS min/max clamp; anomaly/resource-site entities remain 1x. ${formatRefresh(coordinator.getStatus())} Usage: /beltvolume <${VOLUME_MIN}..${VOLUME_MAX}> [refresh]`;
  }
  function handleMode(session, text) {
    const parsed = parse(text); if (!parsed.tokens.length) return { success: true, message: modeStatusMessage() };
    const status = policy.getStatus("asteroidBeltOreDistribution");
    let requested = normalizeMode(parsed.tokens[0], null); let force = parsed.refresh;
    if (parsed.tokens[0].toLowerCase() === "refresh") { requested = status.activeValue; force = true; }
    if (!requested || parsed.tokens.length > (force ? 2 : 1)) return { success: false, message: `Usage: /beltmode <${ALLOWED_MODES.join("|")}> [refresh]` };
    if (status.source === "env") return { success: false, message: `Cannot change asteroid belt ore mode while ${status.environmentKey} is authoritative. Current mode: ${status.activeValue}.` };
    const deps = dependencies(); const scene = getScene(session, deps); if (!scene) return { success: false, message: "You must be in space before changing or refreshing /beltmode." };
    const changed = status.persistedValue !== requested || status.activeValue !== requested;
    const result = apply(scene, "asteroidBeltOreDistribution", requested, changed, force, deps);
    if (!result.success) return { success: false, message: result.errorMsg === "BELT_REFRESH_IN_PROGRESS" ? `Belt mode change rejected: ${formatRefresh(result.data)}` : `Belt mode change failed: ${result.errorMsg}.` };
    if (!result.data.refreshStarted) return { success: true, message: `Asteroid belt ore mode is already ${requested}; no refresh was requested.` };
    return { success: true, message: `Asteroid belt ore mode ${changed ? `changed ${status.activeValue} -> ${requested}` : `${requested} retained`}. Current-system normal-belt refresh scheduled in bounded slices (job=${result.data.refreshStatus.jobID}). Resource sites and anomalies are untouched.` };
  }
  function handleVolume(session, text) {
    const parsed = parse(text); if (!parsed.tokens.length) return { success: true, message: volumeStatusMessage() };
    const status = policy.getStatus("miningBeltVolumeMultiplier"); let requested = parsed.tokens[0]; let force = parsed.refresh;
    if (String(requested).toLowerCase() === "refresh") { requested = status.activeValue; force = true; }
    const value = Number(requested); if (!Number.isFinite(value) || value < VOLUME_MIN || value > VOLUME_MAX || parsed.tokens.length > (force ? 2 : 1)) return { success: false, message: `Usage: /beltvolume <${VOLUME_MIN}..${VOLUME_MAX}> [refresh]` };
    if (status.source === "env") return { success: false, message: `Cannot change asteroid belt volume while ${status.environmentKey} is authoritative. Current multiplier: ${status.activeValue}x.` };
    const deps = dependencies(); const scene = getScene(session, deps); if (!scene) return { success: false, message: "You must be in space before changing or refreshing /beltvolume." };
    const changed = status.persistedValue !== value || status.activeValue !== value;
    const result = apply(scene, "miningBeltVolumeMultiplier", value, changed, force, deps);
    if (!result.success) return { success: false, message: result.errorMsg === "BELT_REFRESH_IN_PROGRESS" ? `Belt volume change rejected: ${formatRefresh(result.data)}` : `Belt volume change failed: ${result.errorMsg}.` };
    if (!result.data.refreshStarted) return { success: true, message: `Asteroid belt ore volume multiplier is already ${value}x; no refresh was requested.` };
    return { success: true, message: `Asteroid belt ore volume multiplier ${changed ? `changed ${status.activeValue}x -> ${value}x` : `${value}x retained`}. Current-system normal-belt refresh scheduled in bounded slices (job=${result.data.refreshStatus.jobID}). Resource sites and anomalies are untouched.` };
  }
  return Object.freeze({ handleMode, handleVolume, formatRefresh });
}

module.exports = { create, formatRefresh };
