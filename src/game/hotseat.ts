import { BufferEntry, Direction, GameState } from '../types/game';

export type HotseatSeat = 'p1' | 'p2';

export interface HotseatReplayBacklog {
  seat: HotseatSeat;
  startIdx: number;
}

export type HotseatPostLockDecision =
  | { action: 'PROMPT_PIN_SET'; seat: HotseatSeat }
  | { action: 'EXECUTE_ROUND'; triggerSeat: HotseatSeat }
  | { action: 'PASS_TO'; nextSeat: HotseatSeat }
  | { action: 'WAIT_FOR_AI' };

export type HotseatAfterRoundDecision = {
  nextBuffers: Record<string, BufferEntry[]>;
  nextLocks: Record<string, boolean>;
  nextReplay: HotseatReplayBacklog | null;
  nextAction: 'GAME_OVER' | 'CONTINUE_PLANNING' | 'PASS_TO' | 'WAIT_FOR_AI';
  passTo: HotseatSeat | null;
  activeSeat: HotseatSeat;
  requiresTurnDoneConfirm: boolean;
};

export function otherHotseatSeat(seat: HotseatSeat): HotseatSeat {
  return seat === 'p1' ? 'p2' : 'p1';
}

export function resolveHotseatPostLock(params: {
  seat: HotseatSeat;
  pins: Record<string, string | undefined>;
  locks: Record<string, boolean>;
  aliveSeats: HotseatSeat[];
  aiBridgeActive: boolean;
}): HotseatPostLockDecision {
  const { seat, pins, locks, aliveSeats, aiBridgeActive } = params;

  if (!aiBridgeActive && pins[seat] === undefined) {
    return { action: 'PROMPT_PIN_SET', seat };
  }

  const allAliveLocked = aliveSeats.length > 0 && aliveSeats.every(s => Boolean(locks[s]));
  if (allAliveLocked) {
    return { action: 'EXECUTE_ROUND', triggerSeat: aiBridgeActive ? 'p1' : seat };
  }

  if (aiBridgeActive) {
    return { action: 'WAIT_FOR_AI' };
  }

  return { action: 'PASS_TO', nextSeat: otherHotseatSeat(seat) };
}

export function resolveHotseatAfterRound(params: {
  triggerSeat: HotseatSeat;
  phase: GameState['phase'];
  aliveSeats: HotseatSeat[];
  buffers: Record<string, BufferEntry[]>;
  roundStartIdx: number;
  existingReplay: HotseatReplayBacklog | null;
  aiBridgeActive: boolean;
}): HotseatAfterRoundDecision {
  const {
    triggerSeat,
    phase,
    aliveSeats,
    buffers,
    roundStartIdx,
    existingReplay,
    aiBridgeActive,
  } = params;

  const aliveSet = new Set<string>(aliveSeats);

  if (phase === 'OVER') {
    const nextBuffers = Object.fromEntries(
      Object.keys(buffers).map(k => [k, [] as BufferEntry[]]),
    );
    const nextLocks = Object.fromEntries(
      Object.keys(buffers).map(k => [k, false]),
    );
    return {
      nextBuffers,
      nextLocks,
      nextReplay: null,
      nextAction: 'GAME_OVER',
      passTo: null,
      activeSeat: aiBridgeActive ? 'p1' : triggerSeat,
      requiresTurnDoneConfirm: false,
    };
  }

  const nextBuffers = Object.fromEntries(
    Object.keys(buffers).map(k => [
      k,
      aliveSet.has(k) ? [...(buffers[k] ?? [])] : [],
    ]),
  );
  const nextLocks = Object.fromEntries(
    Object.keys(buffers).map(k => [
      k,
      aliveSet.has(k) && (nextBuffers[k]?.length ?? 0) > 0,
    ]),
  );

  if (aiBridgeActive) {
    return {
      nextBuffers,
      nextLocks,
      nextReplay: null,
      nextAction: nextLocks.p1 ? 'WAIT_FOR_AI' : 'CONTINUE_PLANNING',
      passTo: null,
      activeSeat: 'p1',
      requiresTurnDoneConfirm: false,
    };
  }

  const other = otherHotseatSeat(triggerSeat);
  // Preserve earliest unviewed tick for the non-active player across consecutive
  // short rounds while they remained committed to a longer locked queue.
  const nextReplay: HotseatReplayBacklog =
    existingReplay && existingReplay.seat === other
      ? existingReplay
      : { seat: other, startIdx: roundStartIdx };

  const triggerStillLocked = Boolean(nextLocks[triggerSeat]);
  const otherStillLocked = Boolean(nextLocks[other]);

  // If the current holder ran out of moves while the opponent still has locked
  // moves remaining, the holder keeps the device and plans immediately.
  // Once the opponent runs out (either alone or simultaneously), confirm Turn Done
  // before passing the phone.
  if (!triggerStillLocked && otherStillLocked) {
    return {
      nextBuffers,
      nextLocks,
      nextReplay,
      nextAction: 'CONTINUE_PLANNING',
      passTo: null,
      activeSeat: triggerSeat,
      requiresTurnDoneConfirm: false,
    };
  }

  return {
    nextBuffers,
    nextLocks,
    nextReplay,
    nextAction: 'PASS_TO',
    passTo: other,
    activeSeat: triggerSeat,
    requiresTurnDoneConfirm: true,
  };
}

export function ensureNonEmptyHotseatTimeoutBuffer(
  buffer: BufferEntry[],
  direction: Direction,
): BufferEntry[] {
  if (buffer.length > 0) return buffer;
  return [{ type: 'move', direction }];
}
