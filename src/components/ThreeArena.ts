import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter,
  OrthographicCamera, PlaneGeometry, PointLight, Scene, SRGBColorSpace, TorusGeometry,
  WebGLRenderer,
} from 'three';
import type { GameState, Position, Snake } from '../types/game';
import { getPlayerColorPalette } from '../game/playerColors';
import { snakeSprites, tokenSprite } from './arenaSprites';

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
  private readonly spritePlane = new PlaneGeometry();
  private readonly ring = new TorusGeometry(0.33, 0.016, 8, 32);
  private readonly spriteMaterials = new Map<HTMLCanvasElement, [MeshBasicMaterial, MeshBasicMaterial]>();
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
      this.addSprite(tokenSprite(), token, 0.4);
    }

    for (const { snake, inactive, lunge } of snakes) {
      const sprites = snakeSprites(snake, lunge);
      sprites.forEach((item, index) => {
        const isHead = index === sprites.length - 1;
        this.addSprite(item.art, item, isHead ? 0.6 : 0.5, inactive);
      });
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  dispose() {
    this.tiles?.dispose();
    for (const geometry of [this.box, this.spritePlane, this.ring]) geometry.dispose();
    for (const [normal, inactive] of this.spriteMaterials.values()) {
      normal.map?.dispose();
      normal.dispose();
      inactive.dispose();
    }
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

  private addSprite(art: HTMLCanvasElement, cell: Position, height: number, inactive = false) {
    let materials = this.spriteMaterials.get(art);
    if (!materials) {
      const map = new CanvasTexture(art);
      map.colorSpace = SRGBColorSpace;
      map.magFilter = map.minFilter = NearestFilter;
      map.generateMipmaps = false;
      const options = { map, alphaTest: 0.5, toneMapped: false };
      materials = [new MeshBasicMaterial(options), new MeshBasicMaterial({ ...options, color: '#66758a' })];
      this.spriteMaterials.set(art, materials);
    }
    const [x, y] = this.center(cell);
    const mesh = new Mesh(this.spritePlane, materials[inactive ? 1 : 0]);
    mesh.position.set(x, y, height);
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
      material = new MeshStandardMaterial({ color, emissive, roughness: 0.52 });
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
