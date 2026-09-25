"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const modRoot = path.resolve(__dirname, "..");
const cleanRoot = path.resolve(process.argv[2] || path.join(modRoot, "../.."));
const transforms = require("../lib/sourceTransforms");
const viability = require("../lib/viability");
const chatOverlay = require("../lib/chatOverlay");

function readTarget(name) {
  return fs.readFileSync(path.join(cleanRoot, viability.PREIMAGES[name].relative), "utf8");
}

function compile(source, filename) {
  new Function("require", "module", "exports", "__filename", "__dirname", source);
  assert.ok(source.length > 0, `${filename} produced empty transformed source`);
}

// (a) Clean final 0.12.9 passes preflight, both source transforms compile, and the
// export-object overlay installs without loading or starting EveJS.
const cleanTargets = viability.run(cleanRoot);
assert.deepStrictEqual(Object.keys(cleanTargets).sort(), ["asteroidService", "chatCommands", "miningRuntimeState"]);
assert.ok(Object.values(cleanTargets).every((target) => target.source.length > 0));
const cleanAsteroid = readTarget("asteroidService");
const cleanMining = readTarget("miningRuntimeState");
const cleanChat = readTarget("chatCommands");
const transformedAsteroid = transforms.transformAsteroidService(cleanAsteroid);
const transformedMining = transforms.transformMiningRuntimeState(cleanMining);
compile(transformedAsteroid, "asteroidService.js");
compile(transformedMining, "miningRuntimeState.js");
assert.ok(transformedMining.includes("const quantitySource = normalizedPersistedState || readDungeonRockQuantities(entity);"));
const fakeChatExports = {
  AVAILABLE_SLASH_COMMANDS: [],
  COMMANDS_HELP_TEXT: "Commands:",
  executeChatCommand: () => ({ handled: false }),
};
chatOverlay.install(fakeChatExports, {
  runtimeRoot: cleanRoot,
  commands: { handleMode: () => ({ message: "mode" }), handleVolume: () => ({ message: "volume" }) },
});
assert.deepStrictEqual(fakeChatExports.AVAILABLE_SLASH_COMMANDS, ["beltmode", "beltvolume"]);
console.log("PASS a: clean 0.12.9 final preflight, transforms, compilation, and chat overlay");

// (b) A whole-file hash mismatch caused only by an unrelated trailing edit is
// accepted, and each transformed source preserves that edit verbatim.
function newlineFor(source) { return source.includes("\r\n") ? "\r\n" : "\n"; }
function unrelatedEditFor(source) {
  const newline = newlineFor(source);
  return `${newline}// unrelated synthetic edit outside Four-owned seams${newline}`;
}
const unrelatedEdits = {
  asteroidService: unrelatedEditFor(cleanAsteroid),
  miningRuntimeState: unrelatedEditFor(cleanMining),
  chatCommands: unrelatedEditFor(cleanChat),
};
const synthetic = {
  asteroidService: cleanAsteroid + unrelatedEdits.asteroidService,
  miningRuntimeState: cleanMining + unrelatedEdits.miningRuntimeState,
  chatCommands: cleanChat + unrelatedEdits.chatCommands,
};
for (const [name, source] of Object.entries(synthetic)) {
  assert.notStrictEqual(viability.hash(Buffer.from(source)), viability.PREIMAGES[name].sha256);
  assert.strictEqual(viability.VALIDATORS[name](source), true);
}
assert.ok(transforms.transformAsteroidService(synthetic.asteroidService).endsWith(unrelatedEdits.asteroidService));
assert.ok(transforms.transformMiningRuntimeState(synthetic.miningRuntimeState).endsWith(unrelatedEdits.miningRuntimeState));
console.log("PASS b: unrelated same-file edits are accepted and preserved");

// (c) Changed owned content, duplicate anchors, repeat installation, and a
// pre-existing command at Four's overlay seam all fail closed.
const alteredAsteroidSeam = cleanAsteroid.replace(
  "  const rawPool = buildSystemOrePool(systemID);",
  "  const rawPool = buildSystemOrePool(systemID); // incompatible seam edit",
);
assert.throws(
  () => transforms.transformAsteroidService(alteredAsteroidSeam),
  /semantic seam changed incompatibly/,
);
const miningNewline = newlineFor(cleanMining);
const ambiguousMiningAnchor = `${cleanMining}${miningNewline}function estimateOriginalQuantity(scene, entity, yieldType, templateEntry = null) {}${miningNewline}`;
assert.throws(
  () => transforms.transformMiningRuntimeState(ambiguousMiningAnchor),
  /semantic anchor is ambiguous/,
);
assert.throws(
  () => transforms.transformAsteroidService(transformedAsteroid),
  /already installed/,
);
assert.throws(
  () => chatOverlay.validateSource(`${cleanChat}\n// \"beltmode\" conflicting command\n`),
  /conflicting Four command seam/,
);
console.log("PASS c: altered, ambiguous, repeated, and conflicting Four seams fail closed");

console.log("RESULT: targeted verifier passed");
