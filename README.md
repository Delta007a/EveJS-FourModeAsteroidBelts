# FourModeAsteroidBelts 0.2.0

Choose Retail, EveJS fixed, Pre-scarcity or Pre-scarcity enriched asteroid-belt ore distribution, and scale belt rock volume. Supports native EveJS 0.12.8 and final 0.12.9. It affects belts, not Moon Ore anomalies.

## Install and configure

Use **EveJS Launcher v1.0.65 → Mods → Add ZIP**, select the release ZIP, enable the mod and restart the Game server. The release ZIP starts disabled. **Configure** exposes both settings and writes `config/fourModeAsteroidBelts.json` in the EveJS root. The defaults are EveJS fixed distribution and 1× volume. Restart the server after Launcher Configure changes.

Staff can use `/beltmode` and `/beltvolume` at runtime. Those commands persist the same mod-owned JSON policy and may refresh belt state. Process environment overrides remain authoritative: `EVEJS_ASTEROID_BELT_ORE_DISTRIBUTION` and `EVEJS_MINING_BELT_VOLUME_MULTIPLIER` take precedence over persisted JSON, followed by native defaults. A manual Native server can preload `mods/fourModeAsteroidBelts/loader.js` with Node `--require` before EveJS modules load.

## Compatibility and removal

The loader transforms only its two owned belt seams in memory and overlays the chat command exports. Final 0.12.9 added `/fit` and `/unfit`; the belt commands coexist with them. Launcher Remove removes the package but leaves the EveJS-root belt policy file for reuse. Delete that file manually only if you no longer want the saved preferences.

Final 0.12.9 certification: targeted transform/command verifier passed, including fail-closed conflicts and preservation of unrelated source edits; four-loader composition passed. Final live gameplay remains to be checked.

License: AGPL-3.0-only. EveJS itself is AGPL-3.0-only; no vendor source is included in this package.
