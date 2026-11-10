# Incidents and case design

## Director
Generate incidents from valid people, locations, time windows and available resources. Reserve participants and areas so one person is not simultaneously a missing resident, pub witness and prisoner.

State: eligible → staged → reported/discovered → active → stabilised → resolved/escaped/handed-over → cooldown.

A director controls pacing, not NPC omniscience. Dispatch can only relay reported information. Give calm patrol intervals between intense events. Start with one main call plus one ambient complication. Later allow a second manageable call, not endless urgent alerts.

Seed the content choices for reproduction. Physics is not promised bit-identical across devices; save a useful initial scenario snapshot alongside the seed.

## Incident template
ID, title, eligibility, required locations, participant roles, actual facts, initial report, evidence, possible escalation, available resolutions, rewards, penalties, cooldown and accessibility fallback.

Never force the escalation after the player already prevented its cause. If the driver moves the van peacefully, do not spawn a fight just because the mission script expected one.

## Initial catalogue
| Call | Investigation/action | Possible complication | Valid resolution |
|---|---|---|---|
| Blocked delivery entrance | Hear both accounts; inspect obstruction | Driver carrying unstable stack of boxes | Move vehicle and settle dispute |
| Missing bicycle | Record description; ask nearby witnesses | Similar bicycle belongs to someone else | Identify and return correct property |
| Corner-shop theft | Owner account; inspect goods/receipt | Suspect abandons bag during escape | Recover property; identify responsible person |
| Upstairs noise | Visit both flats; locate sound | Noisy pipe mistaken for a party | Explain or resolve actual source |
| Pub disagreement | Separate accounts and calm participants | Chair tips; friend intervenes | De-escalate or restrain justified aggressor |
| Lost visitor | Find destination and helpful landmarks | Witness confidently gives wrong directions | Escort or provide accurate route |
| Suspicious garage activity | Observe access and ask worker | Authorised late repair resembles theft | Verify facts and close or investigate |
| Broken shop window | Secure area; inspect timeline | Child and adult give conflicting accounts | Establish supported account |
| Missing parcel | Follow delivery record | Parcel placed in wrong stockroom | Locate and return |
| Minor collision | Check occupants and witnesses | Argument blocks traffic | Safe handover and incident report |
| Burglary report | Search accessible rooms; collect evidence | Resident arrives and disturbs scene | Link evidence or record unresolved lead |
| Wanted vehicle lead | Compare identifiers and follow-up | Similar vehicle causes false lead | Correct identification and backup |
| Cinema trespass | Locate occupants safely | Locked side door changes return path | Safe exit and appropriate resolution |
| Warehouse stolen goods | Link previous cases; coordinate entry | Several exits and evidence movement | Secure people and recover traced goods |
| High-risk armed call | Unlock via specialist qualification | Bystanders and incomplete reports | Protect people, seek compliance, resolve threat |

The first release should finish a small subset well. Later rows are roadmap content, not a first-pass checklist.

## Detailed slice: shoplifting
Preconditions: shop open; owner at work; chosen suspect not reserved; item available; navigable rear route.
Facts: one item is taken without purchase OR an innocent variant has a valid receipt. Make the facts fixed once the scenario starts.
Report: owner describes what they actually observed.
Evidence: item identity, transaction record and optional witness observation.
Actions: speak, inspect, request item, ask witness, pursue if justified by observed behaviour.
Escape: suspect chooses an available route based on current exits; may drop the actual carried bag. Dropping it updates ownership and evidence records once.
Comedy: a bin collision can produce a stumble; a shop owner protects a display; a witness follows too far and is asked to wait.
Endings: misunderstanding resolved, property recovered and appropriate action taken, suspect escaped with case open, or backup handover.
Anti-exploit: never repeatedly award XP for picking up the same item or re-arresting the same person.

## Detailed middle case: deliveries disappearing
Three theft reports may share a vehicle description. Each report can stand alone. After sufficient supported links, unlock a warehouse lead. Let the player inspect records and speak to workers; suspicion alone is not a proof flag.
Case notebook distinguishes confirmed fact, witness claim and player lead.
At warehouse, place residents and goods logically. Backup can cover one exit. A person may cooperate, another may flee, and an uninvolved worker may simply want to finish work.
Success depends on evidence and safe resolution, not clearing a building of enemies.

## Difficulty and replay
Change route availability, number of accounts, conflicting obligations, participant temperament and response time. Do not randomly change the truth during a conversation. Keep clues sufficient for a fair solution.
Larger cases combine previously taught systems. End-of-shift prompts can tease an unresolved lead without forcing a cliffhanger every time.
