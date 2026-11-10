# Production charter (M0)

## What this is
Borough Watch is a single-player, third-person, voxel-style police sandbox for desktop browsers, built from the planning package in `docs/plan/`. This repository currently holds the **first playable slice: milestones M0, M1 and M2**. It is not the finished town game.

## Stack and pinned versions
| Part | Package | Version |
|---|---|---|
| Rendering | `three` | 0.187.0 |
| Physics | `@dimforge/rapier3d-compat` (WASM inlined) | 0.21.0 |
| Build / dev server | `vite` | 8.3.7 |
| Language | `typescript` | 7.0.2 |
| Types | `@types/three` | 0.187.0 |

Versions were checked against the npm registry on 10 November 2026 and are pinned exactly; `package-lock.json` is committed. Node 22 was used.

## Commands
```
npm install        # once
npm run dev        # development server (http://localhost:5173) with dev tools enabled
npm run build      # type-check, then production build into dist/
npm run preview    # serve the production build
npm run typecheck  # type-check only
```

## Decisions carried over from the plan
- Third-person over-the-shoulder camera, adjustable distance (mouse wheel or settings). First person is not built.
- Desktop browser, keyboard and mouse, single player, local save. No mobile, controller or multiplayer support is claimed.
- Fictional UK-inspired borough; ranks and procedure are game systems.
- Voxel visual construction; no structural destruction.
- No paid assets, external AI service, account system or backend.

## Deviations from the plan's proposals (recorded, not hidden)
- **Save storage is `localStorage`, not IndexedDB.** The save is a small JSON record (career, belt, settings, resident memories). It is written at the end of each shift and when the locker or settings close, with the previous valid checkpoint kept as a fallback. Export/import is not built yet.
- **Animation is fully procedural** (pose functions driven through per-joint springs). There are no authored clips or `AnimationMixer` use yet.
- **Knockdowns use a single dynamic rigid body per person with procedural limbs**, not a jointed multi-body ragdoll. This is the plan's "animation-assisted reactions first" route; a jointed active ragdoll remains a later experiment behind its own quality gate.
- **The corner shop is single-storey in this slice.** The upstairs flat arrives with M3 when the building is completed; there is no fake door to it.

## Asset sources
Every model, icon, sign and sound is generated in code in this repository (see `docs/ASSET_MANIFEST.md`). No external asset packs, fonts or audio files are used.

## Test device
All checks so far were run in **headless Chromium driven by Playwright, using SwiftShader software rendering, in a 4-vCPU Linux cloud container**. That is not a representative gaming device: there is no GPU, so frame-rate figures from it say nothing about the 60 fps target on a mid-range desktop. Performance on real hardware is **unmeasured**.
