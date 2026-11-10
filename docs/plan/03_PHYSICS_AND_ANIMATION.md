# Physics and procedural animation

## Intended feel
Characters have weight, momentum and a strong desire to stay upright. Small impacts create small responses; large impacts may knock them down. Ragdolls are punctuation, not the default walking system. Physics must change outcomes in real time while player controls remain dependable.

Three.js supplies rendering, not a complete character simulation. Proposed physics layer: Rapier JavaScript/WASM. Its character controller and joints are building blocks; custom balance, animation matching, recovery, hand placement and humour still need authored systems.

## Delivery layers
1. Responsive kinematic player/NPC capsules, physically simulated selected props.
2. Animated locomotion with procedural head tracking, lean, upper-body recoil and hand targets.
3. Directional stumbling and corrective steps informed by contact severity.
4. Limited ragdolls with reliable get-up transitions.
5. Optional motor-driven upper-body reactions or active-ragdoll experiments after the first shift works.

Layer 5 is a research milestone with a quality gate. Do not promise whole-town self-balancing physical humans or let that experiment block the entire game.

## Character representation
Use a voxel-style segmented rig with head, chest, pelvis, upper/lower arms, hands, upper/lower legs and feet. Model limbs with thickness and clear pivots. Static voxel meshes per segment can be attached to a skeletal or transform hierarchy. Avoid one independent rigid body per visual voxel.

Provide authoring names and local axes for each joint, centre of mass, collision shapes, interaction grip anchors and foot contact points. Dynamic ragdolls use a small set of capsule/box colliders with joint limits. Adjacent body parts should not fight each other through self-collision.

## Ownership state machine
Animated → reactive → stumbling → falling → ragdoll → settling → getting up → animated.

Separate restrained, injured and unconscious statuses from motion state; recovery does not clear legal or medical status.

At every transition explicitly assign control of root and bones to animation or physics. Never have both write the same transforms independently. Transfer world pose and appropriate linear/angular velocity into ragdoll. Disable the upright capsule as a blocking duplicate while the ragdoll owns collision.

On recovery choose face-up/face-down animation, locate a safe root position, sweep for clearance, blend from the settled pose and re-enable the capsule without overlap. If no clearance exists, wait, crawl/reposition if implemented, or request help. Never teleport upright through a table.

## Contact-to-reaction pipeline
Physics contact → filter duplicate contacts → estimate severity from relative motion/impulse and body part → choose movement response → update stress/embarrassment → emit social observation.

Tune thresholds in a physics test yard. Tiny resting contacts must not trigger reactions. Use hysteresis and per-pair cooldowns so a person leaning on a wall does not complain every frame. One fall may produce several contacts but only one initial surprise vocalisation.

Response tiers:
- Brush: head turn, shoulder adjustment, short acknowledgment.
- Bump: torso reaction, one step, held object jostles.
- Loss of balance: several corrective steps, reaching hand, possible dropped item.
- Knockdown: ragdoll with clamped inherited energy.
- Recovery: check surroundings, stand, adjust clothes, respond to the cause.

Use different profiles for confident, tired, carrying-heavy-object and startled characters. Personality changes expression and decisions; it should not produce arbitrary physics masses.

## Procedural layers
- Gaze: eyes/head orient towards meaningful nearby events, with angular limits and smoothing.
- Turn lean: subtle torso lean from lateral acceleration, capped to avoid rubber bodies.
- Foot placement: ground checks adjust feet within safe offsets; disable or change mode on stairs and in ragdoll.
- Hand placement: reach towards a known door handle, counter edge or held item. Blend in/out; do not snap arms to distant targets.
- Balance steps: select a reachable foot target and play a step with movement correction. This is assisted animation, not a claim of fully solved biomechanics.
- Conversation: shifting weight, checking an object, pointing at a relevant location, folding arms.

## Props
Classify static fixtures, movable props, held props, breakables and evidence. Tables do not need to fly because a sleeve brushed them. Chairs, bins, cones, bottles, bags and boxes provide useful physical variety.

Held props attach through a controlled grip representation. On release, switch to a dynamic body with bounded velocity. A dropped bag can spawn a small pooled set of visible contents backed by inventory records; do not duplicate valuable objects every drop.

Opening doors use a stable controlled hinge or bounded rotation with obstruction checks. A door can bump a nearby person gently, but repeated opening must not become an infinite-force catapult. Breakage is limited to authored breakables; fragments are pooled, short-lived and nonessential to navigation.

Evidence remains recoverable. If a key item falls into an unreachable crevice, flag a visible recovery interaction or safe restore after validation, not silent deletion.

## Player comfort
Player movement uses a dependable controller. Use brief camera response and optional visible body reaction for impacts. Do not fully ragdoll the player for routine bumps. Reserve incapacitation for substantial events with clear recovery. Include reduced shake, motion blur off by default and adjustable camera distance.

## Physics budgets and testing
Start with a 60 Hz fixed simulation, capped catch-up steps and interpolated rendering; adjust only after profiling. Proposed first-slice caps: 24 active NPCs, 6 simultaneous detailed ragdolls, 60 awake loose props. These are limits to test, not performance promises.

When ragdoll capacity is reached, use a safe authored fall response, never despawn a visible person. Sleep settled props. Lower distant character update frequency without weakening nearby collisions.

Test shoulder contacts, stairs, thresholds, narrow doors, seated poses, stacked props, drop/pickup loops, recovery under furniture, large frame stalls and repeated restart. Record jitter, penetration, energy explosions and recovery failures. Fix these before increasing chaos.
