# Technical architecture

## Proposed stack
Three.js rendering; TypeScript; Vite build/dev server; Rapier JavaScript/WASM physics; HTML/CSS overlay UI; local IndexedDB save storage. Keep rendering direct unless an existing project provides a justified framework.

Pin compatible versions when implementation starts and commit the lockfile. This plan intentionally does not claim a particular package version is installed or tested. Follow current official APIs rather than copying guessed method signatures.

## Modules
src/app — startup, loading, lifecycle, settings.
src/simulation — fixed tick, state, events, seeded random.
src/world — building registry, rooms, portals, streaming.
src/physics — bodies, colliders, collision filters, ragdolls.
src/characters — controller, rig, animation ownership, interactions.
src/ai — perception, beliefs, routines, decisions, navigation.
src/incidents — director, templates, case facts, resolution.
src/career — ranks, training, rewards, equipment.
src/presentation — scene, camera, effects, sound, icons.
src/ui — HUD, notebook, menus, accessibility.
src/persistence — schema, migrations, save/load and backups.
src/content — validated definitions.
src/dev — scenario tools, profiling, diagnostics.

Avoid a giant main file. Use explicit stable entity IDs and typed records. A lightweight entity/component approach is sufficient; do not build an elaborate general-purpose engine before the slice.

## Update order
Collect input → update intentions/perception on their schedules → resolve character movement and interaction requests → fixed physics step → consume contacts → update incidents and authoritative state → emit events → interpolate and animate presentation → update UI/audio → render.

Some animation targets must be prepared before physics while resulting poses are read afterwards. Document transform ownership. The important invariant is one writer for each transform and one authoritative source for each game fact.

Use an accumulator, cap frame delta and limit catch-up steps. On tab hide pause the single-player simulation; do not fast-forward an unattended chase on return.

## Event examples
ContactObserved, ItemDropped, WitnessStatementRecorded, DoorStateChanged, IncidentReported, EvidenceCollected, PersonRestrained, IncidentResolved, RewardGranted.

Each meaningful event carries ID, simulation timestamp, actor/target IDs, location and relevant payload. Presentation reacts to events but cannot independently grant XP or change guilt.
Events that can be retried need idempotency, especially evidence collection, rewards and save restoration.

## Data contracts
NPC definition: identity and baseline traits.
NPC runtime: beliefs, status, route intent, memory and ownership links.
Building definition: room IDs and portals.
Incident template: roles, eligibility and possible outcomes.
Incident runtime: assigned participants, fixed facts, discovered evidence and resolution state.
Item definition: icon/model references, slot compatibility and actions.
Item instance: stable ID, owner/container or world position, condition and evidence links.

Validate definitions at load and produce human-readable errors for dangling references. The example JSON is illustrative content data, not an executable engine or complete schema.

## Navigation
Start with an authored walkable graph/grid and explicit room/door links suitable for the compact block. Add local avoidance and reserved interaction anchors. A later navmesh solution is optional after measuring requirements.
Mark door transitions, stairs and restricted spaces. Recompute routes on meaningful obstacle changes rather than rebuilding everything each frame.
Chase targets are perceived positions, not exact coordinates through walls.

## Save strategy
Persist schema version, world seed, clock/shift, career, owned gear, named residents, important memories, case facts, evidence ownership, building/door state and relevant movable objects.
Autosave at shift start, safe incident boundaries and shift completion. Offer manual save only in safe states initially. Clearly label last checkpoint so players know what recovery preserves.
Do not serialize live GPU objects, WASM handles or unfinished physics constraints. Restore characters into validated stable poses. If mid-chase saves are later added, define stable reconstruction and test them explicitly.
Write a new save transaction before replacing the previous valid checkpoint. Validate and migrate schema, retain a fallback backup and offer export/import. Browser storage can be cleared; do not claim cloud durability.

## Performance design
Targets: 60 fps at 1080p on a chosen midrange desktop reference device, 30 fps on a lower tier. Name the device and browser in measurement reports. These are goals, not verified results.
Initial envelope: 24 nearby NPCs, 6 detailed ragdolls, 60 awake props. Start lower and increase under measurement.
Separate visual LOD, animation rate, AI rate and physics activation. Never turn off a nearby suspect's collision simply because the camera looks away.
Merge static voxel surfaces, instance repeated props where suitable, reduce material count, pool effects, limit dynamic lights and shadow casters. Render interiors selectively while preserving state.
Measure frame-time percentiles, active bodies, draw calls, memory and route failures. Streaming load spikes count as performance defects.

## Lifecycle
Restart disposes subscriptions, physics bodies/joints, mixers, audio, render targets and temporary entities. Clear pending dispatch timers. Repeated new shifts should not multiply listeners or duplicate citizens.
Asset loading has progress, errors and retry. Missing critical assets block entry with a useful message; never silently spawn invisible characters.

## Developer tools
Scenario picker, collision/route overlay, contact severity display, NPC current intent/belief inspector, room audit and compact state snapshots. Development-only test hooks must be removed or disabled for production.
Suggested tests cover reward duplication, witness visibility, incident participant reservation, save migration and arrest/recovery state compatibility. Do not substitute code-unit tests for active gameplay inspection.
