"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const transforms = require("./sourceTransforms");
const chatOverlay = require("./chatOverlay");

const PREIMAGES = Object.freeze({
  asteroidService: Object.freeze({ relative: "server/src/space/asteroids/asteroidService.js", sha256: "81b2fe80b55f67fb263120ef7cca63de1a2d5ba23a25a293afc8a29ca8294795" }),
  miningRuntimeState: Object.freeze({ relative: "server/src/services/mining/miningRuntimeState.js", sha256: "9c86aebc158c3ef83126a7b00bc6fa868ba2cc51a5a9b18ef668501819d73f50" }),
  chatCommands: Object.freeze({ relative: "server/src/services/chat/chatCommands.js", sha256: "88e60bd6f77c5c9092db0901c95eb72ec6237b9fb506f34bcd1f402a66ee570b" }),
});
const VALIDATORS = Object.freeze({
  asteroidService: transforms.validateAsteroidService,
  miningRuntimeState: transforms.validateMiningRuntimeState,
  chatCommands: chatOverlay.validateSource,
});

function hash(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function canonicalize(filename, options = {}) {
  const platform = options.platform || process.platform; const resolved = path.resolve(filename);
  const realpath = options.realpath || (fs.realpathSync.native || fs.realpathSync);
  let canonical; try { canonical = realpath(resolved); } catch (_error) { canonical = resolved; }
  if (platform === "win32") return path.win32.normalize(canonical.replace(/\//g, "\\")).toLowerCase();
  return path.posix.normalize(canonical.replace(/\\/g, "/"));
}
function run(runtimeRoot) {
  const targets = {};
  for (const [name, spec] of Object.entries(PREIMAGES)) {
    const filename = path.resolve(runtimeRoot, spec.relative);
    if (!fs.existsSync(filename)) throw new Error(`FOUR_MODE_TARGET_MISSING:${spec.relative}`);
    const raw = fs.readFileSync(filename); const actualHash = hash(raw);
    const source = raw.toString("utf8");
    VALIDATORS[name](source);
    targets[name] = Object.freeze({
      filename,
      canonical: canonicalize(filename),
      source,
      sha256: actualHash,
      knownCleanSha256: spec.sha256,
      matchesKnownCleanSource: actualHash === spec.sha256,
    });
  }
  const oldRuntime = path.join(runtimeRoot, "server/src/services/mining/beltModeRuntime.js");
  if (fs.existsSync(oldRuntime)) throw new Error("FOUR_MODE_OLD_BELT_RUNTIME_DETECTED");
  const cachedCanonical = new Set(Object.keys(Module._cache).map((filename) => canonicalize(filename)));
  for (const target of Object.values(targets)) if (cachedCanonical.has(target.canonical)) throw new Error(`FOUR_MODE_TARGET_PRE_CACHED:${target.filename}`);
  return Object.freeze(targets);
}

module.exports = { PREIMAGES, VALIDATORS, hash, canonicalize, run };
