import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, Object3D, MeshBasicMaterial, MeshStandardMaterial, NearestFilter,
  OrthographicCamera, PlaneGeometry, PointLight, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry,
  WebGLRenderer,
} from 'three';
import type { GameState, Position } from '../types/game';
import { getPlayerColorPalette } from '../game/playerColors';
import { tokenSprite } from './arenaSprites';
import { SnakeMotion, type ArenaSnake } from './snakeMotion';

export class ThreeArena {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera();
  private readonly pieces = new Group();
  private readonly snakes = new Group();
  private motion = new SnakeMotion();
  private readonly segment = new SphereGeometry(1, 8, 5);
  private readonly link = new CylinderGeometry(1, 1, 1, 6);
  private readonly snakeMeshes = new Map<string, { mesh: InstancedMesh; capacity: number }>();
  private readonly transform = new Object3D();
  private readonly box = new BoxGeometry();
  private readonly spritePlane = new PlaneGeometry();
  private readonly ring = new TorusGeometry(0.33, 0.016, 8, 32);
  private tokenMaterial: MeshBasicMaterial | null = null;
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private tiles: InstancedMesh | null = null;
  private gridSize = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setClearColor('#07121f');
    this.camera.position.z = 16;
    this.camera.far = 40;
    this.scene.add(this.pieces, this.snakes, new HemisphereLight('#d6faff', '#645577', 1.8));

    const key = new DirectionalLight('#eaf9ff', 2.5);
    key.position.set(-4, 6, 8);
    const fill = new DirectionalLight('#8bb0ff', 0.9);
    fill.position.set(4, -6, 4);
    const arenaLight = new PointLight('#70e1dc', 26, 18);
    arenaLight.position.set(-3, 3, 4);
    this.scene.add(key, fill, arenaLight);
  }

  prepare(state: GameState, gridSize: number, resolution: number, snakes: ArenaSnake[], now: number, duration: number) {
    if (this.renderer.getContext().isContextLost()) return false;
    if (this.gridSize !== gridSize) this.layout(gridSize, resolution);
    this.motion.update(state.tick, snakes, now, duration);
    this.prepareBoard(state, gridSize);
    return true;
  }

  private prepareBoard(state: GameState, gridSize: number) {
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
      this.addToken(token);
    }

  }

  draw(snakes: ArenaSnake[], now: number) {
    if (this.renderer.getContext().isContextLost()) return false;
    for (const { mesh } of this.snakeMeshes.values()) mesh.count = 0;
    for (const { snake, inactive } of snakes) {
      const pose = this.motion.pose(snake.id, now);
      if (!pose?.body.length) continue;
      const palette = getPlayerColorPalette(snake);
      const body = inactive ? '#435366' : palette.body;
      const accent = inactive ? '#718095' : palette.light;
      const boss = palette.hex === '#5B2C83';

      for (let i = pose.body.length - 1; i >= 1; i--) {
        const [x, y] = this.center(pose.body[i]);
        const [nx, ny] = this.center(pose.body[i - 1]);
        const length = Math.hypot(nx - x, ny - y);
        const tail = Math.max(0, 1 - (pose.body.length - 1 - i) / 3);
        const radius = 0.33 - 0.14 * tail;
        if (length > 0.02 && length < 1.8) {
          this.snakeMesh(this.link, body, (x + nx) / 2, (y + ny) / 2, 0.23,
            radius, length, 0.2, Math.atan2(ny - y, nx - x) - Math.PI / 2);
        }
        this.snakeMesh(this.segment, body, x, y, 0.23, radius, radius, 0.22);
        const marking = palette.hex === '#306230' && !inactive ? '#ebbd55' : accent;
        this.snakeMesh(this.segment, marking, x, y, 0.435, 0.105, 0.065, 0.025);
      }

      const [x, y] = this.center(pose.body[0]);
      const angle = pose.heading;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      this.snakeMesh(this.segment, body, x, y, 0.29, 0.46, 0.37, 0.29, angle);
      const crest = palette.hex === '#0F380F' && !inactive ? '#ca3949' : accent;
      this.snakeMesh(this.segment, crest, x - dx * 0.13, y - dy * 0.13, 0.52, 0.1, 0.26, 0.075, angle);
      for (const side of [-1, 1]) {
        const ex = x + dx * 0.19 - dy * side * 0.18;
        const ey = y + dy * 0.19 + dx * side * 0.18;
        this.snakeMesh(this.segment, boss ? accent : '#fff0bd', ex, ey, 0.51, 0.104, 0.078, 0.065, angle);
        this.snakeMesh(this.segment, '#121521', ex + dx * 0.037, ey + dy * 0.037, 0.57, 0.042, 0.041, 0.024);
        if (boss) {
          this.snakeMesh(this.segment, accent, x - dx * 0.23 - dy * side * 0.23,
            y - dy * 0.23 + dx * side * 0.23, 0.44, 0.13, 0.09, 0.14, angle);
        }
      }
    }
    for (const { mesh } of this.snakeMeshes.values()) {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
    return this.motion.active(now);
  }

  private snakeMesh(
    geometry: SphereGeometry | CylinderGeometry, color: string,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0,
  ) {
    const key = `${geometry.id}/${color}`;
    let batch = this.snakeMeshes.get(key);
    if (!batch || batch.mesh.count === batch.capacity) {
      const capacity = batch ? batch.capacity * 2 : 16;
      const mesh = new InstancedMesh(geometry, this.material(color), capacity);
      mesh.count = batch?.mesh.count ?? 0;
      mesh.frustumCulled = false;
      if (batch) {
        mesh.instanceMatrix.array.set(batch.mesh.instanceMatrix.array);
        this.snakes.remove(batch.mesh);
        batch.mesh.dispose();
      }
      batch = { mesh, capacity };
      this.snakeMeshes.set(key, batch);
      this.snakes.add(mesh);
    }
    this.transform.position.set(x, y, z);
    this.transform.scale.set(sx, sy, sz);
    this.transform.rotation.z = angle;
    this.transform.updateMatrix();
    batch.mesh.setMatrixAt(batch.mesh.count++, this.transform.matrix);
  }

  dispose() {
    this.tiles?.dispose();
    for (const { mesh } of this.snakeMeshes.values()) mesh.dispose();
    for (const geometry of [this.box, this.spritePlane, this.ring, this.segment, this.link]) geometry.dispose();
    this.tokenMaterial?.map?.dispose();
    this.tokenMaterial?.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private layout(gridSize: number, resolution: number) {
    this.gridSize = gridSize;
    this.motion = new SnakeMotion();
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

  private addToken(cell: Position) {
    if (!this.tokenMaterial) {
      const map = new CanvasTexture(tokenSprite());
      map.colorSpace = SRGBColorSpace;
      map.magFilter = map.minFilter = NearestFilter;
      map.generateMipmaps = false;
      this.tokenMaterial = new MeshBasicMaterial({ map, alphaTest: 0.5, toneMapped: false });
    }
    const [x, y] = this.center(cell);
    const mesh = new Mesh(this.spritePlane, this.tokenMaterial);
    mesh.position.set(x, y, 0.4);
    this.pieces.add(mesh);
  }

  private center({ x, y }: Position) {
    const origin = (this.gridSize - 1) / 2;
    return [x - origin, origin - y] as const;
  }

  private material(color: string, emissive = '#000000') {
    const key = `${color}/${emissive}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new MeshStandardMaterial({ color, emissive, roughness: 0.66, flatShading: true });
      this.materials.set(key, material);
    }
    return material;
  }

  private add(
    geometry: BoxGeometry | TorusGeometry,
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
