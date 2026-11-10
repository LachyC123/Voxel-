# Milestones and acceptance gates

## M0 — Inspect and establish the project
Inspect existing code, assets and instructions. If empty, create a modular project and production charter. Document versions, run commands, intended camera, asset sources and test device.
Deliver: a controlled character in a tiny purposeful test yard, working loading/pause, one physical prop and profiling counters.
Gate: launch/build cleanly; camera and collision work; no claim that the town game is complete.

## M1 — Prove the signature physical reaction
One character can walk, carry, collide, stumble, drop an item, fall if necessary, recover and acknowledge the event. Add a chair, bin, door, steps and narrow passage.
Gate: 20 repeated bump/fall/recovery sequences without explosive physics, duplicate items or permanent stuck states. A small bump does not always ragdoll. Reduced-motion camera works.
If motor-driven active ragdolls fail this gate, use stable animation-assisted reactions and retain advanced balance as a later experiment.

## M2 — First complete playable shift
Station reception/locker, finished shop interior, alley and a small return route. Two named residents plus sufficient witnesses. Introduce parking/conversation and shoplifting with a possible chase. Include success, misunderstanding, escape and retry paths.
Implement minimal dispatch, interaction prompt, voxel belt icons, case facts, shift review and one unlock.
Gate: a new player can start, understand a call, resolve or fail it, finish shift, equip the unlock and play another shift without reloading.
Pause for user feedback with actual gameplay screenshots and known limitations.

## M3 — Complete the first block
Finish all six buildings and their interiors. Expand to six named residents and background routines. Add pub disagreement, upstairs noise and missing bicycle. Add appropriate evidence persistence and save/load.
Gate: every room accessible; NPC routes through every doorway; three different incidents resolve without rewards duplicating; saved outcomes survive reload.

## M4 — Career and everyday depth
Training, rank eligibility, equipment choices, public feedback, recurring memories, limited partner and first vehicle.
Gate: a career can progress across multiple shifts; no softlock after spending credits; a wrongly suspected resident responds coherently later; vehicle entry/exit safe near obstacles.

## M5 — Linked cases and larger operations
Warehouse and service district, linked theft case, backup positions, multiple participants and clear fact/claim distinctions.
Gate: case can be solved from available evidence, handed over or left open. Backup cannot teleport visibly or block every route. Major calls are optional after unlocking.

## M6 — Town expansion
Grow to the proposed 18 complete buildings in batches. Finish interior/register audits for each batch. Add remaining residents and useful schedules. Expand catalogue gradually.
Gate: all visible town buildings satisfy the full exploration contract and remain within measured performance limits.

## M7 — Presentation and release preparation
Polish art, animation transitions, audio, icon consistency, UI, accessibility and settings. Add high-risk tools only after encounter and consequence systems pass.
Gate: production build, active gameplay review, stable save migrations, restart soak, no severe console errors, documented device performance.
Pause for major polish review.

## Active-play test matrix
| Area | Test | Pass condition |
|---|---|---|
| Movement | Doors, corners, stairs, roofs, slopes | No trapping, clipping or unreachable authored rooms |
| Camera | Small rooms, tall shelves, stairs | Player and target readable, no wall peeking |
| Physics | Bumps, props, falls, repeated recoveries | Stable response and valid recovery |
| AI | Routines interrupted by incident | Appropriate interruption and later resumption |
| Witnesses | Block line of sight and close door | Claims respect actual perception |
| Cases | Innocent and guilty variants | Evidence supports each outcome |
| Arrest | Restrain, escort, fall, recover, handover | Status remains consistent; no double reward |
| Equipment | Swap during menu/animation | No accidental discharge, stuck tool or duplicated item |
| UI | Small viewport and long text | No overlap; readable icons and keyboard focus |
| Save | Resolve, save, close, reload | Career, case and important objects restored |
| Lifecycle | Ten shift restarts | No duplicate residents, timers or increasing resource leak |
| Performance | Crowded pub and street chase | Measured target or documented reduction plan |
| Focus | Hide tab, return, unlock audio | Paused state and safe input recovery |

## Completion evidence
For each milestone retain: launch command, build result, tested browser/device, scenarios played, screenshots from active gameplay, measured performance where relevant and known issues.
Do not use a staged screenshot as proof that pursuit, collision or saving works. Do not claim mobile support from a resized desktop window alone.

## Scope priority if development stalls
Keep: living NPC reactions, explorable interiors, basic policing decisions, clean icons, one shift and progression reward.
Defer: entire-town scale, full active-ragdoll balancing, complex vehicle physics, firearms branches, day/night weather, full voice acting, mobile controls and multiplayer.
Preserve the full vision in the roadmap; do not quietly remove it or pretend deferred work is implemented.
