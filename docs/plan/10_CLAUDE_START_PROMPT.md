# Paste this into Claude

Please build BOROUGH WATCH using the attached planning package.

It is a single-player Three.js voxel-style police sandbox set in a compact British-inspired town. Every building in the playable area must eventually have a coherent, fully explorable interior. The central appeal is authentic funny NPCs, real-time physical reactions, procedural animation, varied incidents, and police career progression unlocking equipment, weapons training and bigger jobs.

Read 00_START_HERE.md and then the numbered documents before implementing. Treat confirmed user requirements as the core brief; proposed values are tuning assumptions. Inspect the existing project first and preserve anything working. Use TypeScript and a modular architecture. Pin dependencies after checking current official APIs.

Prioritise:
1. NPCs with goals, routines, perception and relevant memory. Humour comes from believable reactions to physical mishaps.
2. Stable collisions, carried objects, stumbles, dropped items, falls and recovery. Use animation-assisted physics first. Advanced active ragdolls require a separate quality gate.
3. Real interiors with routes, functional furniture, doors, stairs and reasons to explore.
4. A compact playable shift: briefing, call, decision, consequence, resolution or failure, review and unlock.
5. A clean HUD with rendered voxel images of actual equipment. No emoji substitutes or generic cluttered dashboard.

Default to a third-person camera so physical reactions are visible. Desktop keyboard/mouse first; do not claim mobile or multiplayer support.

Start with M0 and M1, then complete M2 as the first reviewable playable shift. Do not attempt all 18 buildings or every planned system at once. Do not stop after creating a static town scene.

Use actual animation for visible actions. Make a character stumble and recover because of a contact, not because a random timer plays a fall. Ensure carried evidence cannot duplicate. Keep simulation facts separate from UI and dialogue. Witnesses must not know events they could not perceive.

Run the app and test by playing. Test success, misunderstanding, suspect escape, restart and a second shift. Inspect screenshots at real gameplay camera angles. Report precise run commands, working features, checks performed, performance measurements if available and known limitations. If tools cannot run a particular check, say so.

Keep an implementation status file marking each feature planned, partial, verified or deferred. Pause for my feedback after the first complete shift, with screenshots and controls. Preserve the remaining vision for later milestones.
