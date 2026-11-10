# Implementation status

Status words, used strictly:
- **verified** — exercised in an actual run of the game and seen to work (see "How it was checked").
- **partial** — exists and runs, but is incomplete against the plan or not yet checked in play.
- **deferred** — deliberately postponed; the plan's intent is preserved for a later milestone.
- **planned** — not started.

Nothing here has been checked on real GPU hardware or by a human player yet. See "Limits of the checks" at the end.

## Milestones
| Milestone | State | Notes |
|---|---|---|
| M0 — project established | **verified** | Modular TypeScript project; clean type-check and production build; loading and error screens; pause; yard with physical props; F3 profiling counters. |
| M1 — signature physical reaction | **verified** (animation-assisted route) | Gate run: 20/20 bump/stumble/fall/recovery sequences recovered; see results below. Jointed active ragdolls deferred. |
| M2 — first complete playable shift | **verified by scripted playthrough; awaiting your feedback** | Start → kit → briefing → call → decision → consequence → review → unlock → second shift without reloading. Four outcome paths played: arrest and handover, misunderstanding resolved, wrongful arrest, suspect escaped. |
| M3 — complete the first block | planned | Remaining station and shop rooms; pub, takeaway, flats, garage; three more incidents; world-state save. |
| M4 — career and everyday depth | planned | Training, vehicle, partner. |
| M5 — linked cases | planned | |
| M6 — town expansion | planned | |
| M7 — presentation and release | planned | |

## M1 gate result
`node tools/qa-yard.cjs` (dev build, `?scenario=yard&autotest=1&seed=5`): the test officer rams the cadet 20 times at walk (1.6 m/s), jog (3.5) and sprint (5.8), from varying directions while she walks her drill carrying a box.

| Approach speed | Outcomes over 20 sequences (final run) |
|---|---|
| Walk, 1.6 m/s | brush ×3 |
| Jog, 3.5 m/s | bump ×4 |
| Sprint, 5.8 m/s | brush ×1, bump ×1, stumble ×10, knockdown ×1 |

- **20 of 20 recovered** to normal animation. Stumbles took 4.2–9.9 s to full recovery, including the acknowledgment and picking the box back up; the knockdown took 8.1 s. (The previous run of the same gate had two knockdowns, recovered in 7.6 s and 14.0 s.)
- Box back in hand at the end of 20 of 20 sequences.
- 0 physics rescues, 0 blocked recoveries, 0 props above 25 m/s (fastest prop 8.8 m/s), item audit clean, no console errors.
- Glancing contacts at a sprint give a brush or bump; that is why the sprint row is mixed.
- Earlier runs of this gate found and fixed four real defects: contact severity depended on which body reported the hit; a light knock during a stumble cancelled the stumble and its recovery beat; an abandoned box was never fetched later; and the cadet detoured through a door because its nav node happened to be nearest.

- A small bump does not always knock anyone down: walking contact gives a brush, jogging a bump, sprinting a stumble, and only a head-on sprint into someone walking towards you gives a knockdown.
- Recovery never stands a person up inside furniture: the get-up searches for a clear upright spot near the settled body and waits if there is none.
- The dropped box is one item instance with one mesh; the item audit (holder ↔ item ↔ physics body consistency) reported no errors after any run.
- Reduced motion: the setting disables camera shake and halves pose flinch impulses. The setting was toggled and persisted in the lifecycle test; its visual effect was not separately inspected.

## Feature status

### World
| Feature | Status | Notes |
|---|---|---|
| Voxel town block: station (2 rooms) + yard, corner shop (2 rooms), Cobb's Passage, service lane, garden, Mill Cut, green, High Street, canal edge | verified | Walked with the real controller in test runs; see `docs/BUILDING_REGISTER.md`. |
| Interiors match exteriors, with ceilings, windows that correspond to rooms, lighting | verified | Screenshots inspected at gameplay camera angles. |
| Doors: bounded swing away from the user, obstruction check, gentle nudge, never a catapult | verified | Opened by the player via the prompt and by NPCs on their routes. Closing on a person not specifically tested. |
| Edge of the beat: landscape boundaries (viaduct, embankment, canal, barrier), no fake buildings | verified | NPCs can leave through three exits; the player is stopped at them. |
| Remaining station rooms, shop office and upstairs flat, other four buildings of the block | planned (M3) | |
| Streaming / room visibility culling | deferred | The slice is small enough to stay loaded. |
| Roofs, basements | planned | |

### Physics and animation
| Feature | Status | Notes |
|---|---|---|
| Kinematic capsule controller with momentum, auto-step, slopes, stamina | verified | |
| Contact → reaction pipeline: per-pair cooldown, severity from closing speed and who brought it, tiers brush / bump / stumble / knockdown | verified | Outcome is independent of which body reported the contact. |
| Carried stack and hand-held items; drop on bump/stumble; no duplication | verified | |
| Knockdown as a single dynamic body with procedural limbs; settle; safe get-up | verified | Not a jointed ragdoll (see charter). |
| Procedural locomotion, gaze, lean, carry, gestures, stumble, get-up through sprung poses | verified | Gait phase follows distance travelled. Foot placement on steps and hand IK are not implemented. |
| Movable props (bins, chairs, crates, cones, pots…) with mass and trip factor | verified | |
| Props striking people (e.g. a kicked bin hitting someone) | planned | Only people walking into things reacts today. |
| Walking over a person who is down | partial | The officer passes through a fallen body rather than stepping round it. |
| Jointed / motor-driven active ragdoll | deferred | Separate quality gate, after M2 feedback. |
| Player comfort: no ragdoll for the officer, brief camera response, reduced-motion setting | verified / partial | Setting works and persists; visual difference not separately inspected. |

### NPCs
| Feature | Status | Notes |
|---|---|---|
| Plans with interrupts and resumption (routine → reaction → back to work) | verified | Glen resumes his delivery after spilling parcels. |
| Perception: sight (range, facing, line of sight; a tall stack blocks the view), hearing (loudness, distance, coarse room/door attenuation) | verified | June's statement differed between runs according to where she stood. |
| Truth vs belief: witnesses and dispatch only relay what was perceived or reported | verified | The theft is only reported if the owner actually sees the tin leaving. |
| Acknowledge-and-recover beat with personality lines; retrieval of dropped items or a stated reason to leave them | verified | |
| Bystander utility scorer (continue / look / help / step back) with commitment window and helper cap | partial | Implemented; "look" observed. "Help" and "step back" not yet observed in a run. |
| Persistent memories (helped, ordered about, knocked over, wrongly accused, property recovered, trustworthy witness) affecting greetings | verified (greeting change); partial (wider effects) | Decay and caps implemented; only greetings read them so far. |
| Named residents: Mara, Glen, June, Toby, Rhys, Sgt Bell, Cadet Pip | verified | Ellis and Nadia arrive with their buildings (M3). |
| Full daily routines home → work → task → return | planned (M3) | Residents currently have shift-length routines only. |
| Queueing, reserved anchors | planned | |

### Incidents
| Feature | Status | Notes |
|---|---|---|
| Parking complaint: two accounts, inspection, three resolutions (agreed move, ordered move, mediated wait), self-resolution if ignored | verified (agreed move); partial (others) | The other branches are implemented but were not each played in a scripted run. |
| Shop theft, guilty variant: call-out, chase with route choice away from the officer, ditching the goods, detain, questioning, arrest, escort, handover, property return | verified | |
| Shop theft, innocent variant: till roll, receipt, release, explaining to the owner | verified | |
| Suspect escape with the case left open; recovering dropped property | verified | Escape: +5 XP for the victim's account, case shown as open. Dropped tin: picked up through the prompt, returned to the owner. |
| Wrongful arrest path with custody check, readable penalty and lasting memory | partial | Implemented; not yet played in a scripted run. |
| Rewards once per outcome (stable transaction ids), readable ledger | verified | A second press on an already-collected item does nothing; restarting a shift cannot re-earn its rewards. |
| Incident director with reservations, cooldowns and pacing across a catalogue | partial | Two incidents are staged per shift by simple rules; no general director yet. |
| Radio: repeat current call, ask what is outstanding | verified (opens and answers); backup/handover requests planned (M5) | |
| Other catalogue incidents | planned (M3+) | |

### Career, equipment, save
| Feature | Status | Notes |
|---|---|---|
| Career XP, training credit, public trust kept distinct | verified | |
| Locker screen, five-slot belt, owned gear, locked previews with how to earn them | verified | |
| Torch (light), radio, notebook, evidence kit (bag and tag) | verified (torch toggle, notebook, radio menu); partial (evidence kit) | The kit unlocks and equips; bagging was not exercised in a scripted run. |
| First unlock after the first shift; second shift without reloading | verified | |
| Local save with previous-checkpoint fallback; settings and key bindings persist | verified | `localStorage`, not IndexedDB. |
| World-state save (doors, props, case facts), export/import, migrations | planned (M3) | Schema is versioned; no older versions exist yet. |
| Restraints as an item, vest, medical pouch, cones in play, vehicles, firearms | planned (M4+) | Firearms are intentionally last. |

### Presentation and UI
| Feature | Status | Notes |
|---|---|---|
| Third-person camera with wall sweep, adjustable distance, shoulder offset | verified | |
| HUD: dispatch card, minimap with destination, belt with rendered item icons, single prompt, two-line subtitles, vitals only when relevant | verified | |
| Prompt safety: target and action shown before input; a changed prompt ignores presses for a moment; arrest only ever by explicit dialogue choice | verified | |
| Dialogue with short choices, visible exit, repeated-question weariness | verified | |
| Notebook with explicit CONFIRMED FACT / WITNESS CLAIM / LEAD labels | verified | |
| Shift review with outcomes, ledger, unlock and next step | verified | |
| Settings: sensitivity, camera distance, volume, text size, reduced motion, shadows, key rebinding | verified (reduced motion, rebinding persisted); partial (others not individually checked) | |
| Pause on Escape and on tab hide; no fast-forward on return | verified | |
| Audio: synthesised impacts, door, radio, UI, footsteps | partial | No ambience, room acoustics or voice. Not listened to in the headless checks. |
| Dusk/night, weather, music | deferred | |

## How it was checked
All runs used the development server and the Playwright drivers in `tools/`. Movement is driven through the real character controller; interactions are real key presses against the on-screen prompt.

| Check | Driver | Result |
|---|---|---|
| Type-check and production build | `npm run build` | Pass. Bundle is one 5.05 MB script (1.87 MB gzipped), mostly the physics engine with its WebAssembly inlined. The built game was loaded through `vite preview`: menu, shift start and pause work, no console errors, dev hooks absent. |
| M1 gate, 20 sequences | `tools/qa-yard.cjs` | Pass (table above) |
| Movement: three steps onto the platform, shoving a crate, 1.25 m passage, yard door opened and closed through the prompt, door stopping against the officer, sprinting round reception furniture | `tools/qa-walk.cjs` | Pass. The closing door stopped against the officer standing in its swing and finished once they stepped clear. |
| Shift, guilty variant with pursuit: kit → briefing → owner's complaint → Glen's parcel spill and recovery observed → shout and radio call → call-out → chase → tin thrown away → detain → questioning → arrest → escort → handover → tin picked up and returned → notebook → clock off → review → evidence kit equipped → shift 2 briefing | `tools/qa-shift.cjs chase` | Pass on the final code, console clean: +150 XP (100 first shift, 40 arrest and handover, 10 property returned), +2 trust, Mara greets shift 2 with "Kettle is on if you are passing later." In the final run the suspect was caught in the lane still holding the tin; earlier runs covered him throwing it away mid-chase and the officer picking it up through the prompt (a second press did nothing). |
| Shift, innocent variant done properly: owner's account → till roll → receipt → release → witness → owner told; parking settled by agreement (both accounts, inspection) | `tools/qa-shift.cjs innocent` | Pass, console clean, on the build before the last navigation change: +220 XP, +5 trust, parking "Settled". Re-run after that change it passed the whole investigation (June this time saw the card payment herself) and then stopped on a test-script race while Glen was driving off; the settled-parking ending was not repeated on the final code. |
| Shift, innocent variant with a hasty arrest: custody check, −8 trust with explanation; in shift 2 Toby says "Am I… am I under arrest again?" and Mara "I hope today goes better than last time." | `tools/qa-shift.cjs wrongful` | Pass, console clean (run before the final navigation change; not repeated after it). |
| Shift, suspect escapes: case left open, owner's account taken, parking resolves itself unattended with no credit | `tools/qa-shift.cjs escape` | Pass through review and shift 2 start (run before the final navigation change; not repeated after it). |
| Lifecycle: 10 restarts with identical character, body, collider, item, interactable and GPU geometry counts; restart from the pause menu; torch via belt key and use key; pause freezes time; tab hide pauses and does not fast-forward; reduced motion and a rebound key survive a page reload | `tools/qa-lifecycle.cjs` | Pass. An earlier run caught GPU geometry leaking on restart (+21 per restart); fixed and re-verified flat. |
| Visual inspection | screenshots in `docs/screenshots/` and from the runs above | Town, interiors, HUD, dialogue, locker, notebook and review inspected at gameplay camera angles. |

Defects these runs found and that were then fixed: doors attached to only one side of a doorway in the nav graph; characters spawning slightly sunk; a hidden NPC's plan freezing (the van never arrived); a detainee behind the officer stealing the prompt from the sergeant; the suspect leaving the beat before a player could react; duplicate subtitle lines; the review opening scrolled to the bottom.

## Changed after their last dedicated check
These were fixed late. The final chase playthrough ran with all of them in place; the final yard gate ran before the boundary change. None had a run aimed at it:
- Loose props and evidence now collide with the edge-of-beat walls, and a tin that still ends up off the beat is brought back inside. (Found when a thrown tin skidded just out of reach.) The fix itself has not been seen to trigger.
- The dispatch card now reminds you of a dropped tin after the suspect is in custody. Seen once on screen.
- The "Excuse me, officer — could I get past?" line when the officer blocks someone's route has not been observed.
- The wrongful-arrest, escape, movement and lifecycle scripts were last run before the final navigation and boundary changes.

## Known issues and limitations
- **Audio has not been heard.** It is synthesised and wired to events, but untested by ear, and there is no ambience.
- **The officer can walk through a person who is lying down.** Fallen bodies collide with the world and props, not with standing characters.
- **Props do not hurt people.** A bin kicked into someone does nothing; only people walking into things react.
- **With your back against a wall the camera closes right in and hides the officer** rather than clipping through. It reads as a brief first-person view.
- **Glen can clip the litter bin before you arrive.** His first trip starts at the briefing, so the spill is sometimes over by the time you reach the shop. It can happen again on later trips.
- **Second shift repeats the same two incidents** with different facts and participants. There is no wider catalogue yet.
- **Residents do not sit.** Benches and chairs are furniture and props only.
- **The parking branches "ordered move" and "mediated wait"**, the bystander "help" and "step back" reactions, and evidence bagging with the kit are implemented but were not each played in a scripted run.
- **Knockdowns are rare by design** (a head-on sprint, or a second hit during a stumble). If that feels too tame or too wild, the thresholds are in `tierOf` in `src/characters/character.ts`.
- **Save covers career, belt, settings and resident memories only.** World state (doors, props, open cases beyond their titles) is rebuilt each shift.
- **Restarting a shift keeps rewards and penalties already applied in it.** They cannot be earned twice, but they are not rolled back either.
- **The dev-only tools** (URL parameters, autopilot, time scale, autotest, the `window.__bw` hook) are disabled in production builds; the F3 overlay is kept.

## Limits of the checks
- **Device:** headless Chromium with software rendering (SwiftShader) on a 4-vCPU cloud container. No GPU. Frame rates there are meaningless for the 60 fps target, so **performance on real hardware is unmeasured**.
- **No human has played this build.** Feel, pacing, difficulty and readability of the tutorial are untested; the scripted driver steers with perfect knowledge of the nav graph.
- **Pointer lock and audio** cannot be exercised headlessly. Mouse look was tested only through the fallback path (camera set directly); sound was not heard.
- **Browsers:** Chromium only. Firefox and Safari are untested.
- **1920×1080 and increased text scale** were not inspected; screenshots were taken at 960×540 and 1280×720.
