# Asset manifest

All assets are original and generated in code. Licence: same as the repository. No LODs or authored animation clips exist yet.

| ID | Kind | Source file | Dimensions (m) | Pivot | Collision | Notes |
|---|---|---|---|---|---|---|
| character rig | Segmented voxel rig (head, chest, pelvis, upper/lower arms with hands, upper/lower legs with feet) | `src/characters/rig.ts` | ~1.75 tall | Feet centre | Capsule r 0.28, half-height 0.57 (kinematic); capsule r 0.25, half-height 0.52 while knocked down (dynamic) | One merged mesh per segment; outfits are data (`src/content/residents.ts`) |
| torch_basic, radio, notebook, evidence_kit, traffic_cones | Belt items | `src/content/items.ts` | per definition | Centre | None while on the belt | Icons rendered from these same models |
| parcel, shortbread_tin | World item instances | `src/content/items.ts` | 0.42×0.26×0.34; 0.2×0.09×0.2 | Centre | Dynamic box when loose | Stable instance IDs; one mesh per instance |
| bin, wheelie, chair, crate, cone, crisps, pot, plant, deckchair, binbag | Movable props | `src/world/props.ts` | per definition | Centre | Dynamic box | Mass and trip factor per kind |
| town block | Static geometry | `src/world/town.ts` | ~75 × 45 footprint | World origin | Static boxes; glass in its own group | Merged into four meshes (ground, exterior, interior, glass) |
| doors (5) | Hinged leaves | `src/world/doors.ts` | 1.2–1.4 × 2.2 | Hinge | Kinematic box, bounded rotation | Stable IDs |
| GD Couriers van | Vehicle (scripted move only) | `src/world/town.ts` | 4.8 × 2.3 × 2.0 | Centre | Kinematic box | Not drivable |
| signs | Canvas textures | `src/world/voxel.ts` (`makeSign`) | per sign | Centre | None | Drawn with system fonts |
| item icons | 128 px PNG data URLs | `src/presentation/icons.ts` | — | — | — | Orthographic studio render at start-up |
| sounds | Synthesised (Web Audio) | `src/presentation/audio.ts` | — | — | — | Impacts, door, radio, UI, footsteps; no ambience or voice yet |
