# NPC authenticity and humour

## NPC contract
Every named resident has a home, occupation or daily purpose, a routine, possessions, relationships and a few recognisable traits. Background crowds can be simpler, but anyone involved in a case becomes a persistent entity.

Separate the truth of the world from what each NPC believes. Witnesses only report events they perceived or learned about. A person behind a closed wall does not know an incident occurred unless sound or communication provides that information.

## Decision layers
Priority interrupts: immediate danger, injury, physical recovery.
Then: incident role, conversation, work/social obligations.
Then: routine activities and idle variation.

A small utility scorer chooses between plausible actions: continue task, look, move away, help, complain, conceal, cooperate, flee, seek assistance. Commitment windows prevent indecisive frame-by-frame switching. Use a state machine for the chosen action.

Plan frequency is independent of rendering. Nearby characters can reconsider several times per second; distant routines can update sparsely. Immediate impacts and urgent perception events interrupt at once.

## Suggested data
Identity: stable ID, name, outfit, home, work.
Traits: confidence, patience, honesty, sociability, impulsiveness.
Transient: fear, frustration, embarrassment, fatigue, attention.
Knowledge: observed events with time, source and confidence.
Memory: notable encounters and relationship adjustments.
Activity: intent, target, route, reservation, carried item.
Incident: role, actual involvement, claimed account, cooperation status.

Do not infer guilt from appearance, demographic identity or personality. A nervous witness may be innocent; a charming suspect may lie.

## Six initial residents
Mara, shop owner: practical, protective of stock, remembers helpful officers. Keeps serving when a conversation runs long.
Glen, delivery driver: rushed, defensive about parking, proud of efficiency. Carries too many boxes because he dislikes second trips.
June, upstairs resident: observant, talkative, often correct about details but muddles timing.
Ellis, garage apprentice: eager to help, fidgets with tools, overestimates mechanical expertise.
Nadia, pub manager: calm until people damage furniture, knows regulars and can identify genuine unusual behaviour.
Toby, student: easily embarrassed, talks too quickly, sometimes becomes an innocent person mistaken for someone else.

Any resident may have an ordinary nonincident day. Do not permanently label one person “the criminal NPC.”

## Perception
Vision uses distance, facing, line of sight and attention. Sound uses event loudness, distance and coarse room/door attenuation. An open shop door carries argument noise further than a closed upstairs room.

Observation creates a belief record; it does not instantly broadcast to everyone. A bystander may tell another person or phone dispatch. Police knowledge updates through reports and actual observation.

Give bystanders sensible personal-space and danger boundaries. They may watch from a distance rather than crowding the player. Limit the number allowed to gather; remaining residents continue their day.

## Humour event recipe
1. A reasonable goal.
2. A physical or social complication.
3. A reaction matching personality.
4. A short follow-through.
5. Return to life with any meaningful consequence retained.

Example: Glen tries carrying four boxes → the top box blocks his view → he nudges a bin → parcels spill → he checks whether anyone saw → says “That one was already damaged” → gathers the parcels and grumbles.

The simulation can trigger and vary this sequence. It must not repeat on a fixed interval regardless of conditions.

## Dialogue rules
Write concise lines tied to event type, role, relationship and emotional state. Use varied wording, cooldowns and recent-line memory. Let the player finish reading before another speaker interrupts unless the interruption matters.

Examples:
- After a harmless stumble: “Nobody saw that. Good.”
- Owner protecting a mess: “Mind the crisps. They've suffered enough.”
- Overhelpful witness: “I wrote the number plate down. On something I've lost.”
- Annoyed resident after repeated questioning: “Same answer as before, officer.”

Use sparingly. Serious injuries should prompt concern, not slapstick jokes. Subtitles and nonverbal gestures work without expensive real-time generated dialogue. No language-model API is required.

## Memory and continuity
Store meaningful encounters, not every footstep. Categories: helped, wrongly accused, property recovered, frightened, damaged property, trustworthy witness. Apply decay and capped influence so one mistake does not ruin every future interaction.

Memories affect greetings, willingness to help and specific dialogue. They must not override physical safety or fabricate evidence. Persist selected memories between shifts.

## Pathfinding and interaction anchors
Reserve chairs, tills, work positions and conversation spots. When an anchor is unavailable, choose another or wait. Use door portals and queue logic. Detect stalled routes; replan before escalating to a recovery placement outside view. Never teleport an observed suspect out of a chase.

## Authenticity acceptance checks
A resident completes home → work → task → return.
A witness cannot describe an unseen event.
A dropped item produces retrieval or a reason to abandon it.
A fallen NPC recovers and acknowledges the event.
One harmless bump does not start a town-wide fight.
Residents continue working around a resolved incident.
Revisiting a helped resident changes at least one relevant interaction.
