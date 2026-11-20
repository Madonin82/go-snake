import { PlayMode, Snake } from '../types/game';

export const PLAYER_HEX_COLORS = ['#0F380F', '#306230', '#8B1E0F', '#5B2C83'] as const;

export interface PlayerColorPalette {
  hex: string;
  body: string;
  light: string;
  rgb: string;
  chipBg: string;
  borderColor: string;
  badgeBg: string;
  defaultShadow: string;
  lockedShadow: string;
  activeHighlight: string;
}

// Keys match the colors stored in existing games and replays.
const PALETTES: Record<string, PlayerColorPalette> = {
  '#0F380F': {
    hex: '#0F380F',
    body: '#75a944',
    light: '#a9db72',
    rgb: '169, 219, 114',
    chipBg: 'bg-[#a9db72]',
    borderColor: 'border-[#a9db72]',
    badgeBg: 'bg-[#a9db72] text-[#132735]',
    defaultShadow: 'shadow-[0_4px_12px_#050e1d80]',
    lockedShadow: 'shadow-[0_1px_4px_#050e1d80]',
    activeHighlight: 'ring-2 ring-[#a9db72]',
  },
  '#306230': {
    hex: '#306230',
    body: '#216a70',
    light: '#ebbd55',
    rgb: '235, 189, 85',
    chipBg: 'bg-[#ebbd55]',
    borderColor: 'border-[#ebbd55]',
    badgeBg: 'bg-[#ebbd55] text-[#132735]',
    defaultShadow: 'shadow-[0_4px_12px_#050e1d80]',
    lockedShadow: 'shadow-[0_1px_4px_#050e1d80]',
    activeHighlight: 'ring-2 ring-[#ebbd55]',
  },
  '#8B1E0F': {
    hex: '#8B1E0F',
    body: '#aa4935',
    light: '#f18a60',
    rgb: '241, 138, 96',
    chipBg: 'bg-[#f18a60]',
    borderColor: 'border-[#f18a60]',
    badgeBg: 'bg-[#f18a60] text-[#132735]',
    defaultShadow: 'shadow-[0_4px_12px_#050e1d80]',
    lockedShadow: 'shadow-[0_1px_4px_#050e1d80]',
    activeHighlight: 'ring-2 ring-[#f18a60]',
  },
  '#5B2C83': {
    hex: '#5B2C83',
    body: '#674187',
    light: '#75fffa',
    rgb: '117, 255, 250',
    chipBg: 'bg-[#75fffa]',
    borderColor: 'border-[#75fffa]',
    badgeBg: 'bg-[#75fffa] text-[#132735]',
    defaultShadow: 'shadow-[0_4px_12px_#050e1d80]',
    lockedShadow: 'shadow-[0_1px_4px_#050e1d80]',
    activeHighlight: 'ring-2 ring-[#75fffa]',
  },
};

const SEAT_DEFAULT_HEX: Record<string, string> = {
  p1: '#0F380F',
  p2: '#306230',
  p3: '#8B1E0F',
  p4: '#5B2C83',
};

export function getPlayerColorPalette(snakeOrSeat: Pick<Snake, 'id' | 'color'> | string, index?: number): PlayerColorPalette {
  if (typeof snakeOrSeat === 'string') {
    const hex = SEAT_DEFAULT_HEX[snakeOrSeat] ?? PLAYER_HEX_COLORS[index ?? 0] ?? '#0F380F';
    return PALETTES[hex] ?? PALETTES['#0F380F'];
  }
  const normalizedColor = snakeOrSeat.color?.toUpperCase();
  if (normalizedColor && PALETTES[normalizedColor]) {
    return PALETTES[normalizedColor];
  }
  const fallbackHex = SEAT_DEFAULT_HEX[snakeOrSeat.id] ?? PLAYER_HEX_COLORS[index ?? 0] ?? '#0F380F';
  return PALETTES[fallbackHex] ?? PALETTES['#0F380F'];
}

/**
 * Splits players into left and right side groups:
 * - For 2 players: Left = [P1], Right = [P2]
 * - For 3-4 players: Left = [P1, P2], Right = [P3, P4] (2 per side, never 1 on one side and 3 on the other)
 */
export function splitPlayersTwoPerSide<T>(items: T[]): { left: T[]; right: T[] } {
  if (items.length <= 2) {
    return {
      left: items.slice(0, 1),
      right: items.slice(1, 2),
    };
  }
  return {
    left: items.slice(0, 2),
    right: items.slice(2, 4),
  };
}

/**
 * Returns the seat tag to append after a player's name, avoiding any
 * redundant "(BOT 3)" suffix on bots that are named or already default to "BOT N".
 */
export function getSeatDisplayTag(
  seat: string,
  playMode: PlayMode,
  viewerSeat?: 'p1' | 'p2' | null,
): string {
  const seatNumber = Number(seat.slice(1));
  if (playMode === 'ONLINE_SERVER' || playMode === 'ONLINE_SPECTATOR') return `(P${seatNumber})`;
  if (playMode === 'SOLO_AI') return seat === 'p1' ? '(YOU)' : '';
  if (playMode === 'LOCAL_2P') return `(P${seatNumber})`;
  // Hotseat: both players are local, sitting next to each other — never "(REMOTE)".
  if (playMode === 'LOCAL_HOTSEAT') return `(P${seatNumber})`;
  if (viewerSeat) return viewerSeat === seat ? '(YOU)' : '(REMOTE)';
  return seat === 'p1' ? '(YOU)' : '';
}
