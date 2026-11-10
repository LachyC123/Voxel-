import * as THREE from 'three';

// Accumulates coloured boxes into a single vertex-coloured mesh. Static voxel
// surfaces are merged so a building is a handful of draw calls rather than
// thousands of scene objects.
const FACE_SHADE = [0.86, 0.86, 1.0, 0.62, 0.93, 0.78]; // +x -x +y -y +z -z

let sharedMaterial: THREE.MeshLambertMaterial | null = null;
export function voxelMaterial(): THREE.MeshLambertMaterial {
  if (!sharedMaterial) sharedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  return sharedMaterial;
}

const tmpColor = new THREE.Color();

export class VoxelBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];
  private seed = 1;

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Box by centre and full size. `jitter` randomises brightness per box. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, jitter = 0): this {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    tmpColor.setHex(color);
    const j = jitter ? 1 + (this.rand() - 0.5) * 2 * jitter : 1;
    const r = tmpColor.r * j, g = tmpColor.g * j, b = tmpColor.b * j;
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
      [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
    ];
    for (let f = 0; f < 6; f++) {
      const [n, vs] = faces[f];
      const base = this.pos.length / 3;
      const s = FACE_SHADE[f];
      for (const v of vs) {
        this.pos.push(cx + v[0], cy + v[1], cz + v[2]);
        this.nor.push(n[0], n[1], n[2]);
        this.col.push(r * s, g * s, b * s);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** Box by min corner and max corner. */
  span(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, jitter = 0): this {
    return this.box((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, Math.abs(x2 - x1), Math.abs(y2 - y1), Math.abs(z2 - z1), color, jitter);
  }

  get empty(): boolean {
    return this.idx.length === 0;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }

  mesh(opts: { shadows?: boolean; receive?: boolean } = {}): THREE.Mesh {
    const m = new THREE.Mesh(this.geometry(), voxelMaterial());
    m.castShadow = opts.shadows ?? true;
    m.receiveShadow = opts.receive ?? true;
    return m;
  }
}

/** Dispose every geometry/texture below a root (materials are shared and cheap). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat && mat !== sharedMaterial) {
      (Array.isArray(mat) ? mat : [mat]).forEach((x) => {
        const tex = (x as THREE.MeshBasicMaterial).map;
        if (tex) tex.dispose();
        x.dispose();
      });
    }
  });
}

/** Small canvas-texture sign (shop fascia, street names). */
export function makeSign(text: string, w: number, h: number, bg: string, fg: string, font = 'bold 44px Georgia, serif'): THREE.Mesh {
  const c = document.createElement('canvas');
  const scale = 128;
  c.width = Math.max(64, Math.round(w * scale));
  c.height = Math.max(32, Math.round(h * scale));
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg;
  g.lineWidth = 4;
  g.strokeRect(5, 5, c.width - 10, c.height - 10);
  g.fillStyle = fg;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 44;
  while (g.measureText(text).width > c.width - 28 && size > 12) {
    size -= 2;
    g.font = font.replace(/\d+px/, `${size}px`);
  }
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return mesh;
}
