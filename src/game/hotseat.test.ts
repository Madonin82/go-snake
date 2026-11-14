import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ensureNonEmptyHotseatTimeoutBuffer,
  resolveHotseatAfterRound,
  resolveHotseatPostLock,
} from './hotseat';
import { BufferEntry } from '../types/game';

const m = (direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): BufferEntry => ({ type: 'move', direction });

test('resolveHotseatPostLock prompts PIN setup before pass/execute when pin is undefined', () => {
  const firstP1Lock = resolveHotseatPostLock({
    seat: 'p1',
    pins: {},
    locks: { p1: true, p2: false },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: false,
  });
  assert.deepEqual(firstP1Lock, { action: 'PROMPT_PIN_SET', seat: 'p1' });

  const firstP2LockWhenBothLocked = resolveHotseatPostLock({
    seat: 'p2',
    pins: { p1: '' },
    locks: { p1: true, p2: true },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: false,
  });
  assert.deepEqual(firstP2LockWhenBothLocked, { action: 'PROMPT_PIN_SET', seat: 'p2' });
});

test('resolveHotseatPostLock passes when only one seat is locked and executes immediately when both are locked', () => {
  const afterP1 = resolveHotseatPostLock({
    seat: 'p1',
    pins: { p1: '12' },
    locks: { p1: true, p2: false },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: false,
  });
  assert.deepEqual(afterP1, { action: 'PASS_TO', nextSeat: 'p2' });

  const afterP2 = resolveHotseatPostLock({
    seat: 'p2',
    pins: { p1: '12', p2: '' },
    locks: { p1: true, p2: true },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: false,
  });
  assert.deepEqual(afterP2, { action: 'EXECUTE_ROUND', triggerSeat: 'p2' });
});

test('unequal hotseat buffers keep leftover moves locked and let unlocked player keep planning', () => {
  // P1 locked 3, P2 locked 1 -> 1 tick executed leaving P1 with 2 moves and P2 with 0.
  const turn1 = resolveHotseatAfterRound({
    triggerSeat: 'p2',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: {
      p1: [m('UP'), m('RIGHT')],
      p2: [],
    },
    roundStartIdx: 0,
    existingReplay: null,
    aiBridgeActive: false,
  });

  assert.equal(turn1.nextAction, 'CONTINUE_PLANNING');
  assert.equal(turn1.requiresTurnDoneConfirm, false);
  assert.equal(turn1.passTo, null);
  assert.equal(turn1.activeSeat, 'p2');
  assert.deepEqual(turn1.nextLocks, { p1: true, p2: false });
  assert.deepEqual(turn1.nextBuffers.p1, [m('UP'), m('RIGHT')]);
  assert.deepEqual(turn1.nextBuffers.p2, []);
  assert.deepEqual(turn1.nextReplay, { seat: 'p1', startIdx: 0 });

  // P2 queues 1 more move while P1 still has 2 -> Tick 2 runs; P1's replay startIdx stays 0!
  const turn2 = resolveHotseatAfterRound({
    triggerSeat: 'p2',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: {
      p1: [m('RIGHT')],
      p2: [],
    },
    roundStartIdx: 1,
    existingReplay: turn1.nextReplay,
    aiBridgeActive: false,
  });

  assert.equal(turn2.nextAction, 'CONTINUE_PLANNING');
  assert.equal(turn2.requiresTurnDoneConfirm, false);
  assert.equal(turn2.passTo, null);
  assert.deepEqual(turn2.nextLocks, { p1: true, p2: false });
  assert.deepEqual(turn2.nextReplay, { seat: 'p1', startIdx: 0 });

  // P2 now locks 3 moves while P1 had 1 left -> Tick 3 runs; P1 empties, P2 has 2 left -> Turn Done confirm before pass to P1!
  const turn3 = resolveHotseatAfterRound({
    triggerSeat: 'p2',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: {
      p1: [],
      p2: [m('DOWN'), m('LEFT')],
    },
    roundStartIdx: 2,
    existingReplay: turn2.nextReplay,
    aiBridgeActive: false,
  });

  assert.equal(turn3.nextAction, 'PASS_TO');
  assert.equal(turn3.requiresTurnDoneConfirm, true);
  assert.equal(turn3.passTo, 'p1');
  assert.deepEqual(turn3.nextLocks, { p1: false, p2: true });
  assert.deepEqual(turn3.nextBuffers.p2, [m('DOWN'), m('LEFT')]);
  assert.deepEqual(turn3.nextReplay, { seat: 'p1', startIdx: 0 });
});

test('both draining simultaneously passes to the opponent with preserved replay startIdx', () => {
  const result = resolveHotseatAfterRound({
    triggerSeat: 'p2',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: { p1: [], p2: [] },
    roundStartIdx: 4,
    existingReplay: { seat: 'p1', startIdx: 2 },
    aiBridgeActive: false,
  });

  assert.equal(result.nextAction, 'PASS_TO');
  assert.equal(result.requiresTurnDoneConfirm, true);
  assert.equal(result.passTo, 'p1');
  assert.deepEqual(result.nextLocks, { p1: false, p2: false });
  assert.deepEqual(result.nextReplay, { seat: 'p1', startIdx: 2 });
});

test('match end clears leftover buffers, locks, pass screen, and replay backlog', () => {
  const over = resolveHotseatAfterRound({
    triggerSeat: 'p2',
    phase: 'OVER',
    aliveSeats: ['p1'],
    buffers: { p1: [m('UP')], p2: [] },
    roundStartIdx: 3,
    existingReplay: { seat: 'p1', startIdx: 1 },
    aiBridgeActive: false,
  });

  assert.equal(over.nextAction, 'GAME_OVER');
  assert.equal(over.requiresTurnDoneConfirm, false);
  assert.equal(over.passTo, null);
  assert.equal(over.nextReplay, null);
  assert.deepEqual(over.nextLocks, { p1: false, p2: false });
  assert.deepEqual(over.nextBuffers, { p1: [], p2: [] });
});

test('ensureNonEmptyHotseatTimeoutBuffer queues one straight move only when empty', () => {
  assert.deepEqual(ensureNonEmptyHotseatTimeoutBuffer([], 'LEFT'), [m('LEFT')]);
  assert.deepEqual(ensureNonEmptyHotseatTimeoutBuffer([m('UP')], 'LEFT'), [m('UP')]);
});

test('hotseat AI bridge never opens PIN or pass screens and preserves leftover locks', () => {
  const aiLocksFirst = resolveHotseatPostLock({
    seat: 'p2',
    pins: {},
    locks: { p1: false, p2: true },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: true,
  });
  assert.deepEqual(aiLocksFirst, { action: 'WAIT_FOR_AI' });

  const p1LocksFirst = resolveHotseatPostLock({
    seat: 'p1',
    pins: {},
    locks: { p1: true, p2: false },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: true,
  });
  assert.deepEqual(p1LocksFirst, { action: 'WAIT_FOR_AI' });

  const bothLocked = resolveHotseatPostLock({
    seat: 'p2',
    pins: {},
    locks: { p1: true, p2: true },
    aliveSeats: ['p1', 'p2'],
    aiBridgeActive: true,
  });
  assert.deepEqual(bothLocked, { action: 'EXECUTE_ROUND', triggerSeat: 'p1' });

  const afterP1StillLocked = resolveHotseatAfterRound({
    triggerSeat: 'p1',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: { p1: [m('RIGHT'), m('RIGHT')], p2: [] },
    roundStartIdx: 0,
    existingReplay: null,
    aiBridgeActive: true,
  });
  assert.equal(afterP1StillLocked.nextAction, 'WAIT_FOR_AI');
  assert.equal(afterP1StillLocked.requiresTurnDoneConfirm, false);
  assert.equal(afterP1StillLocked.passTo, null);
  assert.equal(afterP1StillLocked.nextReplay, null);
  assert.deepEqual(afterP1StillLocked.nextLocks, { p1: true, p2: false });

  const afterP2StillLocked = resolveHotseatAfterRound({
    triggerSeat: 'p1',
    phase: 'RACING',
    aliveSeats: ['p1', 'p2'],
    buffers: { p1: [], p2: [m('DOWN')] },
    roundStartIdx: 1,
    existingReplay: null,
    aiBridgeActive: true,
  });
  assert.equal(afterP2StillLocked.nextAction, 'CONTINUE_PLANNING');
  assert.equal(afterP2StillLocked.requiresTurnDoneConfirm, false);
  assert.equal(afterP2StillLocked.passTo, null);
  assert.equal(afterP2StillLocked.nextReplay, null);
  assert.deepEqual(afterP2StillLocked.nextLocks, { p1: false, p2: true });
});
