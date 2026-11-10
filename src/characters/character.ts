import * as THREE from 'three';
import { G, Physics, RAPIER, SOLID, groups } from '../physics/physics';
import { EventBus } from '../simulation/events';
import { Items } from '../world/items';
import { Gesture, Outfit, P, Pose, Rig, newPose, poseDown, poseGetUp, poseLocomotion, poseSeated, poseStumble } from './rig';

// Ownership state machine (docs/plan/03): animated → reactive → stumbling →
// falling/down → getting up → animated. While "down" a single dynamic body owns
// the root transform and the upright capsule is disabled; everything else is
// driven by the kinematic capsule. One writer per transform at all times.
export type MotionState = 'animated' | 'reactive' | 'stumbling' | 'down' | 'gettingUp';
export type Tier = 'none' | 'brush' | 'bump' | 'stumble' | 'knockdown';
export const TIER_ORDER: Tier[] = ['none', 'brush', 'bump', 'stumble', 'knockdown'];

export const RADIUS = 0.28;
export const HALF = 0.57;
export const CENTER = RADIUS + HALF;

export interface Cause {
  kind: 'char' | 'prop' | 'item' | 'door' | 'static' | 'vehicle';
  id: string;
}

export interface CharEnv {
  phys: Physics;
  events: EventBus;
  items: Items;
  chars: Map<string, Character>;
  reactions: Reactions;
  reducedMotion: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const q1 = new THREE.Quaternion();

export function tierOf(sev: number): Tier {
  if (sev < 0.7) return 'none';
  if (sev < 2.2) return 'brush';
  if (sev < 3.9) return 'bump';
  if (sev < 6.2) return 'stumble';
  return 'knockdown';
}

export class Character {
  readonly rig: Rig;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private cc: RAPIER.KinematicCharacterController;
  private filter: number;

  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  yaw = 0;
  /** Actual horizontal velocity achieved last step. */
  readonly vel = new THREE.Vector3();
  private walkVel = new THREE.Vector3();
  private vy = 0;
  grounded = true;

  // intent (written by player input or NPC brain)
  readonly wishDir = new THREE.Vector3();
  wishSpeed = 0;
  faceYaw: number | null = null;
  accel = 12;
  turnRate = 7;

  motion: MotionState = 'animated';
  motionT = 0;
  readonly shove = new THREE.Vector3();
  private stumbleDur = 1.1;

  // items (mirrors owned by world/items.ts)
  held: string | null = null;
  stack: string[] = [];

  restrained = false;
  /** A belt tool is drawn and held in the right hand (player). */
  toolOut = false;
  seated = false;
  hidden = false;
  /** Frozen in place (conversation, scripted beat). */
  locked = false;
  stamina = 1;
  staminaTime = 14;
  tired = 0;
  /** Chance of letting go of a hand-held item on a stumble. */
  dropChance = 0.5;

  lookTarget: THREE.Vector3 | null = null;
  lookTimer = 0;
  gesture: Gesture | null = null;
  gestureT = 0;
  private gestureDur = 0;

  private phase = 0;
  private lean = 0;
  private pose: Pose = newPose();
  private seed: number;
  private t = 0;

  // knockdown
  private downBody: RAPIER.RigidBody | null = null;
  private settleT = 0;
  private retryT = 0;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private lastSafe = new THREE.Vector3();
  lastCause: Cause | null = null;
  lastTier: Tier = 'none';

  readonly stats = { brushes: 0, bumps: 0, stumbles: 0, falls: 0, recoveries: 0, blockedRecoveries: 0, rescues: 0 };

  constructor(
    readonly id: string, public name: string, outfit: Outfit, private env: CharEnv,
    pos: THREE.Vector3, yaw: number, readonly isPlayer = false,
  ) {
    this.rig = new Rig(outfit);
    this.pos.copy(pos);
    this.prevPos.copy(pos);
    this.lastSafe.copy(pos);
    this.yaw = yaw;
    this.seed = (id.length * 7.13 + id.charCodeAt(id.length - 1) * 0.37) % 10;
    const w = env.phys.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + CENTER, pos.z));
    const mask = SOLID | G.CHAR | (isPlayer ? G.BOUNDARY : 0);
    this.filter = groups(G.CHAR, mask);
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(HALF, RADIUS).setCollisionGroups(groups(G.CHAR, 0xffff)), this.body);
    env.phys.owners.set(this.collider.handle, { kind: 'char', id });
    this.cc = w.createCharacterController(0.03);
    this.cc.enableAutostep(0.3, 0.15, false);
    this.cc.enableSnapToGround(0.3);
    this.cc.setApplyImpulsesToDynamicBodies(true);
    this.cc.setCharacterMass(70);
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    if (isPlayer) {
      this.accel = 22;
      this.turnRate = 12;
    }
    this.updateVisual(0, 1);
  }

  get carrying(): boolean {
    return this.stack.length > 0;
  }
  get upright(): boolean {
    return this.motion !== 'down' && this.motion !== 'gettingUp';
  }
  get speed(): number {
    return Math.hypot(this.vel.x, this.vel.z);
  }
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  eye(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.motion === 'down' && this.downBody) {
      const t = this.downBody.translation();
      return out.set(t.x, t.y + 0.2, t.z);
    }
    return out.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
  }
  /** Where the body actually is (follows the ragdoll body while down). */
  centre(out = new THREE.Vector3()): THREE.Vector3 {
    if (this.motion === 'down' && this.downBody) {
      const t = this.downBody.translation();
      return out.set(t.x, t.y, t.z);
    }
    return out.set(this.pos.x, this.pos.y + CENTER, this.pos.z);
  }

  lookAt(p: THREE.Vector3, seconds: number): void {
    this.lookTarget = (this.lookTarget ?? new THREE.Vector3()).copy(p);
    this.lookTimer = seconds;
  }

  playGesture(g: Gesture | null, seconds = 1.5): void {
    this.gesture = g;
    this.gestureT = 0;
    this.gestureDur = seconds;
  }

  stop(): void {
    this.wishSpeed = 0;
  }

  teleport(p: THREE.Vector3, yaw?: number): void {
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.lastSafe.copy(p);
    if (yaw !== undefined) this.yaw = yaw;
    this.walkVel.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.shove.set(0, 0, 0);
    this.body.setTranslation({ x: p.x, y: p.y + CENTER, z: p.z }, true);
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    this.rig.root.visible = !h;
    this.collider.setEnabled(!h && this.motion !== 'down');
  }

  // ------------------------------------------------------------ fixed step
  step(dt: number): void {
    this.prevPos.copy(this.pos);
    this.t += dt;
    if (this.lookTimer > 0 && (this.lookTimer -= dt) <= 0) this.lookTarget = null;
    if (this.gesture) {
      this.gestureT += dt;
      if (this.gestureT > this.gestureDur) this.gesture = null;
    }
    if (this.hidden) {
      this.vel.set(0, 0, 0);
      return;
    }
    if (this.motion === 'down') return this.stepDown(dt);
    if (this.motion === 'gettingUp') {
      this.motionT += dt;
      this.vel.set(0, 0, 0);
      if (this.motionT >= 1.3) {
        this.motion = 'animated';
        this.stats.recoveries++;
        this.env.events.emit({ type: 'Recovered', actor: this.id, pos: this.pos.clone(), visible: true, data: { from: 'fall', cause: this.lastCause } });
      }
      return;
    }

    // --- horizontal intent with momentum
    const tiredCap = this.tired > 0.5 ? 3.0 : 99;
    let sp = this.locked || this.seated ? 0 : Math.min(this.wishSpeed, tiredCap);
    if (this.motion === 'reactive') sp *= 0.35;
    if (this.motion === 'stumbling') sp = 0;
    v1.copy(this.wishDir).setY(0);
    if (v1.lengthSq() > 1e-6) v1.normalize().multiplyScalar(sp);
    else v1.set(0, 0, 0);
    v2.subVectors(v1, this.walkVel);
    const maxDv = this.accel * dt;
    if (v2.length() > maxDv) v2.setLength(maxDv);
    const prevVx = this.walkVel.x, prevVz = this.walkVel.z;
    this.walkVel.add(v2);
    this.shove.multiplyScalar(Math.exp(-(this.motion === 'stumbling' ? 1.5 : 5) * dt));

    const dvx = this.walkVel.x + this.shove.x;
    const dvz = this.walkVel.z + this.shove.z;
    this.vy = this.grounded ? -2 : Math.max(-30, this.vy - 22 * dt);

    this.cc.computeColliderMovement(this.collider, { x: dvx * dt, y: this.vy * dt, z: dvz * dt }, undefined, this.filter);
    const m = this.cc.computedMovement();
    this.grounded = this.cc.computedGrounded();
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    if (this.pos.y < -6) {
      // physics safety net: never lose a person through the floor
      this.stats.rescues++;
      this.teleport(this.lastSafe);
      this.env.events.emit({ type: 'PhysicsRescue', actor: this.id });
      return;
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + CENTER, z: this.pos.z });
    this.vel.set(m.x / dt, 0, m.z / dt);
    if (this.grounded && this.motion === 'animated') this.lastSafe.copy(this.pos);

    // --- contacts
    const desiredSpeed = Math.hypot(dvx, dvz);
    const n = this.cc.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const col = this.cc.computedCollision(i);
      if (!col || !col.collider) continue;
      const owner = this.env.phys.owners.get(col.collider.handle);
      if (!owner) continue;
      if (owner.kind === 'char') {
        const other = this.env.chars.get(owner.id);
        if (!other || other === this) continue;
        v1.subVectors(other.pos, this.pos).setY(0);
        if (v1.lengthSq() < 1e-6) continue;
        v1.normalize();
        const mine = dvx * v1.x + dvz * v1.z;
        const theirs = -(other.vel.x * v1.x + other.vel.z * v1.z);
        this.env.reactions.charChar(this, other, mine, theirs, v1);
      } else if (owner.kind === 'prop' || owner.kind === 'item') {
        if (desiredSpeed < 0.7) continue;
        const bt = col.collider.parent()?.translation();
        if (!bt) continue;
        v1.set(bt.x - this.pos.x, 0, bt.z - this.pos.z);
        if (v1.lengthSq() < 1e-6) continue;
        v1.normalize();
        const approach = dvx * v1.x + dvz * v1.z;
        this.env.reactions.charProp(this, owner, approach, v2.set(dvx, 0, dvz).normalize());
      } else if (this.motion === 'stumbling' && (owner.kind === 'static' || owner.kind === 'vehicle')) {
        // braced against something solid: stop staggering
        const nx = col.normal1.x, nz = col.normal1.z;
        if (Math.abs(nx) + Math.abs(nz) > 0.5) {
          this.shove.multiplyScalar(0.3);
        }
      }
    }

    // --- timers
    if (this.motion === 'reactive' || this.motion === 'stumbling') {
      this.motionT -= dt;
      if (this.motionT <= 0) {
        const was = this.motion;
        this.motion = 'animated';
        if (was === 'stumbling') {
          this.env.events.emit({ type: 'Recovered', actor: this.id, pos: this.pos.clone(), visible: true, data: { from: 'stumble', cause: this.lastCause } });
        }
      }
    }

    // --- facing
    const sp2 = this.speed;
    let targetYaw: number | null = this.faceYaw;
    if (this.motion !== 'stumbling' && sp > 0.2 && this.walkVel.lengthSq() > 0.04) targetYaw = Math.atan2(this.walkVel.x, this.walkVel.z);
    if (targetYaw !== null && this.motion !== 'stumbling') {
      let d = targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const stepYaw = Math.sign(d) * Math.min(Math.abs(d), this.turnRate * dt);
      this.yaw += stepYaw;
    }
    // lateral acceleration → lean
    const ax = (this.walkVel.x - prevVx) / dt, az = (this.walkVel.z - prevVz) / dt;
    const lateral = ax * Math.cos(this.yaw) - az * Math.sin(this.yaw);
    this.lean += (THREE.MathUtils.clamp(-lateral * 0.012, -0.16, 0.16) - this.lean) * Math.min(1, dt * 8);

    // gait phase advances with distance travelled, so feet do not skate
    const stride = 0.62 + 0.13 * sp2;
    this.phase += ((this.motion === 'stumbling' ? Math.max(sp2, 2.2) * 1.5 : sp2) * dt * Math.PI) / stride;

    // stamina
    if (sp2 > 4.4) this.stamina = Math.max(0, this.stamina - dt / this.staminaTime);
    else this.stamina = Math.min(1, this.stamina + dt / (sp2 > 1 ? 14 : 7));
    if (this.stamina <= 0.001) this.tired = 1;
    else if (this.tired > 0 && this.stamina > 0.35) this.tired = 0;
  }

  // ------------------------------------------------------------ reactions
  flinch(dir: THREE.Vector3, strength: number): void {
    const lz = dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw);
    const lx = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw);
    const k = this.env.reducedMotion ? 0.5 : 1;
    this.rig.kick(P.chestPitch, -lz * 5 * strength * k);
    this.rig.kick(P.chestRoll, -lx * 5 * strength * k);
    this.rig.kick(P.headPitch, -lz * 7 * strength * k);
    this.rig.kick(P.headRoll, -lx * 6 * strength * k);
    this.rig.kick(P.shLR, 3 * strength);
    this.rig.kick(P.shRR, 3 * strength);
  }

  startReactive(dir: THREE.Vector3, push: number): void {
    this.motion = 'reactive';
    this.motionT = 0.45;
    this.shove.addScaledVector(dir, push);
    this.flinch(dir, 1);
  }

  startStumble(dir: THREE.Vector3, sev: number): void {
    this.motion = 'stumbling';
    this.stumbleDur = this.isPlayer ? 0.5 : 1.15;
    this.motionT = this.stumbleDur;
    this.shove.copy(dir).multiplyScalar(THREE.MathUtils.clamp(sev * 0.55, 2.0, 3.8));
    this.walkVel.multiplyScalar(0.2);
    this.flinch(dir, 1.6);
  }

  knockDown(dir: THREE.Vector3, sev: number): void {
    if (this.downBody) return;
    this.motion = 'down';
    this.motionT = 0;
    this.settleT = 0;
    this.retryT = 0;
    this.collider.setEnabled(false);
    this.walkVel.set(0, 0, 0);
    this.shove.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    q1.setFromAxisAngle(UP, this.yaw);
    const lin = v1.copy(dir).setY(0).normalize().multiplyScalar(THREE.MathUtils.clamp(sev * 0.4, 1.2, 3.2));
    const ax = v2.crossVectors(UP, dir).normalize().multiplyScalar(3.6);
    const w = this.env.phys.world;
    this.downBody = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.pos.x, this.pos.y + CENTER, this.pos.z)
        .setRotation({ x: q1.x, y: q1.y, z: q1.z, w: q1.w })
        .setLinvel(lin.x, 1.0, lin.z)
        .setAngvel({ x: ax.x, y: 0, z: ax.z })
        .setLinearDamping(0.5)
        .setAngularDamping(2.2),
    );
    w.createCollider(
      RAPIER.ColliderDesc.capsule(0.52, 0.25).setMass(70).setFriction(1.1).setRestitution(0)
        .setCollisionGroups(groups(G.DOWNED, G.STATIC | G.PROP | G.DOOR | G.VEHICLE | G.GLASS | G.DOWNED | G.BOUNDARY)),
      this.downBody,
    );
    this.stats.falls++;
  }

  private stepDown(dt: number): void {
    const b = this.downBody!;
    this.motionT += dt;
    const t = b.translation();
    if (t.y < -6 || !Number.isFinite(t.x)) {
      this.stats.rescues++;
      b.setTranslation({ x: this.lastSafe.x, y: this.lastSafe.y + 0.4, z: this.lastSafe.z }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      this.env.events.emit({ type: 'PhysicsRescue', actor: this.id });
      return;
    }
    this.pos.set(t.x, Math.max(0, t.y - 0.25), t.z);
    this.vel.set(0, 0, 0);
    const lv = b.linvel(), av = b.angvel();
    const still = Math.hypot(lv.x, lv.y, lv.z) < 0.25 && Math.hypot(av.x, av.y, av.z) < 0.6;
    this.settleT = still ? this.settleT + dt : 0;
    if ((this.settleT > 0.5 && this.motionT > 1.5) || this.motionT > 6) {
      this.retryT -= dt;
      if (this.retryT <= 0) {
        if (!this.tryGetUp()) {
          this.retryT = 1.0;
          this.stats.blockedRecoveries++;
          this.env.events.emit({ type: 'RecoveryBlocked', actor: this.id, pos: this.pos.clone() });
        }
      }
    }
  }

  /** Find a clear upright spot near the settled body; never stand up through furniture. */
  private tryGetUp(): boolean {
    const phys = this.env.phys;
    const b = this.downBody!;
    const t = b.translation();
    const shape = new RAPIER.Capsule(HALF - 0.04, RADIUS);
    const ident = { x: 0, y: 0, z: 0, w: 1 };
    const from = v1.set(t.x, t.y + 0.15, t.z);
    const offsets: [number, number][] = [[0, 0]];
    for (const r of [0.35, 0.65]) for (let a = 0; a < 8; a++) offsets.push([Math.cos((a * Math.PI) / 4) * r, Math.sin((a * Math.PI) / 4) * r]);
    for (const [ox, oz] of offsets) {
      const x = t.x + ox, z = t.z + oz;
      const gy = phys.groundY(x, z, t.y + 0.6);
      if (Math.abs(gy - (t.y - 0.25)) > 0.5) continue;
      const centre = { x, y: gy + CENTER + 0.06, z };
      if ((ox || oz) && phys.raycast(from, v2.set(x, gy + 0.5, z), G.STATIC | G.GLASS | G.DOOR | G.VEHICLE)) continue;
      const hit = phys.world.intersectionWithShape(centre, ident, shape, undefined, groups(G.CHAR, SOLID | G.CHAR));
      if (hit) continue;
      // commit
      this.rig.root.updateWorldMatrix(true, false);
      this.fromPos.copy(this.rig.root.position);
      this.fromQuat.copy(this.rig.root.quaternion);
      // keep facing the way the body ended up pointing
      const r = b.rotation();
      q1.set(r.x, r.y, r.z, r.w);
      v2.set(0, 0, 1).applyQuaternion(q1);
      const headDir = new THREE.Vector3(0, 1, 0).applyQuaternion(q1);
      this.yaw = Math.abs(v2.y) > 0.5 ? Math.atan2(-headDir.x * Math.sign(v2.y), -headDir.z * Math.sign(v2.y)) : Math.atan2(v2.x, v2.z);
      phys.world.removeRigidBody(b);
      this.downBody = null;
      this.pos.set(x, gy, z);
      this.prevPos.copy(this.pos);
      this.body.setTranslation({ x, y: gy + CENTER, z }, true);
      this.collider.setEnabled(true);
      this.motion = 'gettingUp';
      this.motionT = 0;
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ presentation
  updateVisual(dt: number, alpha: number): void {
    const root = this.rig.root;
    if (this.hidden) return;
    let omega = 15, zeta = 0.72;
    if (this.motion === 'down' && this.downBody) {
      const t = this.downBody.translation(), r = this.downBody.rotation();
      q1.set(r.x, r.y, r.z, r.w);
      v1.set(0, -CENTER + 0.03, 0).applyQuaternion(q1);
      root.position.set(t.x + v1.x, t.y + v1.y, t.z + v1.z);
      root.quaternion.copy(q1);
      poseDown(this.pose, this.t, this.seed);
      omega = 9; zeta = 0.45;
    } else if (this.motion === 'gettingUp') {
      const k = THREE.MathUtils.smoothstep(this.motionT / 1.3, 0, 1);
      root.position.lerpVectors(this.fromPos, this.pos, Math.min(1, k * 1.6));
      q1.setFromAxisAngle(UP, this.yaw);
      root.quaternion.slerpQuaternions(this.fromQuat, q1, Math.min(1, k * 1.5));
      poseGetUp(this.pose, k);
      omega = 10;
    } else {
      root.position.lerpVectors(this.prevPos, this.pos, alpha);
      root.quaternion.setFromAxisAngle(UP, this.yaw);
      if (this.motion === 'stumbling') {
        poseStumble(this.pose, this.t, this.phase, this.seed);
        omega = 18; zeta = 0.5;
      } else if (this.seated) {
        poseSeated(this.pose, this.t);
      } else {
        poseLocomotion(this.pose, {
          t: this.t, speed: this.speed, phase: this.phase, lean: this.lean,
          carrying: this.stack.length > 0, holdingR: this.held !== null || this.toolOut, restrained: this.restrained,
          gesture: this.gesture, gestureT: this.gestureT, seed: this.seed, tired: this.tired,
        });
      }
      // gaze
      if (this.lookTarget && !this.carrying) {
        const dx = this.lookTarget.x - this.pos.x, dz = this.lookTarget.z - this.pos.z;
        let dy = Math.atan2(dx, dz) - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const yawOff = THREE.MathUtils.clamp(dy, -1.15, 1.15);
        const dist = Math.hypot(dx, dz);
        const pitch = THREE.MathUtils.clamp(Math.atan2(this.pos.y + 1.55 - this.lookTarget.y, Math.max(0.4, dist)), -0.5, 0.6);
        this.pose[P.headYaw] += yawOff * 0.75;
        this.pose[P.chestYaw] += yawOff * 0.22;
        this.pose[P.headPitch] += pitch * 0.8;
      }
    }
    if (dt > 0) this.rig.update(this.pose, dt, omega, zeta);
    else this.rig.snap(this.pose);
  }

  dispose(): void {
    const w = this.env.phys.world;
    if (this.downBody) w.removeRigidBody(this.downBody);
    this.downBody = null;
    w.removeCharacterController(this.cc);
    this.env.phys.owners.delete(this.collider.handle);
    w.removeRigidBody(this.body);
    this.rig.root.removeFromParent();
  }
}

// -------------------------------------------------------------------------
// Contact → reaction pipeline: filter duplicates (per-pair cooldown), estimate
// severity from relative motion, choose a movement response, emit one social
// observation event.
export class Reactions {
  private cooldown = new Map<string, number>();
  now = 0;
  env!: CharEnv;

  private gate(key: string, seconds: number): boolean {
    const until = this.cooldown.get(key) ?? 0;
    if (this.now < until) return false;
    this.cooldown.set(key, this.now + seconds);
    return true;
  }

  private vulnerability(c: Character, selfCaused: boolean): number {
    let m = 1;
    if (c.stack.length >= 2) m *= selfCaused ? 3.4 : 1.6; // cannot see their feet past the stack
    if (c.tired > 0.5) m *= 1.2;
    if (c.restrained) m *= 1.15;
    if (c.isPlayer) m *= 0.7;
    return m;
  }

  /**
   * Two people collide. `aToward` / `bToward` are each party's speed towards the
   * other; severity depends on the closing speed and on who brought it, so the
   * outcome is the same whichever capsule happened to report the contact.
   */
  charChar(a: Character, b: Character, aToward: number, bToward: number, dir: THREE.Vector3): void {
    const at = Math.max(0, aToward), bt = Math.max(0, bToward);
    const rel = aToward + bToward;
    if (rel < 0.7 || !b.upright || !a.upright) return;
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (!this.gate(key, 0.9)) return;
    const shareA = at + bt > 1e-3 ? at / (at + bt) : 0.5; // fraction of the impact a brought
    const sevB = rel * (0.4 + 0.6 * shareA) * this.vulnerability(b, false) + (b.motion === 'stumbling' ? 2.5 : 0);
    const sevA = rel * (0.4 + 0.6 * (1 - shareA)) * this.vulnerability(a, false) + (a.motion === 'stumbling' ? 2.5 : 0);
    const d = dir.clone();
    const tb = this.apply(b, sevB, d, { kind: 'char', id: a.id });
    const ta = this.apply(a, sevA, d.clone().negate(), { kind: 'char', id: b.id });
    const worst = TIER_ORDER.indexOf(tb) >= TIER_ORDER.indexOf(ta) ? tb : ta;
    this.env.events.emit({
      type: 'ContactObserved', actor: a.id, target: b.id, pos: b.pos.clone(), visible: true,
      loud: worst === 'knockdown' ? 9 : worst === 'stumble' ? 6 : 2,
      data: { tier: worst, severity: Math.max(sevA, sevB) },
    });
  }

  charProp(c: Character, owner: { id: string; tripFactor?: number; kind: string }, approach: number, moveDir: THREE.Vector3): void {
    if (approach < 0.7 || !c.upright) return;
    if (!this.gate(`${c.id}|${owner.id}`, 1.2)) return;
    const sev = approach * (owner.tripFactor ?? 0.6) * this.vulnerability(c, true) + (c.motion === 'stumbling' ? 2.5 : 0);
    const tier = this.apply(c, sev, moveDir.clone(), { kind: owner.kind === 'item' ? 'item' : 'prop', id: owner.id });
    if (tier !== 'none') {
      this.env.events.emit({
        type: 'ContactObserved', actor: c.id, target: owner.id, pos: c.pos.clone(), visible: true,
        loud: tier === 'knockdown' ? 9 : tier === 'stumble' ? 7 : 4,
        data: { tier, severity: sev, prop: true },
      });
    }
  }

  /** External push (doors, scripted test rams). */
  push(c: Character, sev: number, dir: THREE.Vector3, cause: Cause): Tier {
    return this.apply(c, sev, dir.clone(), cause);
  }

  private apply(c: Character, sev: number, dir: THREE.Vector3, cause: Cause): Tier {
    if (!c.upright) return 'none';
    let tier = tierOf(sev);
    if (tier === 'none') return tier;
    if (tier === 'stumble' && c.motion === 'stumbling') tier = 'knockdown';
    if (c.isPlayer && (tier === 'knockdown' || tier === 'stumble')) tier = sev > 9 ? 'stumble' : 'bump';
    if (c.seated || c.hidden) tier = 'brush';
    c.lastCause = cause;
    c.lastTier = tier;
    const env = this.env;
    const src = cause.kind === 'char' ? env.chars.get(cause.id) : null;
    let dropped: string[] = [];
    switch (tier) {
      case 'brush':
        c.stats.brushes++;
        c.flinch(dir, 0.5);
        if (src) c.lookAt(src.eye(), 1.4);
        break;
      case 'bump':
        c.stats.bumps++;
        // a knock while already staggering must not cancel the stumble (and its recovery beat)
        if (c.motion === 'stumbling') c.flinch(dir, 1);
        else c.startReactive(dir, 1.7);
        if (src) c.lookAt(src.eye(), 2);
        if (c.stack.length >= 3) {
          const top = c.stack[c.stack.length - 1];
          env.items.drop(top, env.chars, dir.clone().multiplyScalar(1.5).setY(0.8));
          dropped = [top];
        }
        break;
      case 'stumble':
        c.stats.stumbles++;
        c.startStumble(dir, sev);
        dropped = env.items.dropAllFrom(c, env.chars, dir.clone().multiplyScalar(2), Math.random() < c.dropChance);
        break;
      case 'knockdown':
        dropped = env.items.dropAllFrom(c, env.chars, dir.clone().multiplyScalar(2.2), true);
        c.knockDown(dir, sev);
        break;
    }
    env.events.emit({
      type: 'Reaction', actor: c.id, target: cause.id, pos: c.pos.clone(), visible: true,
      data: { tier, causeKind: cause.kind, causeId: cause.id, dropped },
    });
    for (const id of dropped) {
      env.events.emit({ type: 'ItemDropped', actor: c.id, target: id, pos: c.pos.clone(), visible: true, loud: 5, data: { tier } });
    }
    return tier;
  }
}
