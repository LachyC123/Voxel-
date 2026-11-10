# Art, UI and audio

## Visual identity
Warm brick, cream shop fronts, dark blue police uniforms, muted green gardens and small saturated signage accents. Voxel silhouettes should have crafted detail: window recesses, uneven stacks, chunky hair, readable hands and expressive brows.

Voxel style is intentional geometry, not permission for unstyled cubes. Use a consistent visual voxel density with larger structural modules and smaller detail voxels. Keep character faces legible at gameplay distance.

Three visual pillars: miniature British town; expressive physical people; clean readable policing tools.
Reject: random neon everywhere, oversized bloom, featureless flat buildings, unreadable tiny text and inconsistent asset scales.

## Asset production
Create an asset manifest with ID, source, licence, dimensions, pivot, collision type, material palette, LOD and animation coverage. No unverified commercial pack dependency.
Build an original modular kit: wall segments, corners, doors, windows, roofs, stairs, road edges and interior furnishings. Unique landmark façades prevent every street looking identical.
Use GLB assets where appropriate. For authored voxel meshes, merge static geometry or instance repeated elements rather than creating thousands of scene objects. Preserve separate doors and interactive props.

First character kit: common rig, several body proportions within tested limits, uniforms, everyday outfits, hair and head accessories. Avoid proportions that break door clearance or shared animations.

## Animation coverage
Required slice verbs: idle, walk, jog, turn, stop, look, talk, gesture, reach, carry, drop, pickup, bump, stumble, fall, settle, stand, cooperate and escort.
Every verb needs anticipation/action/recovery where appropriate. Match footsteps to movement and avoid skating. Conversation gestures need cooldowns. Clothing adjustments after recovery are small but valuable.

## Camera and light
Third-person default: adjustable distance, moderate perspective, shoulder offset only when needed. Sweep camera against walls and move inward smoothly. Never let it see through ceilings. In tight rooms prefer closer framing over making the whole town transparent.
Use a warm daylight setup first; dusk/night follows after visibility is solved. Window lights and shop signs guide navigation. Keep critical faces and evidence readable without excessive glow.

## HUD composition
Top left: one compact active dispatch card with incident, location and status.
Top right: modest minimap with north marker, destination and relevant backup.
Bottom centre: five-slot belt with actual voxel item renders, key labels and selected state.
Context: one target label and one primary action near the target.
Lower left: compact health/stamina only when changing or relevant.
Subtitles: lower-middle region above belt, maximum two readable lines.

Use off-white text, dark navy translucent surfaces, restrained blue selection and amber urgency. Pair colour with labels/shapes. No giant floating rewards, decorative fake graphs or permanent panels occupying half the screen.

## Item icon pipeline
Render the actual in-game item in a dedicated orthographic studio scene. Use a consistent three-quarter view, scale normalization, neutral lighting, transparent background and gentle contact shadow if it reads cleanly.
Export 128/256 px variants or a named atlas. Store icon reference on item definition. Never substitute emoji or unrelated flat clipart for final icons.
Test at the actual 40–56 px display size: the torch, radio and restraints must remain distinguishable. Generate silhouette variants if necessary.

## Screens
Main menu: continue/new, settings, credits.
Locker: character preview, compatible equipment slots, owned gear, unlock requirements.
Dispatch: optional calls, known risk, location, accept/defer.
Notebook: active cases, facts, claims, leads and people. Use explicit category labels.
Dialogue: speaker name and short response options; visible exit.
Shift review: concise outcome list and progress.
Settings: controls, audio categories, subtitles, text scaling, camera sensitivity, reduced motion, graphics quality.

Opening notebook/locker should pause single-player simulation unless explicitly designed otherwise. Radio quick menu may slow or pause as a comfort option. Never allow background weapon input while a menu has focus.

## Audio
Layer town ambience with room-specific acoustics: shop fridge hum, pub murmur, garage tools, distant traffic. Doors affect sound transmission coarsely.
Physics impacts need material groups and severity variation. Limit simultaneous clatter voices. Repeated light contacts should not sound like explosions.
Use short radio cues, gentle confirmation sounds and restrained promotion feedback. Dialogue can begin with text plus vocal murmurs; full voice work is optional. Subtitles always convey essential information.
Enable browser audio after a user gesture. Separate voice, effects, ambience and music levels. Pause/resume cleanly after focus changes.

## UI quality checks
Test 1280×720 and 1920×1080 at 100% and increased text scale. Long names and case titles must wrap. No text clipped by inventory icons. Keyboard focus must be visible. Pause removes pointer lock; resume requires clear user input. Responsive menus can support phones before gameplay is certified for touch.
