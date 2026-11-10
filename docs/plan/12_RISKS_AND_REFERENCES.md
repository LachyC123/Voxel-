# Risks, sources and open decisions

## Highest risks
1. Physical characters: balancing and get-up reliability are difficult. Prove one person in a test yard before crowds.
2. Interior scope: every building multiplies art, navigation, lighting and incident work. Expand only in finished blocks.
3. NPC authenticity: random chatter is insufficient. Prioritise perception, routines, memory and follow-through.
4. Performance: physics, animation and interiors can exceed browser budgets. Profile the crowded slice before expanding.
5. Career fairness: hidden facts and physics accidents can make rewards frustrating. Explain outcomes and protect against simulator failures.

## Decision log
Proposed defaults awaiting ordinary design feedback, not blockers:
- Third person rather than first person.
- Desktop browser before phone gameplay.
- Fictional UK-inspired policing with accessible game progression.
- Around 18 complete buildings as the full-town target.
- Selected prop breakage, not structural voxel destruction.
- Single-player local saves, no backend.
- Authored/contextual dialogue, no required AI API.

Changing camera or adding cooperative multiplayer affects controller, interaction, animation, save and architecture work. Record those changes explicitly rather than bolting them on invisibly.

## Technical references checked 10 November 2026
These support the proposed implementation direction, not a guarantee of game performance.

- Three.js animation system: https://threejs.org/manual/pages/animation-system.html
  Supports imported animation clips and mixer-based animation. Character-specific procedural behaviour remains custom work.
- Three.js AnimationMixer: https://threejs.org/docs/pages/AnimationMixer.html
  API reference for animation playback management.
- Three.js documentation: https://threejs.org/docs/
  Consult rendering, loaders, instancing and lifecycle documentation when implementing.
- Rapier JavaScript character controller: https://rapier.rs/docs/user_guides/javascript/character_controller/
  Provides movement collision support. It is not a complete NPC locomotion or behavioural system.
- Rapier JavaScript joints: https://www.rapier.rs/docs/user_guides/javascript/joints/
  Documents constraints and motors. These are ingredients for reactive rigs; a stable self-balancing character is additional engineering.

No external asset packs are included or claimed licensed. No generated artwork, executable game, installed dependencies or measured game benchmark is supplied in this ZIP. All numerical budgets and progression values are proposed starting points.
