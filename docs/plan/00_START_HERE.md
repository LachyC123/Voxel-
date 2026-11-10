# BOROUGH WATCH — Claude development package

Version 1 • 10 November 2026 • Planning package, not a playable game.

## The brief
Build a single-player Three.js game set in a fully explorable voxel-style British-inspired town. The player is a police officer progressing from small neighbourhood calls to bigger assignments. Reactive physical characters, believable funny NPCs, satisfying equipment progression, and a clean HUD with voxel item images are the defining features.

The town takes itself seriously. Comedy emerges from people pursuing understandable goals while physical things go wrong. Do not turn everyone into a clown or replace the simulation with disconnected joke dialogue.

## Decisions and assumptions
- Confirmed: Three.js; voxel town; enterable buildings; physical comedy and procedural reactions; police progression; equipment and weapons; escalating jobs; clean interface; voxel item icons; authentic NPC personalities.
- Proposed default: third-person over-the-shoulder camera so the officer, body language and physical comedy remain visible. Adjustable camera distance. First person is a later option, not a second controller to build immediately.
- Proposed default: desktop browser, keyboard/mouse, single player, local save. Mobile/controller support can follow a verified desktop slice.
- Proposed setting: fictional UK-inspired borough. Rank and specialist access are game systems, not claims of real police procedure.
- Scope: voxel visual construction, not a fully destructible voxel engine. Doors, furniture and selected breakable props react physically; structural destruction is outside the first release.
- No paid assets, external AI service, account system or multiplayer dependency is assumed.

## Read order
1. 01_GAME_DESIGN.md — identity, shift loop and player systems.
2. 02_TOWN_AND_INTERIORS.md — map, buildings, access and streaming.
3. 03_PHYSICS_AND_ANIMATION.md — reactive movement, ragdolls and recovery.
4. 04_NPC_SIMULATION.md — personalities, perception, memory and humour.
5. 05_INCIDENTS_AND_CASES.md — incident structure and job catalogue.
6. 06_PROGRESSION_AND_EQUIPMENT.md — career, unlocks and economy.
7. 07_ART_UI_AUDIO.md — voxel identity and interface specification.
8. 08_TECHNICAL_ARCHITECTURE.md — proposed stack, data and save boundaries.
9. 09_MILESTONES_AND_QA.md — build order and acceptance gates.
10. 10_CLAUDE_START_PROMPT.md — paste this into Claude with this folder.
11. 11_CONTENT_EXAMPLES.json — illustrative content records.
12. 12_RISKS_AND_REFERENCES.md — limits, technical references and decisions.

## Working agreement
Build one coherent playable street first. Preserve working features and grow outward. Never call a walking scene the finished first milestone. Each milestone needs an objective, player decisions, visible responses, failure/recovery, and verification.

At each milestone, report what works, how to run it, evidence from actual play, and what remains. Stop for feedback at the first playable shift and the major visual polish pass unless the user requests uninterrupted development.

This package specifies intended behaviour. Example data and tuning values are starting proposals; no game performance, animations, balancing or browser compatibility have been tested by this planning package.
