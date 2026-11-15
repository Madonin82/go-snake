import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hud } from './Hud';
import { DEFAULT_SETTINGS } from '../game/engine';
import { GameState } from '../types/game';

function createMockGameState(phase: GameState['phase'] = 'RACING'): GameState {
  return {
    tick: 18,
    round: 4,
    phaseTurnsRemaining: 42,
    phase,
    turnBased: true,
    snakes: [
      {
        id: 'p1',
        name: 'Player 1',
        isAlive: true,
        body: [{ x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }],
        direction: 'RIGHT',
        queuedDirection: null,
        score: 4,
        skillPoints: 5,
        equippedSkill: 'dart',
        pendingSkill: null,
      },
      {
        id: 'p2',
        name: 'BOT',
        isAlive: true,
        body: [{ x: 5, y: 5 }, { x: 5, y: 6 }],
        direction: 'UP',
        queuedDirection: null,
        score: 2,
        skillPoints: 2,
        equippedSkill: 'rattle',
        pendingSkill: null,
      },
    ],
    tokens: [],
    walls: [],
    rattleWalls: [],
    gridSize: 10,
    ringInset: 0,
    isTelegraphingShrink: false,
    telegraphRingInset: 0,
    activeMatchId: 'test-match',
    matchNumber: 1,
    phaseTimeRemaining: 15000,
    skillsAvailable: 'immediate',
  };
}

test('Hud renders portrait MENU button next to network diagnostics when onOpenMenu is provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(Hud, {
      gameState: createMockGameState('RACING'),
      playMode: 'LOCAL_HOTSEAT',
      latencyReport: { rtt: 0, ping: 0, jitter: 0, packetLoss: 0, quality: 'EXCELLENT', history: [] },
      onOpenLatencyHarness: () => {},
      onOpenSettings: () => {},
      onOpenMenu: () => {},
      gamepadCount: 0,
      settings: DEFAULT_SETTINGS,
      locks: { p1: false, p2: true },
      moveBuffers: { p1: [], p2: [] },
    })
  );

  const menuBtnIdx = html.indexOf('data-testid="portrait-menu-button"');
  const netBtnIdx = html.indexOf('aria-label="Open network diagnostics"');
  assert.ok(menuBtnIdx !== -1, 'Expected portrait MENU button to render');
  assert.ok(netBtnIdx !== -1, 'Expected network diagnostics button to render');
  assert.ok(menuBtnIdx < netBtnIdx, 'Expected portrait MENU button immediately before network diagnostics button');
  assert.ok(html.includes('>MENU<'), 'Expected explicit MENU text label');
  assert.ok(html.includes('aria-label="Open in-game menu"'));
});

test('Hud hides portrait MENU button when onOpenMenu is omitted, during replay, or when match is over', () => {
  const commonProps = {
    playMode: 'LOCAL_HOTSEAT' as const,
    latencyReport: { rtt: 0, ping: 0, jitter: 0, packetLoss: 0, quality: 'EXCELLENT' as const, history: [] },
    onOpenLatencyHarness: () => {},
    onOpenSettings: () => {},
    gamepadCount: 0,
    settings: DEFAULT_SETTINGS,
  };

  const withoutCallback = renderToStaticMarkup(
    React.createElement(Hud, {
      ...commonProps,
      gameState: createMockGameState('RACING'),
    })
  );
  assert.equal(withoutCallback.includes('data-testid="portrait-menu-button"'), false);

  const duringReplay = renderToStaticMarkup(
    React.createElement(Hud, {
      ...commonProps,
      gameState: createMockGameState('RACING'),
      onOpenMenu: () => {},
      replayActive: true,
    })
  );
  assert.equal(duringReplay.includes('data-testid="portrait-menu-button"'), false);

  const whenOver = renderToStaticMarkup(
    React.createElement(Hud, {
      ...commonProps,
      gameState: createMockGameState('OVER'),
      onOpenMenu: () => {},
    })
  );
  assert.equal(whenOver.includes('data-testid="portrait-menu-button"'), false);
});
