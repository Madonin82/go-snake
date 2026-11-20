import type { Direction, Position, Snake } from '../types/game';

const headings: Record<Direction, number> = {
  RIGHT: 0, UP: Math.PI / 2, LEFT: Math.PI, DOWN: -Math.PI / 2,
};

interface Pose {
  body: Position[];
  heading: number;
}

interface Motion {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
}

export interface ArenaSnake {
  snake: Snake;
  inactive: boolean;
  lunge: boolean;
}

function sample(motion: Motion, now: number) {
  if (!motion.duration || now >= motion.start + motion.duration) return motion.to;
  const t = Math.max(0, (now - motion.start) / motion.duration);
  const turn = motion.to.heading - motion.from.heading;
  return {
    heading: motion.from.heading + Math.atan2(Math.sin(turn), Math.cos(turn)) * t,
    body: motion.to.body.map((cell, index) => {
      // A newly grown segment begins at the old tail.
      const from = motion.from.body[index] ?? motion.from.body.at(-1) ?? cell;
      return { x: from.x + (cell.x - from.x) * t, y: from.y + (cell.y - from.y) * t };
    }),
  };
}

export class SnakeMotion {
  private readonly paths = new Map<string, Motion>();
  private tick: number | null = null;

  update(tick: number, snakes: ArenaSnake[], now: number, duration: number) {
    const advances = this.tick !== null && tick === this.tick + 1;
    if (this.tick !== tick && !advances) this.paths.clear();
    this.tick = tick;
    const ids = new Set(snakes.map(({ snake }) => snake.id));
    for (const id of this.paths.keys()) {
      if (!ids.has(id)) this.paths.delete(id);
    }
    for (const { snake, inactive, lunge } of snakes) {
      const old = this.paths.get(snake.id);
      const heading = headings[snake.direction];
      let body = snake.body;
      if (lunge && body[0]) {
        const [head, ...tail] = body;
        body = [{ x: head.x + Math.cos(heading) * 0.42, y: head.y - Math.sin(heading) * 0.42 }, ...tail];
      }
      const to = { body, heading };
      const sameTarget = old?.to.heading === heading && old.to.body.length === body.length &&
        body.every((cell, i) => cell.x === old.to.body[i].x && cell.y === old.to.body[i].y);
      if (sameTarget && duration && !inactive && !lunge) continue;
      const animate = advances && old && duration && !inactive && !lunge && !sameTarget && body.length > 0;
      this.paths.set(snake.id, {
        from: animate ? sample(old, now) : to,
        to,
        start: now,
        duration: animate ? duration : 0,
      });
    }
  }

  pose(id: string, now: number) {
    const motion = this.paths.get(id);
    return motion ? sample(motion, now) : null;
  }

  active(now: number) {
    return [...this.paths.values()].some(motion => now < motion.start + motion.duration);
  }
}
