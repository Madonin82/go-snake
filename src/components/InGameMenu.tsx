import React, { useEffect, useState } from 'react';
import { GamepadMenuAction } from '../game/gamepad';
import { soundEngine } from '../audio/soundEngine';

export interface InGameMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenControls: () => void;
  onQuit: () => void;
  quitLabel: string;
  onRegisterHandler?: (handler: ((action: GamepadMenuAction) => void) | null) => void;
  onRegisterDisarm?: (disarm: (() => void) | null) => void;
}

export const InGameMenu: React.FC<InGameMenuProps> = ({
  isOpen,
  onClose,
  onOpenControls,
  onQuit,
  quitLabel,
  onRegisterHandler,
  onRegisterDisarm,
}) => {
  const [quitArmed, setQuitArmed] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);

  // Linear focus order, top to bottom: CHANGE CONTROLS, QUIT, and CANCEL
  // once quit is armed. Linear so D-pad up/down and left/right both wrap.
  // The corner close button is pointer-only and intentionally excluded.
  const focusIds: string[] = [
    'controls',
    'quit',
    ...(quitArmed ? ['cancel'] : []),
  ];

  useEffect(() => {
    if (isOpen) {
      setQuitArmed(false);
      setFocusIndex(0);
    }
  }, [isOpen]);

  // Disarming quit removes CANCEL from the list; clamp focus back to QUIT.
  useEffect(() => {
    if (isOpen && focusIndex >= focusIds.length) {
      setFocusIndex(focusIds.length - 1);
    }
  }, [isOpen, quitArmed, focusIndex, focusIds.length]);

  useEffect(() => {
    if (!isOpen) {
      onRegisterDisarm?.(null);
      return;
    }

    const disarm = () => {
      setQuitArmed((prev) => {
        if (prev) soundEngine.playMenuBack();
        return false;
      });
    };

    onRegisterDisarm?.(disarm);
    return () => {
      onRegisterDisarm?.(null);
    };
  }, [isOpen, onRegisterDisarm]);

  useEffect(() => {
    if (!isOpen) return;

    const activate = (id: string) => {
      if (id === 'controls') {
        onOpenControls();
        return;
      }
      if (id === 'quit') {
        if (quitArmed) onQuit();
        else setQuitArmed(true);
        return;
      }
      if (id === 'cancel') {
        setQuitArmed(false);
        return;
      }
    };

    const handleAction = (action: GamepadMenuAction) => {
      if (action === 'UP' || action === 'LEFT') {
        soundEngine.playMenuMove();
        setFocusIndex((prev) => (prev > 0 ? prev - 1 : focusIds.length - 1));
        return;
      }
      if (action === 'DOWN' || action === 'RIGHT') {
        soundEngine.playMenuMove();
        setFocusIndex((prev) => (prev < focusIds.length - 1 ? prev + 1 : 0));
        return;
      }
      if (action === 'CONFIRM') {
        soundEngine.playMenuSelect();
        activate(focusIds[focusIndex]);
        return;
      }
      if (action === 'CANCEL') {
        soundEngine.playMenuBack();
        // B backs out of the quit confirmation first, then closes the menu.
        if (quitArmed) setQuitArmed(false);
        else onClose();
        return;
      }
      // START toggles the menu closed outright, even when quit is armed.
      if (action === 'START') {
        soundEngine.playMenuBack();
        onClose();
        return;
      }
    };

    onRegisterHandler?.(handleAction);
    return () => {
      onRegisterHandler?.(null);
    };
  }, [isOpen, quitArmed, focusIndex, focusIds, onClose, onOpenControls, onQuit, onRegisterHandler]);

  if (!isOpen) return null;

  const focused = (id: string) =>
    focusIds[focusIndex] === id ? ' ring-4 ring-[#ffffff] scale-[1.01]' : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="In-game menu"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[#0F380F]/90 p-4 font-mono text-[#9BBC0F]"
    >
      <div className="relative w-full max-w-[340px] flex flex-col gap-3 bg-[#9BBC0F] border-4 border-[#0F380F] shadow-[6px_6px_0px_#306230] p-4 text-[#0F380F]">
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => {
            soundEngine.playMenuBack();
            onClose();
          }}
          className="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center border-2 border-[#0F380F] bg-[#8BAC0F] hover:bg-[#0F380F] hover:text-[#9BBC0F] text-[#0F380F] font-black text-sm leading-none cursor-pointer"
        >
          ✕
        </button>

        <div className="text-center px-6">
          <div className="text-xl font-black tracking-wider">Options</div>
          <div className="mt-1 text-[10px] font-bold opacity-70">
            Gamepad: D-pad to move, A to pick, B to go back, Start to close.
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuSelect();
            onOpenControls();
          }}
          className={`w-full cursor-pointer py-3 bg-[#0F380F] text-[#9BBC0F] font-black text-base border-2 border-[#0F380F] shadow-[3px_3px_0px_#306230] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none${focused('controls')}`}
        >
          CHANGE CONTROLS
        </button>

        <button
          type="button"
          onClick={() => {
            soundEngine.playMenuSelect();
            if (quitArmed) onQuit();
            else setQuitArmed(true);
          }}
          className={`w-full cursor-pointer py-3 font-black text-base border-2 border-[#0F380F] ${
            quitArmed ? 'bg-red-700 text-white' : 'bg-[#9BBC0F] text-[#0F380F]'
          }${focused('quit')}`}
        >
          {quitArmed ? 'QUIT GAME — ARE YOU SURE?' : quitLabel}
        </button>
        {quitArmed && (
          <button
            type="button"
            onClick={() => {
              soundEngine.playMenuBack();
              setQuitArmed(false);
            }}
            className={`w-full cursor-pointer py-2 bg-[#8BAC0F] text-[#0F380F] font-black text-sm border-2 border-[#0F380F]${focused('cancel')}`}
          >
            CANCEL
          </button>
        )}
      </div>
    </div>
  );
};
