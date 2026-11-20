import {
  BoxGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  OrthographicCamera, PointLight, Scene, SphereGeometry, TorusGeometry, WebGLRenderer,
} from 'three';
import type { Direction, GameState, Position, Snake } from '../types/game';
import { getPlayerColorPalette } from '../game/playerColors';

const facing: Record<Direction, readonly [number, number]> = {
  UP: [0, 1], DOWN: [0, -1], LEFT: [-1, 0], RIGHT: [1, 0],
};

export interface ArenaSnake {
  snake: Snake;
  inactive: boolean;
  lunge: boolean;
}

export class ThreeArena {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly pieces = new Group();
  private readonly box = new BoxGeometry();
  private readonly sphere = new SphereGeometry(1, 16, 12);
  private readonly connector = new CylinderGeometry(1, 1, 1, 16);
  private readonly ring = new TorusGeometry(0.33, 0.016, 8, 32);
  private readonly gem = new IcosahedronGeometry(0.31);
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private tiles: InstancedMesh | null = null;
  private gridSize = 0;

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor('#07121f');
    this.camera.position.z = 16;
    this.camera.far = 40;
    this.scene.add(this.pieces, new HemisphereLight('#d6faff', '#645577', 1.8));

    const key = new DirectionalLight('#eaf9ff', 2.5);
    key.position.set(-4, 6, 8);
    const fill = new DirectionalLight('#8bb0ff', 0.9);
    fill.position.set(4, -6, 4);
    const arenaLight = new PointLight('#70e1dc', 26, 18);
    arenaLight.position.set(-3, 3, 4);
    this.scene.add(key, fill, arenaLight);
  }

  draw(state: GameState, gridSize: number, resolution: number, snakes: ArenaSnake[]) {
    if (this.renderer.getContext().isContextLost()) return null;
    if (this.gridSize !== gridSize) this.layout(gridSize, resolution);
    this.pieces.clear();

    const walls = new Map<string, Position & { ownerId?: string }>();
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const inset = state.ringInset;
        if (x < inset || y < inset || x >= gridSize - inset || y >= gridSize - inset) {
          walls.set(`${x},${y}`, { x, y });
        }
      }
    }
    for (const wall of [...(state.walls ?? []), ...(state.rattleWalls ?? [])]) {
      walls.set(`${wall.x},${wall.y}`, wall);
    }
    for (const wall of walls.values()) {
      const [x, y] = this.center(wall);
      const owner = state.snakes.find(snake => snake.id === wall.ownerId);
      this.add(this.box, '#30465d', x, y, 0.14, 0.94, 0.94, 0.28);
      this.add(this.box, '#4b687e', x, y, 0.3, 0.81, 0.81, 0.08);
      this.add(this.box, owner ? getPlayerColorPalette(owner).light : '#7897aa', x, y + 0.23, 0.35, 0.48, 0.07, 0.025);
    }

    for (const token of state.tokens) {
      const [x, y] = this.center(token);
      this.add(this.ring, '#d98a3d', x, y, 0.04, 1, 1, 1, '#603709');
      const crystal = this.add(this.gem, '#ffab48', x, y, 0.39, 1, 1, 1.25, '#7d3e06');
      crystal.rotation.set(0.6, 0.32, Math.PI / 8);
    }

    for (const snake of snakes) this.drawSnake(snake);
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  dispose() {
    this.tiles?.dispose();
    for (const geometry of [this.box, this.sphere, this.connector, this.gem, this.ring]) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private layout(gridSize: number, resolution: number) {
    this.gridSize = gridSize;
    const half = gridSize / 2;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(resolution, resolution, false);

    if (this.tiles) {
      this.scene.remove(this.tiles);
      this.tiles.dispose();
    }
    this.tiles = new InstancedMesh(this.box, this.material('#ffffff'), gridSize ** 2);
    const matrix = new Matrix4();
    const color = new Color();
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const [cx, cy] = this.center({ x, y });
        matrix.makeScale(0.976, 0.976, 0.12).setPosition(cx, cy, -0.06);
        this.tiles.setMatrixAt(y * gridSize + x, matrix);
        const light = 1.2 - Math.hypot(cx, cy) / gridSize * 0.8;
        color.set((x + y) % 2 ? '#22394a' : '#2b4757').multiplyScalar(light);
        this.tiles.setColorAt(y * gridSize + x, color);
      }
    }
    this.scene.add(this.tiles);
  }

  private drawSnake({ snake, inactive, lunge }: ArenaSnake) {
    const head = snake.body[0];
    if (!head) return;
    const palette = getPlayerColorPalette(snake);
    const body = inactive ? '#34465a' : palette.body;
    const accent = inactive ? '#7890a4' : palette.light;

    for (let i = snake.body.length - 1; i >= 1; i--) {
      const cell = snake.body[i];
      const next = snake.body[i - 1];
      const [x, y] = this.center(cell);
      const [nx, ny] = this.center(next);
      const radius = i === snake.body.length - 1 ? 0.24 : 0.31;
      this.add(this.sphere, '#172837', x + 0.035, y - 0.06, 0.025, radius + 0.025, radius + 0.035, 0.025);
      this.add(this.sphere, body, x, y, 0.28, radius, radius, 0.22);
      if (Math.abs(cell.x - next.x) + Math.abs(cell.y - next.y) === 1) {
        const bridge = this.add(this.connector, body, (x + nx) / 2, (y + ny) / 2, 0.28, radius, 1, 0.22);
        bridge.rotation.z = Math.atan2(ny - y, nx - x) - Math.PI / 2;
      }
      this.add(this.sphere, accent, x, y, 0.49, 0.08, 0.045, 0.025);
    }

    const [hx, hy] = this.center(head);
    const [dx, dy] = facing[snake.direction];
    const x = hx + (lunge ? dx * 0.42 : 0);
    const y = hy + (lunge ? dy * 0.42 : 0);
    if (lunge) this.add(this.sphere, body, hx, hy, 0.27, 0.29, 0.29, 0.22);
    const skull = this.add(this.sphere, body, x, y, 0.33, 0.43, 0.36, 0.32);
    skull.rotation.z = Math.atan2(dy, dx);
    for (const side of [-1, 1]) {
      const ex = x + dx * 0.17 - dy * side * 0.17;
      const ey = y + dy * 0.17 + dx * side * 0.17;
      this.add(this.sphere, '#edfaff', ex, ey, 0.59, 0.099, 0.099, 0.065);
      this.add(this.sphere, '#071826', ex + dx * 0.032, ey + dy * 0.032, 0.644, 0.045, 0.045, 0.026);
    }
    this.add(this.sphere, accent, x - dx * 0.12, y - dy * 0.12, 0.64, 0.067, 0.067, 0.027);
  }

  private center({ x, y }: Position) {
    const origin = (this.gridSize - 1) / 2;
    return [x - origin, origin - y] as const;
  }

  private material(color: string, emissive = '#000000') {
    const key = `${color}/${emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new MeshStandardMaterial({ color, emissive, roughness: 0.52 });
      this.materials.set(key, material);
    }
    return material;
  }

  private add(
    geometry: BoxGeometry | CylinderGeometry | IcosahedronGeometry | SphereGeometry | TorusGeometry,
    color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number,
    emissive?: string,
  ) {
    const mesh = new Mesh(geometry, this.material(color, emissive));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    this.pieces.add(mesh);
    return mesh;
  }
}
