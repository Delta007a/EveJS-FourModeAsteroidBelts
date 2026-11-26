"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULTS = Object.freeze({
  asteroidBeltOreDistribution: "evejs-fixed",
  miningBeltVolumeMultiplier: 1,
});
const ALLOWED_MODES = Object.freeze([
  "retail",
  "evejs-fixed",
  "pre-scarcity",
  "pre-scarcity-enriched",
]);
const VOLUME_MIN = 0.01;
const VOLUME_MAX = 1000;
const ENV_KEYS = Object.freeze({
  asteroidBeltOreDistribution: "EVEJS_ASTEROID_BELT_ORE_DISTRIBUTION",
  miningBeltVolumeMultiplier: "EVEJS_MINING_BELT_VOLUME_MULTIPLIER",
});

function normalizeMode(value, fallback = DEFAULTS.asteroidBeltOreDistribution) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ALLOWED_MODES.includes(normalized) ? normalized : fallback;
}

function normalizeMultiplier(value, fallback = DEFAULTS.miningBeltVolumeMultiplier) {
  const numeric = Number(String(value ?? "").trim());
  return Number.isFinite(numeric) && numeric >= VOLUME_MIN && numeric <= VOLUME_MAX
    ? numeric
    : fallback;
}

function createPolicyStore(options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot || path.join(__dirname, "../.."));
  const configPath = path.resolve(options.configPath || path.join(runtimeRoot, "config", "fourModeAsteroidBelts.json"));
  const environment = options.environment || process.env;
  let persisted = { ...DEFAULTS };

  function readPersisted() {
    if (!fs.existsSync(configPath)) {
      persisted = { ...DEFAULTS };
      return { ...persisted };
    }
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    persisted = {
      asteroidBeltOreDistribution: normalizeMode(parsed.asteroidBeltOreDistribution),
      miningBeltVolumeMultiplier: normalizeMultiplier(parsed.miningBeltVolumeMultiplier),
    };
    return { ...persisted };
  }

  function getEnvironmentValue(key) {
    const envKey = ENV_KEYS[key];
    if (!Object.prototype.hasOwnProperty.call(environment, envKey)) {
      return null;
    }
    const raw = environment[envKey];
    if (String(raw ?? "").trim() === "") {
      return null;
    }
    if (key === "asteroidBeltOreDistribution") {
      const normalized = normalizeMode(raw, null);
      if (!normalized) throw new Error(`${envKey} has an invalid mode: ${raw}`);
      return normalized;
    }
    const numeric = Number(String(raw).trim());
    if (!Number.isFinite(numeric) || numeric < VOLUME_MIN || numeric > VOLUME_MAX) {
      throw new Error(`${envKey} must be between ${VOLUME_MIN} and ${VOLUME_MAX}`);
    }
    return numeric;
  }

  function getStatus(key) {
    const environmentValue = getEnvironmentValue(key);
    return Object.freeze({
      key,
      activeValue: environmentValue !== null ? environmentValue : persisted[key],
      persistedValue: persisted[key],
      defaultValue: DEFAULTS[key],
      source: environmentValue !== null ? "env" : (fs.existsSync(configPath) ? "persisted" : "default"),
      environmentKey: ENV_KEYS[key],
    });
  }

  function getSnapshot() {
    // getStatus checks the config path to label the source for chat commands.
    return Object.freeze({
      mode: getEnvironmentValue("asteroidBeltOreDistribution") ?? persisted.asteroidBeltOreDistribution,
      volumeMultiplier: getEnvironmentValue("miningBeltVolumeMultiplier") ?? persisted.miningBeltVolumeMultiplier,
    });
  }

  function writeAtomic(next) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    let descriptor = null;
    try {
      descriptor = fs.openSync(tempPath, "wx", 0o600);
      fs.writeFileSync(descriptor, `${JSON.stringify(next, null, 2)}\n`, "utf8");
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = null;
      fs.renameSync(tempPath, configPath);
    } catch (error) {
      if (descriptor !== null) fs.closeSync(descriptor);
      try { fs.unlinkSync(tempPath); } catch (_cleanupError) { /* best effort */ }
      throw error;
    }
  }

  function setPersisted(key, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) throw new Error(`Unknown policy key: ${key}`);
    if (getEnvironmentValue(key) !== null) {
      const error = new Error(`${ENV_KEYS[key]} is authoritative`);
      error.code = "ENV_OVERRIDE_ACTIVE";
      throw error;
    }
    const normalized = key === "asteroidBeltOreDistribution"
      ? normalizeMode(value, null)
      : normalizeMultiplier(value, null);
    if (normalized === null) {
      const error = new Error(`Invalid value for ${key}: ${value}`);
      error.code = "INVALID_VALUE";
      throw error;
    }
    const previous = { ...persisted };
    const next = { ...persisted, [key]: normalized };
    writeAtomic(next);
    persisted = next;
    return Object.freeze({ previous, current: { ...persisted } });
  }

  function restore(previous) {
    const normalized = {
      asteroidBeltOreDistribution: normalizeMode(previous.asteroidBeltOreDistribution),
      miningBeltVolumeMultiplier: normalizeMultiplier(previous.miningBeltVolumeMultiplier),
    };
    writeAtomic(normalized);
    persisted = normalized;
  }

  readPersisted();
  getEnvironmentValue("asteroidBeltOreDistribution");
  getEnvironmentValue("miningBeltVolumeMultiplier");
  return Object.freeze({
    runtimeRoot,
    configPath,
    getSnapshot,
    getStatus,
    setPersisted,
    restore,
    reload: readPersisted,
  });
}

module.exports = {
  DEFAULTS,
  ALLOWED_MODES,
  VOLUME_MIN,
  VOLUME_MAX,
  ENV_KEYS,
  normalizeMode,
  normalizeMultiplier,
  createPolicyStore,
};
