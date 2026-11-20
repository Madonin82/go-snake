import assert from 'node:assert/strict';
import test from 'node:test';
import type { Direction, Position, Snake } from '../types/game';
import { SnakeMotion } from './snakeMotion';

function frame(body: Position[], direction: Direction = 'RIGHT') {
  const snake: Snake = {
    id: 'p1', name: 'P1', body, direction, queuedDirection: null, score: 0,
    skillPoints: 0, isAlive: true, color: '#0F380F', equippedSkill: null,
  };
  return [{ snake, inactive: false, lunge: false }];
}

test('interpolates the whole body and starts new growth at the old tail', () => {
  const motion = new SnakeMotion();
  motion.update(0, frame([{ x: 2, y: 2 }, { x: 1, y: 2 }]), 0, 100);
  motion.update(1, frame([{ x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }], 'UP'), 100, 100);
  assert.deepEqual(motion.pose('p1', 150), {
    heading: Math.PI / 4,
    body: [{ x: 2, y: 1.5 }, { x: 1.5, y: 2 }, { x: 1, y: 2 }],
  });
  assert.equal(motion.active(199), true);
  assert.equal(motion.active(200), false);
});

test('continues from the displayed position when a tick arrives early', () => {
  const motion = new SnakeMotion();
  motion.update(0, frame([{ x: 1, y: 1 }]), 0, 100);
  motion.update(1, frame([{ x: 2, y: 1 }]), 100, 100);
  motion.update(2, frame([{ x: 3, y: 1 }]), 150, 100);
  assert.deepEqual(motion.pose('p1', 150)?.body, [{ x: 1.5, y: 1 }]);
  assert.deepEqual(motion.pose('p1', 250)?.body, [{ x: 3, y: 1 }]);
});

test('snaps on replay seeks and when motion is disabled', () => {
  const motion = new SnakeMotion();
  motion.update(8, frame([{ x: 4, y: 1 }]), 0, 100);
  motion.update(2, frame([{ x: 1, y: 1 }]), 100, 100);
  assert.deepEqual(motion.pose('p1', 100)?.body, [{ x: 1, y: 1 }]);
  motion.update(3, frame([{ x: 2, y: 1 }]), 200, 0);
  assert.deepEqual(motion.pose('p1', 200)?.body, [{ x: 2, y: 1 }]);
});
