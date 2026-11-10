import * as THREE from 'three';
import { Character } from '../characters/character';
import { G, Physics } from '../physics/physics';

// Third-person camera. Swept against walls and moved inwards smoothly; never
// sees through ceilings because interiors have real ceiling colliders.
export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.08, 220);
  yaw = 0;
  pitch = 0.28;
  distance = 3.3;
  private curDist = 3.3;
  private pivot = new THREE.Vector3();
  private kick = 0;
  private started = false;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  look(dx: number, dy: number, sens: number): void {
    this.yaw -= dx * 0.0024 * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.002 * sens, -0.45, 1.25);
  }

  impact(strength: number): void {
    this.kick = Math.min(0.12, this.kick + strength);
  }

  snapBehind(c: Character): void {
    this.yaw = c.yaw + Math.PI;
    this.started = false;
  }

  update(dt: number, target: Character, phys: Physics, reducedMotion: boolean): void {
    const root = target.rig.root.position;
    const want = this.a.set(root.x, root.y + 1.52, root.z);
    if (!this.started) {
      this.pivot.copy(want);
      this.started = true;
    } else this.pivot.lerp(want, 1 - Math.exp(-dt * 18));
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = this.b.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    // shoulder offset only when there is room for it
    const r = this.right(new THREE.Vector3());
    const shoulder = Math.min(0.38, this.curDist * 0.14);
    const from = this.pivot.clone().addScaledVector(r, shoulder);
    const mask = G.STATIC | G.GLASS | G.DOOR | G.VEHICLE;
    const sideHit = phys.raycast(this.pivot, from, mask);
    if (sideHit) from.copy(this.pivot);
    const to = from.clone().addScaledVector(dir, this.distance);
    const hit = phys.raycast(from, to, mask);
    const allowed = hit ? Math.max(0.35, hit.dist - 0.22) : this.distance;
    if (allowed < this.curDist) this.curDist = allowed;
    else this.curDist += (allowed - this.curDist) * (1 - Math.exp(-dt * 5));
    this.camera.position.copy(from).addScaledVector(dir, this.curDist);
    if (!reducedMotion && this.kick > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.kick;
      this.camera.position.y += (Math.random() - 0.5) * this.kick;
    }
    this.kick *= Math.exp(-dt * 10);
    this.camera.lookAt(from.x - dir.x * 2, from.y - dir.y * 2 + 0.05, from.z - dir.z * 2);
    // in very tight framing, hide the player so they never fill the screen
    target.rig.root.visible = !target.hidden && this.curDist > 0.75;
  }
}
