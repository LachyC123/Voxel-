# Town and interiors

## Meaning of fully explorable
Every visible playable-town building has a coherent interior matching its exterior footprint and floors. All authored rooms are reachable through ordinary access, a key/permission, or an assignment. Locks are gameplay gates, not permanently fake doors. Public access does not imply residents welcome entry into private rooms.

Use bridges, railway boundaries and landscape to clearly define the town. Do not surround it with tempting fake town buildings. Any distant skyline must be clearly outside the playable boundary. Do not advertise a town-wide interior feature before the building audit passes.

## Proposed full-town scope
A compact 180–240 metre town footprint, 18 enterable buildings, around 40 named residents. These are content targets after the slice; reduce footprint before reducing interior quality. Aim for a couple of minutes to cross town on foot.

Districts:
- Civic square: station, town hall, clinic, post office.
- High street: corner shop, pub, bakery/café, takeaway, charity shop.
- Residential lanes: three houses, one block with three flats, landlord's house.
- Service edge: garage, warehouse, small hotel, old cinema.

The 18 building count is: 4 civic + 5 high street + 5 residential + 4 service.

## Route structure
The station faces a square feeding the high street. The high street curves towards the garage and warehouse. A rear service lane links shops to residential gardens. A canal-side footpath returns from the service edge to the square. Two cross-streets provide shortcuts. This creates at least two loops rather than a single mission corridor.

Landmarks: station clock, pub sign, cinema marquee, water tower beyond garage. Frame one landmark from each major junction. Use distinct brick/palette groups and readable signage. Keep alleys visible enough to invite investigation.

## First playable block
Build six structures: station, corner shop, pub, takeaway, flats, garage. Rough block size 80 × 100 metres. Make each complete before expanding.

| Building | Required interior | Gameplay purpose | Alternative route |
|---|---|---|---|
| Station | Reception, briefing room, lockers, evidence room, interview room, cells, yard | Start, review, storage, handover | Yard gate |
| Corner shop | Sales floor, till, stockroom, office, upstairs flat | Theft, witness work, deliveries | Rear delivery door |
| Pub | Bar, booths, toilets, cellar, upstairs room | Disputes and evening crowd | Cellar delivery access |
| Takeaway | Counter, kitchen, store, small staff room | Queue arguments and chase complications | Back kitchen door |
| Flats | Shared stairwell and three furnished units | Neighbour complaints, resident routines | One safe rear stair |
| Garage | Reception, work bays, parts store, office | Vehicle identification and later transport | Yard access |

## Room authoring contract
Each room defines bounds, floor, ceiling, entrances, navigation region, lighting, functional furniture, interaction anchors, ambient sound and owner/access policy.

For every building provide:
- Exterior footprint and floor heights that match interior space.
- Player and NPC routes from street to every room.
- Door ownership, lock state, opening direction and clearance.
- At least one meaningful role per room: routine, evidence, resource, route, story or quiet human detail.
- Furniture that leaves circulation space.
- Windows that correspond to rooms.
- Save-stable IDs for doors, containers and important props.

Dead ends should contain information, a personal detail or useful interaction. Do not put loot in every cupboard merely to justify the room.

## Scale and navigation
Use metres consistently. Start with 0.25 m structural increments and an approximately 1.7 m adult character, then validate proportions visually. Door openings around 1.1–1.3 m help comic characters and escort pairs. Provide turning room near stairs and counters. Use invisible stair ramps for locomotion where appropriate, while visible steps remain physical for fallen props/ragdolls if stable.

Connect exterior navigation and room navigation through door portals. Portal state invalidates routes when locked or blocked. NPCs request access or choose an alternative. Never let characters path through a locked door.

## Explorable roofs and basements
Only include roof routes with believable access, readable ledges and camera clearance. Add railings or clear fall rules. Basements must have real stair or hatch access, lighting and navigation. A short service tunnel may connect two later buildings; avoid an enormous sewer level before core policing works.

## Streaming
Exterior chunk meshes and room groups are render units. Keep simulation state separate from loaded visuals. Preload adjacent rooms before a door opens. Preserve people, evidence and prop state across unload/reload. Occlusion may hide interiors, never delete their state.

Do not move NPCs through unloaded space in a way that makes them appear behind a player who just looked away. Reconcile abstract travel with real entry points outside view.

## Completion audit
Maintain a building register listing every floor and room, access route, furniture pass, incident hooks, NPC routes, camera check and save check. A building counts complete only after walking its rooms with the real controller and testing one NPC route through it.
