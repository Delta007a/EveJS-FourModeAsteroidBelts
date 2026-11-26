# FourModeAsteroidBelts 0.2.6

Adds EveJS 261125.3 support. Normal belt quantity calculations read the loaded policy and environment overrides directly. Both belt commands retain their staff permissions and live refresh.

Restores `/beltmode` and `/beltvolume` through the EveJS 261115.2 client command dispatcher. The commands retain their staff-only permissions.

On EveJS 261108.1, accepted belt generations retain their composition and geometry through ordinary reloads. Fresh retail belts use the native counts where available. Mode or volume changes with refresh rebuild normal belts in the current system. Other systems keep their accepted generations until a local refresh or native downtime reset.

Supports native EveJS `0.12.8`, `0.12.9`, `261018.1`, `261028.1`, `261108.1`, `261115.2`, `261125.3`. The 261028.1 port was checked with **EveJS Launcher 1.0.76** and EVE client **build 3396210**. The user confirmed all four mods passed in-game verification on 2026-10-31; the automated port checks remain separate evidence. Older declared server support is retained, without claiming a new full certification of those versions.

The maintainer confirmed the four updated mods work together in-game on EveJS 261108.1.

## Install and update

Download `EveJS-FourModeAsteroidBelts-0.2.6.zip` from [Releases](https://github.com/Delta007a/EveJS-FourModeAsteroidBelts/releases/latest). Use Launcher **Mods > Add ZIP**, enable the mod and open **Configure**. Fresh ZIP installs start disabled. Configuration changes require a Game server restart.

The package contains no personal `settings.json`, `.env`, runtime database or client archive. Launcher carries forward package-local files declared by the settings schema. Back up personal configuration before updating or removing a mod. For legacy customized source installations, transfer settings to the documented JSON configuration before updating; source files are replaced by updates.

## Behavior and defaults

Four distribution modes: `retail`, `evejs-fixed`, `pre-scarcity`, `pre-scarcity-enriched`.

| Setting | Default |
| --- | --- |
| Distribution | evejs-fixed |
| Belt volume multiplier | 1x |

Configure writes `config/fourModeAsteroidBelts.json` under the EveJS root; no personal policy file is shipped. This file is outside the package and remains after an update/removal. Process environment `EVEJS_ASTEROID_BELT_ORE_DISTRIBUTION` / `EVEJS_MINING_BELT_VOLUME_MULTIPLIER` takes precedence over persisted policy, then defaults. The multiplier range is 0.01 through 1000.

Staff commands `/beltmode` and `/beltvolume` share the persisted policy and live belt refresh behavior. Belt-only scaling affects normal asteroid belts; Moon/Homefront rocks, missions, anomalies and unrelated resource entities are outside that scope. New upstream mining notifications and chat commands are retained. Source transforms operate in memory on owned semantic seams.

## Removal

Disable in Launcher and use your normal Game server restart procedure. Remove deletes the package but leaves the root policy file for reuse.

License: AGPL-3.0-only. No vendor source is included.
