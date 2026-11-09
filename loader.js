"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { isMainThread } = require("worker_threads");
const viability = require("./lib/viability");
const transforms = require("./lib/sourceTransforms");
const { createPolicyStore } = require("./config");
const oreDistribution = require("./lib/oreDistribution");
const { createCoordinator } = require("./lib/refreshCoordinator");
const beltCommands = require("./lib/beltCommands");
const chatOverlay = require("./lib/chatOverlay");

const INSTALL_MARKER = Symbol.for("evejs.fourModeAsteroidBelts.install");
const API_MARKER = Symbol.for(transforms.API_SYMBOL);

function compileTransformed(filename, parent, transform) {
  if (Module._cache[filename]) return Module._cache[filename].exports;
  const instance = new Module(filename, parent);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  Module._cache[filename] = instance;
  try {
    const source = fs.readFileSync(filename, "utf8");
    instance._compile(transform(source), filename);
    instance.loaded = true;
    return instance.exports;
  } catch (error) {
    delete Module._cache[filename];
    throw error;
  }
}

// Resolution still uses Node's parent-aware resolver on every call. Only
// successful filesystem identities are memoized; failed probes remain retryable.
// Do not reject by basename: symlinks/packages can alias an exact owned target.
function createCanonicalCache(canonicalize, options = {}) {
  const identities = new Map();
  return function canonicalizeResolved(filename) {
    if (identities.has(filename)) return identities.get(filename);
    let succeeded = false;
    const canonical = canonicalize(filename, {
      ...options,
      realpath(value) {
        const result = (options.realpath || fs.realpathSync.native || fs.realpathSync)(value);
        succeeded = true;
        return result;
      },
    });
    // canonicalize preserves its existing lexical fallback on realpath failure,
    // but that fallback must not prevent a later successful canonicalization.
    if (succeeded) identities.set(filename, canonical);
    return canonical;
  };
}

function install(options = {}) {
  if (!isMainThread && options.allowWorker !== true) return Object.freeze({ active: false, reason: "worker-thread" });
  if (globalThis[INSTALL_MARKER] || globalThis[API_MARKER]) throw new Error("FOUR_MODE_ALREADY_INSTALLED");
  const runtimeRoot = path.resolve(options.runtimeRoot || path.join(__dirname, "../.."));
  const targets = viability.run(runtimeRoot);
  const policy = createPolicyStore({ runtimeRoot, environment: options.environment || process.env });
  const coordinator = createCoordinator(options.coordinatorOptions);
  const commands = beltCommands.create({ policy, coordinator, runtimeRoot });
  const api = Object.freeze({
    version: "0.2.3",
    policy,
    coordinator,
    createOreDistribution: oreDistribution.create,
  });
  const canonicalizeResolved = createCanonicalCache(viability.canonicalize);
  const previousLoad = Module._load;
  const canonicalTargets = new Map(Object.entries(targets).map(([name, target]) => [target.canonical, name]));
  globalThis[API_MARKER] = api;
  function hookedLoad(request, parent, isMain) {
    if (Module.isBuiltin(request)) return previousLoad.apply(this, arguments);
    let resolved;
    try { resolved = Module._resolveFilename(request, parent, isMain); }
    catch (_error) { return previousLoad.apply(this, arguments); }
    const targetName = typeof resolved === "string" ? canonicalTargets.get(canonicalizeResolved(resolved)) : null;
    if (targetName === "asteroidService") return compileTransformed(targets.asteroidService.filename, parent, transforms.transformAsteroidService);
    if (targetName === "miningRuntimeState") return compileTransformed(targets.miningRuntimeState.filename, parent, transforms.transformMiningRuntimeState);
    if (targetName === "chatCommands") {
      const exported = previousLoad.apply(this, arguments);
      if (!exported[chatOverlay.OVERLAY_MARKER]) chatOverlay.install(exported, { runtimeRoot, commands });
      return exported;
    }
    return previousLoad.apply(this, arguments);
  }
  Module._load = hookedLoad;
  const installState = Object.freeze({ active: true, runtimeRoot, targets, previousLoad, hookedLoad, api });
  globalThis[INSTALL_MARKER] = installState;
  return installState;
}

const installation = install();
module.exports = Object.freeze({ ...installation, install, INSTALL_MARKER, API_MARKER, _testing: Object.freeze({ compileTransformed }) });
