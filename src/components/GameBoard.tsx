import React, { PointerEvent as ReactPointerEvent, useEffect, useRef } from 'react';
import { Direction, GameSettings, GameState, Position, Snake } from '../types/game';
import { HitstopInfo } from '../game/engine';
import { getPlayerColorPalette } from '../game/playerColors';

const CELL_SIZE = 32;
const RENDER_SCALE = 3;

const INACTIVE_SNAKE = { body: '#304354', light: '#6e8292' };

interface GameBoardProps {
  gameState: GameState;
  settings: GameSettings;
  lockedPaths?: Record<string, Position[] | undefined>;
  plannedPaths?: Record<string, Position[] | undefined>;
  controlSeat: 'p1' | 'p2';
  onDirection: (direction: Direction, touchSeat?: 'p1' | 'p2') => void;
  interactionEnabled: boolean;
  localTwoPlayer?: boolean;
  onLongPress?: (cell: Position, touchSeat?: 'p1' | 'p2', tapGridPoint?: { gx: number; gy: number }) => void;
  // Local modes: touch taps route to onCellTap (pathfind + head-lock,
  // like a PC mouse click) instead of the head-relative one-direction
  // tap. Online modes keep the head-relative tap.
  tapToPathfind?: boolean;
  onCellTap?: (cell: Position, touchSeat?: 'p1' | 'p2', tapGridPoint?: { gx: number; gy: number }) => void;
  animationsDisabled?: boolean;
  hitstop?: HitstopInfo | null;
  fatalMoveAnimating?: string[];
  deniedCells?: { x: number; y: number }[];
  onCellClick?: (cell: Position, event: React.MouseEvent<HTMLCanvasElement>) => void;
  onCellDoubleClick?: (cell: Position, event: React.MouseEvent<HTMLCanvasElement>) => void;
  onCellContextMenu?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  gameState, settings, lockedPaths, plannedPaths, controlSeat, onDirection, interactionEnabled,
  localTwoPlayer = false,
  onLongPress,
  tapToPathfind = false,
  onCellTap,
  animationsDisabled = false,
  hitstop = null,
  fatalMoveAnimating = [],
  deniedCells = [],
  onCellClick,
  onCellDoubleClick,
  onCellContextMenu,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStartRef = useRef<{ id: number; x: number; y: number; canvasX: number; canvasY: number; time?: number; startedOnSnake?: string } | null>(null);
  const pointerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const lastPointerTypeRef = useRef<string>('mouse');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridSize = gameState.gridSize ?? settings.gridSize;
    const cellSize = CELL_SIZE;
    const boardPixelSize = gridSize * cellSize;
    const resolution = boardPixelSize * RENDER_SCALE;

    if (canvas.width !== resolution || canvas.height !== resolution) {
      canvas.width = resolution;
      canvas.height = resolution;
    }
    ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
    renderArena(ctx, gridSize, cellSize);

    // 3. Render Shrink Ring / Outer Walls (Closed in)
    const ringInset = gameState.ringInset;
    if (ringInset > 0) {
      for (let x = 0; x < gridSize; x++) {
        for (let y = 0; y < gridSize; y++) {
          const isShrunkWall = x < ringInset || x >= gridSize - ringInset || y < ringInset || y >= gridSize - ringInset;
          if (isShrunkWall) {
            renderShrunkWallCell(ctx, x * cellSize, y * cellSize, cellSize);
          }
        }
      }
    }

    // Keep the next ring visible even when animations are disabled.
    if (gameState.isTelegraphingShrink) {
      const next = gameState.telegraphRingInset;
      for (let x = ringInset; x < gridSize - ringInset; x++) {
        for (let y = ringInset; y < gridSize - ringInset; y++) {
          if (x === next - 1 || x === gridSize - next || y === next - 1 || y === gridSize - next) {
            renderTelegraphCell(ctx, x * cellSize, y * cellSize, cellSize);
          }
        }
      }
    }

    // Campaign playtest walls are permanent cells within the arena.
    const rattleWallSet = new Set(
      (gameState.rattleWalls ?? []).map(w => `${w.x},${w.y}`),
    );
    for (const wall of gameState.walls ?? []) {
      if (rattleWallSet.has(`${wall.x},${wall.y}`)) continue;
      renderShrunkWallCell(ctx, wall.x * cellSize, wall.y * cellSize, cellSize);
    }

    // Rattle walls use the owner’s accent when available.
    for (const wall of gameState.rattleWalls ?? []) {
      const owner = wall.ownerId
        ? gameState.snakes.find(snake => snake.id === wall.ownerId)
        : undefined;
      renderRattleWall(ctx, wall.x * cellSize, wall.y * cellSize, cellSize, owner ? getPlayerColorPalette(owner).body : undefined);
    }

    // 5. Render Tokens (Escalating Round Tokens)
    for (const token of gameState.tokens) {
      renderToken(ctx, token.x * cellSize, token.y * cellSize, cellSize);
    }

    // 6. Render Planned Paths (Hatched pattern during planning) and Locked Paths (Solid committed shading)
    if (plannedPaths) {
      for (const snake of gameState.snakes) {
        if (lockedPaths?.[snake.id]) continue;
        const path = plannedPaths[snake.id];
        if (!path || path.length === 0) continue;

        const { light: targetColor, rgb } = getPlayerColorPalette(snake);

        // Draw planned cells (lighter + diagonal hatch lines)
        for (const pos of path) {
          const rx = pos.x * cellSize + 6;
          const ry = pos.y * cellSize + 6;
          const rw = cellSize - 12;
          const rh = cellSize - 12;

          // Lighter background wash
          ctx.fillStyle = `rgba(${rgb}, 0.12)`;
          ctx.fillRect(rx, ry, rw, rh);

          // Diagonal hatch lines
          ctx.save();
          ctx.beginPath();
          ctx.rect(rx, ry, rw, rh);
          ctx.clip();

          ctx.strokeStyle = `rgba(${rgb}, 0.32)`;
          ctx.lineWidth = 1.5;
          const step = 5;
          for (let offset = -rh; offset <= rw + rh; offset += step) {
            ctx.beginPath();
            ctx.moveTo(rx + offset, ry);
            ctx.lineTo(rx + offset + rh, ry + rh);
            ctx.stroke();
          }

          // Subtle light border around the planned path cell
          ctx.strokeStyle = `rgba(${rgb}, 0.6)`;
          ctx.lineWidth = 1;
          ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
          ctx.restore();
        }

        // Distinct marker on the virtual head cell (the endpoint / click-to-lock target)
        const endpoint = path[path.length - 1];
        if (endpoint) {
          const epX = endpoint.x * cellSize;
          const epY = endpoint.y * cellSize;

          ctx.save();

          // Subtle wash inside endpoint cell
          const pulseAlpha = animationsDisabled ? 0.25 : 0.18 + 0.12 * Math.sin(Date.now() / 200);
          ctx.fillStyle = `rgba(${rgb}, ${pulseAlpha})`;
          ctx.fillRect(epX + 3, epY + 3, cellSize - 6, cellSize - 6);

          // Distinct crisp outline around endpoint
          ctx.strokeStyle = targetColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(epX + 3, epY + 3, cellSize - 6, cellSize - 6);

          // Corner bracket reticles
          const cornerLen = 5;
          ctx.beginPath();
          // Top-left
          ctx.moveTo(epX + 3, epY + 3 + cornerLen);
          ctx.lineTo(epX + 3, epY + 3);
          ctx.lineTo(epX + 3 + cornerLen, epY + 3);
          // Top-right
          ctx.moveTo(epX + cellSize - 3 - cornerLen, epY + 3);
          ctx.lineTo(epX + cellSize - 3, epY + 3);
          ctx.lineTo(epX + cellSize - 3, epY + 3 + cornerLen);
          // Bottom-left
          ctx.moveTo(epX + 3, epY + cellSize - 3 - cornerLen);
          ctx.lineTo(epX + 3, epY + cellSize - 3);
          ctx.lineTo(epX + 3 + cornerLen, epY + cellSize - 3);
          // Bottom-right
          ctx.moveTo(epX + cellSize - 3 - cornerLen, epY + cellSize - 3);
          ctx.lineTo(epX + cellSize - 3, epY + cellSize - 3);
          ctx.lineTo(epX + cellSize - 3, epY + cellSize - 3 - cornerLen);
          ctx.stroke();

          // Small center target pip
          ctx.fillStyle = targetColor;
          ctx.fillRect(epX + cellSize / 2 - 2, epY + cellSize / 2 - 2, 4, 4);

          ctx.restore();
        }
      }
    }

    if (lockedPaths) {
      for (const snake of gameState.snakes) {
        const path = lockedPaths[snake.id];
        if (!path) continue;
        ctx.fillStyle = `rgba(${getPlayerColorPalette(snake).rgb}, 0.48)`;
        for (const pos of path) {
          ctx.fillRect(pos.x * cellSize + 6, pos.y * cellSize + 6, cellSize - 12, cellSize - 12);
        }
      }
    }

    // 7. Render Snakes
    for (const snake of gameState.snakes) {
      const isAnimatingFatalMove = !snake.isAlive && fatalMoveAnimating.includes(snake.id);
      const isDuringDeathHitstop = Boolean(
        !snake.isAlive &&
        hitstop &&
        (hitstop.kind === 'DEATH' || hitstop.kind === 'BOSS_DEATH') &&
        hitstop.flashCells.some(cell =>
          (snake.body[0] && cell.x === snake.body[0].x && cell.y === snake.body[0].y) ||
          (snake.deathPosition && cell.x === snake.deathPosition.x && cell.y === snake.deathPosition.y),
        ),
      );
      const renderAsAlive = snake.isAlive || isDuringDeathHitstop || isAnimatingFatalMove;
      const palette = renderAsAlive ? getPlayerColorPalette(snake) : INACTIVE_SNAKE;
      renderSnake(ctx, snake, cellSize, palette, isAnimatingFatalMove);
    }

    // 8. Persistent red direction arrow on dead snake head cell for the rest of the match
    for (const snake of gameState.snakes) {
      if (snake.isAlive) continue;
      if (fatalMoveAnimating.includes(snake.id)) continue;
      const headPos = snake.body[0] || snake.deathPosition;
      if (!headPos) continue;
      const isFlashingNow = Boolean(
        hitstop &&
        (hitstop.kind === 'DEATH' || hitstop.kind === 'BOSS_DEATH') &&
        hitstop.flashCells.some(cell =>
          (cell.x === headPos.x && cell.y === headPos.y) ||
          (snake.deathPosition && cell.x === snake.deathPosition.x && cell.y === snake.deathPosition.y),
        ),
      );
      if (!isFlashingNow) {
        renderDeathMarker(ctx, headPos.x * cellSize, headPos.y * cellSize, cellSize, snake.direction);
      }
    }

    // 8b. White flash on the death cell during death hitstop
    if (hitstop && (hitstop.kind === 'DEATH' || hitstop.kind === 'BOSS_DEATH') && hitstop.flashCells.length > 0) {
      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      for (const cell of hitstop.flashCells) {
        const cx = Math.max(0, Math.min(gridSize - 1, cell.x));
        const cy = Math.max(0, Math.min(gridSize - 1, cell.y));
        ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
      }
      ctx.restore();
    }

    // 8c. Dart afterimage trail — fading ghost heads on intermediate cells
    if (hitstop && hitstop.kind === 'DART' && gameState.dartTrail) {
      ctx.save();
      for (const trail of gameState.dartTrail) {
        const snake = gameState.snakes.find(s => s.id === trail.snakeId);
        const baseColor = snake ? getPlayerColorPalette(snake).light : '#d5e7ec';
        trail.cells.forEach((cell, idx) => {
          // Fade: first cell (earliest) more transparent, later cells more solid
          const opacity = 0.25 + (idx / Math.max(1, trail.cells.length)) * 0.35;
          ctx.globalAlpha = opacity;
          ctx.fillStyle = baseColor;
          const cx = Math.max(0, Math.min(gridSize - 1, cell.x));
          const cy = Math.max(0, Math.min(gridSize - 1, cell.y));
          // Ghost head: slightly inset square
          const inset = cellSize * 0.15;
          ctx.fillRect(
            cx * cellSize + inset,
            cy * cellSize + inset,
            cellSize - inset * 2,
            cellSize - inset * 2
          );
        });
      }
      ctx.restore();
    }

    // 10. Render Denied Cell X Flashes
    if (deniedCells && deniedCells.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffdbd3';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const cell of deniedCells) {
        const px = cell.x * cellSize;
        const py = cell.y * cellSize;
        const pad = Math.floor(cellSize * 0.22);
        ctx.beginPath();
        ctx.moveTo(px + pad, py + pad);
        ctx.lineTo(px + cellSize - pad, py + cellSize - pad);
        ctx.moveTo(px + cellSize - pad, py + pad);
        ctx.lineTo(px + pad, py + cellSize - pad);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 11. Outer Frame Border
    ctx.strokeStyle = '#60828d';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, boardPixelSize - 1, boardPixelSize - 1);

  }, [gameState, settings, lockedPaths, plannedPaths, animationsDisabled, hitstop, fatalMoveAnimating, deniedCells]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    lastPointerTypeRef.current = event.pointerType;
    if (!interactionEnabled || event.pointerType !== 'touch') return;
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return;
    const contentLeft = rect.left + canvas.clientLeft;
    const contentTop = rect.top + canvas.clientTop;
    const cellSize = CELL_SIZE;
    const gridSize = gameState.gridSize ?? settings.gridSize;
    const x = ((event.clientX - contentLeft) / canvas.clientWidth) * gridSize * cellSize;
    const y = ((event.clientY - contentTop) / canvas.clientHeight) * gridSize * cellSize;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);

    let startedSnakeId: string | undefined = undefined;
    if (settings.gestureDragEnabled !== false) {
      for (const snake of gameState.snakes) {
        if (!snake.isAlive) continue;
        if (snake.body.some(seg => seg.x === cellX && seg.y === cellY)) {
          startedSnakeId = snake.id;
          break;
        }
      }
    }

    pointerStartRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      canvasX: x,
      canvasY: y,
      time: Date.now(),
      startedOnSnake: startedSnakeId,
    };
    isDraggingRef.current = false;

    if (settings.gestureLongPressEnabled !== false) {
      pointerTimerRef.current = setTimeout(() => {
        if (!isDraggingRef.current && pointerStartRef.current) {
          pointerStartRef.current = null;
          if (cellX >= 0 && cellX < gridSize && cellY >= 0 && cellY < gridSize) {
            if (onLongPress) {
              onLongPress({ x: cellX, y: cellY }, undefined, { gx: x / cellSize, gy: y / cellSize });
            }
          }
        }
        pointerTimerRef.current = null;
      }, 500);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.hypot(deltaX, deltaY) > 12) {
      if (pointerTimerRef.current) {
        clearTimeout(pointerTimerRef.current);
        pointerTimerRef.current = null;
      }
      isDraggingRef.current = true;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = pointerStartRef.current;
    pointerStartRef.current = null;
    if (pointerTimerRef.current) {
      clearTimeout(pointerTimerRef.current);
      pointerTimerRef.current = null;
    }
    if (!interactionEnabled || !start || start.id !== event.pointerId) return;

    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect) return;

    const contentLeft = rect.left + canvas.clientLeft;
    const contentTop = rect.top + canvas.clientTop;
    const contentRight = contentLeft + canvas.clientWidth;
    const contentBottom = contentTop + canvas.clientHeight;
    if (event.clientX < contentLeft || event.clientX > contentRight ||
      event.clientY < contentTop || event.clientY > contentBottom) return;

    const cellSize = CELL_SIZE;
    const gridSize = gameState.gridSize ?? settings.gridSize;
    const x = ((event.clientX - contentLeft) / canvas.clientWidth) * gridSize * cellSize;
    const y = ((event.clientY - contentTop) / canvas.clientHeight) * gridSize * cellSize;
    const cellX = Math.floor(x / cellSize);
    const cellY = Math.floor(y / cellSize);

    if (cellX < 0 || cellX >= gridSize || cellY < 0 || cellY >= gridSize) return;

    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const dir: Direction = Math.abs(deltaX) > Math.abs(deltaY)
        ? (deltaX > 0 ? 'RIGHT' : 'LEFT')
        : (deltaY > 0 ? 'DOWN' : 'UP');

      const startCellX = Math.floor(start.canvasX / cellSize);
      const startCellY = Math.floor(start.canvasY / cellSize);
      const cellDist = Math.abs(cellX - startCellX) + Math.abs(cellY - startCellY);

      if (!localTwoPlayer) {
        // 1P and hotseat: restore one-step swipe (onDirection) for short drags
        if (cellDist <= 1 || !start.startedOnSnake) {
          if (settings.gestureSwipeEnabled !== false) {
            onDirection(dir, controlSeat);
          }
          return;
        }
        // Long drag on snake: full path
        if (start.startedOnSnake && settings.gestureDragEnabled !== false && onCellTap) {
          onCellTap({ x: cellX, y: cellY }, start.startedOnSnake as 'p1' | 'p2', { gx: x / cellSize, gy: y / cellSize });
        }
        return;
      } else {
        // Simultaneous 2P: board-swipe is retired (empty board drag does nothing)
        if (start.startedOnSnake) {
          if (cellDist <= 1) {
            // Short drag on snake in 2P: one direction step
            if (settings.gestureSwipeEnabled !== false) {
              onDirection(dir, start.startedOnSnake as 'p1' | 'p2');
            }
          } else {
            // Long drag on snake in 2P: full path
            if (settings.gestureDragEnabled !== false && onCellTap) {
              onCellTap({ x: cellX, y: cellY }, start.startedOnSnake as 'p1' | 'p2', { gx: x / cellSize, gy: y / cellSize });
            }
          }
        }
        return;
      }
    }

    if (onCellTap) {
      onCellTap({ x: cellX, y: cellY }, undefined, { gx: x / cellSize, gy: y / cellSize });
    }
  };

  const getCellFromMouseEvent = (event: React.MouseEvent<HTMLCanvasElement>): Position | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const contentLeft = rect.left + canvas.clientLeft;
    const contentTop = rect.top + canvas.clientTop;
    if (
      event.clientX < contentLeft || event.clientX >= contentLeft + canvas.clientWidth ||
      event.clientY < contentTop || event.clientY >= contentTop + canvas.clientHeight
    ) return null;

    const gridSize = gameState.gridSize ?? settings.gridSize;
    const cellX = Math.floor(((event.clientX - contentLeft) / canvas.clientWidth) * gridSize);
    const cellY = Math.floor(((event.clientY - contentTop) / canvas.clientHeight) * gridSize);
    if (cellX < 0 || cellX >= gridSize || cellY < 0 || cellY >= gridSize) return null;
    return { x: cellX, y: cellY };
  };

  return (
    <div className="match-board arena-frame relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full h-full max-w-full aspect-square block rounded-lg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartRef.current = null; }}
        onClick={(e) => {
          if (lastPointerTypeRef.current === 'touch') return;
          if (e.button !== 0) return;
          const cell = getCellFromMouseEvent(e);
          if (cell && onCellClick) onCellClick(cell, e);
        }}
        onDoubleClick={(e) => {
          if (lastPointerTypeRef.current === 'touch') return;
          if (e.button !== 0) return;
          const cell = getCellFromMouseEvent(e);
          if (cell && onCellDoubleClick) onCellDoubleClick(cell, e);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (lastPointerTypeRef.current === 'touch') return;
          if (onCellContextMenu) onCellContextMenu(e);
        }}
      />
    </div>
  );
};

function isReverseDirection(current: Direction, next: Direction): boolean {
  return (current === 'UP' && next === 'DOWN') ||
    (current === 'DOWN' && next === 'UP') ||
    (current === 'LEFT' && next === 'RIGHT') ||
    (current === 'RIGHT' && next === 'LEFT');
}

function renderArena(ctx: CanvasRenderingContext2D, gridSize: number, cellSize: number) {
  const size = gridSize * cellSize;
  const light = ctx.createRadialGradient(size * 0.36, size * 0.24, 0, size * 0.5, size * 0.5, size * 0.72);
  light.addColorStop(0, '#284d57');
  light.addColorStop(0.55, '#172f3a');
  light.addColorStop(1, '#0a1623');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, size, size);

  for (let row = 0; row < gridSize; row++) {
    for (let column = 0; column < gridSize; column++) {
      const x = column * cellSize;
      const y = row * cellSize;
      ctx.fillStyle = (row + column) % 2 === 0 ? '#a4d8de12' : '#000b171a';
      ctx.fillRect(x + 1, y + 1, cellSize - 1, cellSize - 1);
      ctx.fillStyle = '#c8edec21';
      ctx.fillRect(x + 1, y + 1, cellSize - 2, 1);
      ctx.fillStyle = '#d3f0eb38';
      ctx.fillRect(x + 3, y + 4, 2, 1);
    }
  }
}

function renderSnake(
  ctx: CanvasRenderingContext2D,
  snake: Snake,
  cellSize: number,
  palette: { body: string; light: string },
  lungeFatalMove: boolean,
) {
  const positions = snake.body;
  const head = positions[0];
  if (!head) return;
  const half = cellSize / 2;
  const center = ({ x, y }: Position) => [x * cellSize + half, y * cellSize + half] as const;
  const [headX, headY] = center(head);
  const dx = snake.direction === 'RIGHT' ? 1 : snake.direction === 'LEFT' ? -1 : 0;
  const dy = snake.direction === 'DOWN' ? 1 : snake.direction === 'UP' ? -1 : 0;
  const lunge = lungeFatalMove ? cellSize * 0.42 : 0;

  ctx.save();
  ctx.lineCap = 'round';
  for (let i = positions.length - 1; i >= 1; i--) {
    const [x, y] = center(positions[i]);
    const [nextX, nextY] = center(positions[i - 1]);
    const width = i === positions.length - 1 ? 17 : 22;

    // Older match snapshots can contain disconnected cells. Draw the cell
    // without bridging the gap in that case.
    const adjacent = Math.abs(x - nextX) + Math.abs(y - nextY) === cellSize;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(adjacent ? nextX : x + 0.01, adjacent ? nextY : y);
    ctx.strokeStyle = '#07141e';
    ctx.lineWidth = width + 4;
    ctx.stroke();
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  for (let i = 1; i < positions.length; i++) {
    const [x, y] = center(positions[i]);
    ctx.fillStyle = palette.light;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 4.5, 2.4, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (lunge) {
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = 19;
    ctx.beginPath();
    ctx.moveTo(headX, headY);
    ctx.lineTo(headX + dx * lunge, headY + dy * lunge);
    ctx.stroke();
  }

  ctx.translate(headX + dx * lunge, headY + dy * lunge);
  ctx.rotate(Math.atan2(dy, dx));
  const light = ctx.createLinearGradient(0, -13, 0, 13);
  light.addColorStop(0, palette.light);
  light.addColorStop(1, palette.body);
  ctx.beginPath();
  ctx.roundRect(-14, -12, 28, 24, [9, 7, 7, 9]);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.strokeStyle = '#081923';
  ctx.lineWidth = 2;
  ctx.stroke();

  for (const eyeY of [-6, 6]) {
    ctx.fillStyle = '#f5fdff';
    ctx.beginPath();
    ctx.ellipse(5, eyeY, 4, 3.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#102332';
    ctx.beginPath();
    ctx.ellipse(6.5, eyeY, 1.7, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function renderDeathMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  direction: Direction = 'RIGHT',
) {
  ctx.save();
  ctx.strokeStyle = '#FF0000';
  ctx.fillStyle = '#FF0000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

  const cx = x + cellSize / 2;
  const cy = y + cellSize / 2;
  const pad = 5;
  const tipOffset = cellSize / 2 - pad;
  const tailOffset = cellSize / 2 - pad - 1;
  const wingSpan = Math.round(cellSize * 0.28);
  const headLen = Math.round(cellSize * 0.28);

  ctx.lineWidth = 3;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  ctx.beginPath();
  if (direction === 'LEFT') {
    const tipX = cx - tipOffset;
    const endX = cx + tailOffset;
    ctx.moveTo(endX, cy);
    ctx.lineTo(tipX + 2, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tipX, cy);
    ctx.lineTo(tipX + headLen, cy - wingSpan);
    ctx.lineTo(tipX + headLen, cy + wingSpan);
    ctx.closePath();
    ctx.fill();
  } else if (direction === 'RIGHT') {
    const tipX = cx + tipOffset;
    const endX = cx - tailOffset;
    ctx.moveTo(endX, cy);
    ctx.lineTo(tipX - 2, cy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tipX, cy);
    ctx.lineTo(tipX - headLen, cy - wingSpan);
    ctx.lineTo(tipX - headLen, cy + wingSpan);
    ctx.closePath();
    ctx.fill();
  } else if (direction === 'UP') {
    const tipY = cy - tipOffset;
    const endY = cy + tailOffset;
    ctx.moveTo(cx, endY);
    ctx.lineTo(cx, tipY + 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - wingSpan, tipY + headLen);
    ctx.lineTo(cx + wingSpan, tipY + headLen);
    ctx.closePath();
    ctx.fill();
  } else {
    // DOWN
    const tipY = cy + tipOffset;
    const endY = cy - tailOffset;
    ctx.moveTo(cx, endY);
    ctx.lineTo(cx, tipY - 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, tipY);
    ctx.lineTo(cx - wingSpan, tipY - headLen);
    ctx.lineTo(cx + wingSpan, tipY - headLen);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function renderToken(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) {
  const half = cellSize / 2;
  ctx.save();
  ctx.translate(x + half, y + half);
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, half);
  glow.addColorStop(0, '#ffc26c95');
  glow.addColorStop(1, '#ffc26c00');
  ctx.fillStyle = glow;
  ctx.fillRect(-half, -half, cellSize, cellSize);

  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(9, -3);
  ctx.lineTo(7, 6);
  ctx.lineTo(0, 11);
  ctx.lineTo(-7, 6);
  ctx.lineTo(-9, -3);
  ctx.closePath();
  ctx.fillStyle = '#f8ad54';
  ctx.fill();
  ctx.strokeStyle = '#ffe9b7';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(2, -1);
  ctx.lineTo(-8, -3);
  ctx.closePath();
  ctx.fillStyle = '#fff4d1';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(8, -3);
  ctx.lineTo(2, -1);
  ctx.lineTo(0, 10);
  ctx.lineTo(6, 5);
  ctx.closePath();
  ctx.fillStyle = '#c97039';
  ctx.fill();
  ctx.restore();
}

function renderShrunkWallCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) {
  ctx.fillStyle = '#08131d';
  ctx.fillRect(x, y, cellSize, cellSize);
  const stone = ctx.createLinearGradient(x, y, x, y + cellSize);
  stone.addColorStop(0, '#4a5967');
  stone.addColorStop(1, '#202e3e');
  ctx.fillStyle = stone;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, cellSize - 4, cellSize - 6, 4);
  ctx.fill();
  ctx.fillStyle = '#92a5b45e';
  ctx.fillRect(x + 7, y + 4, cellSize - 14, 1);
  ctx.fillStyle = '#121e2a';
  ctx.fillRect(x + 8, y + cellSize - 9, cellSize - 16, 2);
}

function renderRattleWall(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number, color = '#50637a') {
  renderShrunkWallCell(ctx, x, y, cellSize);
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y + cellSize / 2 - 2, cellSize - 16, 4);
}

function renderTelegraphCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) {
  ctx.fillStyle = '#ff944c35';
  ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
  ctx.strokeStyle = '#ffc18a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
  ctx.beginPath();
  ctx.moveTo(x + 7, y + cellSize - 7);
  ctx.lineTo(x + cellSize - 7, y + 7);
  ctx.stroke();
}
