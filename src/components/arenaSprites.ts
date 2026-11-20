import type { Direction, Position, Snake } from '../types/game';
import { getPlayerColorPalette } from '../game/playerColors';

const SIZE = 16;
const outline = '#121521';
const cream = '#fff0bd';
const gold = '#ebbd55';
const directions: Record<Direction, readonly [number, number]> = {
  UP: [0, -1], RIGHT: [1, 0], DOWN: [0, 1], LEFT: [-1, 0],
};
const cardinalOffsets = Object.values(directions);

const skins = {
  jimmy: { base: '#75a944', shade: '#416d36', highlight: '#a0cb61', accent: cream },
  jessika: { base: '#216a70', shade: '#164451', highlight: '#338d8b', accent: gold },
  annie: { base: '#aa4935', shade: '#743024', highlight: '#d46c4c', accent: cream },
  avalena: { base: '#674187', shade: '#3b285d', highlight: '#9772bf', accent: '#75fffa' },
};
type Skin = keyof typeof skins;
const byColor: Record<string, Skin> = {
  '#0F380F': 'jimmy', '#306230': 'jessika', '#8B1E0F': 'annie', '#5B2C83': 'avalena',
};

const cache = new Map<string, HTMLCanvasElement>();

function sprite(key: string, paint: (ctx: CanvasRenderingContext2D) => void) {
  const existing = cache.get(key);
  if (existing) return existing;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  paint(ctx);
  cache.set(key, canvas);
  return canvas;
}

function run(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, height);
}

function headSprite(skin: Skin, direction: Direction, dart = false) {
  return sprite(`${skin}/head/${direction}/${dart}`, ctx => {
    const side = direction === 'RIGHT' || direction === 'LEFT';
    const back = direction === 'UP';
    const colors = dart ? { base: '#2398ac', shade: '#16607f', highlight: '#85ffff', accent: '#ceffff' } : skins[skin];
    if (direction === 'LEFT') {
      ctx.translate(SIZE, 0);
      ctx.scale(-1, 1);
    }

    // Row silhouettes give the sprites stepped outlines at their native resolution.
    const spans = side
      ? [[4, 10], [2, 11], [1, 12], [1, 13], [0, 14], [0, 15], [0, 15], [0, 15], [1, 14], [2, 13], [4, 11]]
      : [[5, 10], [3, 12], [2, 13], [1, 14], [1, 14], [1, 14], [1, 14], [2, 13], [3, 12], [4, 11], [6, 9]];
    spans.forEach(([left, right], row) => {
      const y = row + 3;
      run(ctx, outline, left, y, right - left + 1);
      if (row > 0 && row < spans.length - 1) {
        const color = row === 1 ? colors.highlight : row >= 8 ? colors.shade : colors.base;
        run(ctx, color, left + 1, y, right - left - 1);
      }
    });

    if (skin !== 'avalena' && !back) {
      run(ctx, cream, side ? 6 : 4, 12, side ? 7 : 8);
      run(ctx, colors.shade, side ? 12 : 6, 10, side ? 1 : 4);
    }

    if (skin === 'jimmy') {
      run(ctx, outline, 1, 1, 3, 2);
      run(ctx, '#b63643', 1, 2, 3);
      run(ctx, outline, 2, 4, side ? 9 : 12, 3);
      run(ctx, '#d3474e', 3, 5, side ? 7 : 10);
      run(ctx, '#e96a5f', 5, 4, 4);
      run(ctx, colors.shade, 3, 9, 1);
    } else if (skin === 'jessika') {
      run(ctx, gold, 3, 10, 1, 4);
      run(ctx, gold, 4, 13, 2);
      run(ctx, gold, 5, 11, 1, 2);
      run(ctx, colors.highlight, 5, 5, side ? 6 : 5);
    } else if (skin === 'annie') {
      run(ctx, colors.shade, side ? 8 : 6, 5, 4);
      run(ctx, cream, side ? 11 : 5, 11, 1);
      run(ctx, cream, side ? 13 : 10, 11, 1);
    } else {
      for (const x of [2, 11]) {
        run(ctx, outline, x, 0, 3, 5);
        run(ctx, colors.highlight, x + 1, 1, 1, 3);
      }
      run(ctx, colors.accent, 7, 1, 2, 4);
      run(ctx, colors.highlight, 6, 5, 4);
      run(ctx, colors.shade, 6, 11, 4);
    }

    if (back) {
      run(ctx, colors.shade, 4, 8, 2);
      run(ctx, colors.shade, 10, 8, 2);
      run(ctx, colors.highlight, 7, 9, 2);
      return;
    }

    const eyes = side ? [9] : [4, 9];
    for (const x of eyes) {
      run(ctx, outline, x - 1, 6, 5, 4);
      run(ctx, skin === 'avalena' ? colors.accent : cream, x, 7, 3, 2);
      if (skin !== 'avalena') run(ctx, outline, side ? x + 2 : x + 1, 7, 1, 2);
      if (skin === 'annie') run(ctx, colors.shade, x + (x === 4 ? 0 : 2), 7, 1);
    }
  });
}

function bodySprite(skin: Skin, mask: number, tail: boolean) {
  return sprite(`${skin}/body/${mask}/${tail}`, ctx => {
    const colors = skins[skin];
    const neighbors = cardinalOffsets.filter((_, i) => mask & (1 << i));
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cx = x - 7.5;
        const cy = y - 7.5;
        let along = 0;
        let across = cy;
        let distance = Math.hypot(cx, cy);
        for (const [dx, dy] of neighbors) {
          const t = cx * dx + cy * dy;
          if (t < 0) continue;
          const cross = dx === 0 ? -cx : cy;
          const d = Math.abs(cross);
          if (d <= distance) {
            distance = d;
            across = cross;
            along = t;
          }
        }
        const tailProgress = tail && neighbors.length === 1
          ? cx * neighbors[0][0] + cy * neighbors[0][1]
          : 8;
        const width = Math.min(5.5, Math.max(1, 2.8 + tailProgress * 0.47));
        if (distance > width) continue;
        let color = colors.base;
        if (distance > width - 0.9) color = outline;
        else if (skin === 'jessika' && (distance < 1 || tailProgress < -1.5)) color = gold;
        else if (skin === 'annie' && tailProgress < -1.5) color = Math.floor(tailProgress / 2) % 2 ? '#c79350' : cream;
        else if (skin === 'annie' && Math.abs(across - ((x + y) % 4 - 1.5)) < 1.1) color = cream;
        else if (skin === 'jimmy' && across > width - 2.2) color = cream;
        else if (across > 2 || (skin === 'avalena' && along > 4)) color = colors.shade;
        else if (skin === 'jimmy' && (x * 7 + y * 3) % 13 === 0) color = colors.shade;
        else if (across < -2) color = colors.highlight;
        run(ctx, color, x, y, 1);
      }
    }
  });
}

function snakeSkin(snake: Snake) {
  return byColor[getPlayerColorPalette(snake).hex] ?? 'jimmy';
}

export function snakeHeadSprite(snake: Snake, dart = false) {
  const skin = snakeSkin(snake);
  return headSprite(skin, snake.direction, dart && skin === 'avalena');
}

export function snakeSprites(snake: Snake, lunge: boolean) {
  const skin = snakeSkin(snake);
  const sprites = snake.body.map((cell, index) => {
    const adjacent = [snake.body[index - 1], snake.body[index + 1]];
    const mask = cardinalOffsets.reduce((bits, [dx, dy], i) => bits | (
      adjacent.some(next => next?.x === cell.x + dx && next?.y === cell.y + dy) ? 1 << i : 0
    ), 0);
    return { ...cell, art: bodySprite(skin, mask, index === snake.body.length - 1) };
  });
  const head = snake.body[0];
  if (head) {
    const [dx, dy] = directions[snake.direction];
    const distance = lunge ? 0.42 : 0;
    sprites.push({ x: head.x + dx * distance, y: head.y + dy * distance, art: snakeHeadSprite(snake) });
  }
  return sprites;
}

export function tokenSprite() {
  return sprite('gold-diamond', ctx => {
    for (let y = 1; y <= 14; y++) {
      const radius = 7 - Math.abs(7.5 - y);
      const x = Math.ceil(7.5 - radius);
      const width = SIZE - 2 * x;
      run(ctx, outline, x - 1, y, width + 2);
      run(ctx, y < 8 ? '#fff192' : '#d38a23', x, y, width);
      if (width > 2 && y > 2 && y < 13) {
        run(ctx, y < 8 ? '#ffe144' : '#f5b823', x + 1, y, width - 2);
        if (y < 8) run(ctx, '#fff9c0', x, y, 1);
      }
    }
  });
}

export function paintArenaSprite(ctx: CanvasRenderingContext2D, art: HTMLCanvasElement, cell: Position, cellSize: number) {
  ctx.drawImage(art, cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);
}
