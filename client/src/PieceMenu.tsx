import { useEffect, useRef } from 'react';
import type { PlayerPiece } from './types';
import './PieceMenu.css';

export interface PieceMenuAction {
  label: string;
  key: string;
  disabled?: boolean;
}

interface Props {
  piece: PlayerPiece;
  x: number; // px from left of viewport
  y: number; // px from top of viewport
  actions: PieceMenuAction[];
  onAction: (key: string) => void;
  onDismiss: () => void;
}

const ACTIONS: PieceMenuAction[] = [
  { label: 'Move', key: 'move' },
  { label: 'Hand Off', key: 'handoff' },
  { label: 'Pass', key: 'pass' },
];

export { ACTIONS as DEFAULT_ACTIONS };

export function PieceMenu({ piece, x, y, actions, onAction, onDismiss }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    // Use capture so it fires before any other click handlers
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [onDismiss]);

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      className="piece-menu"
      style={{ left: x, top: y }}
    >
      <div className="piece-menu__header">{piece.name}</div>
      {actions.map(action => (
        <button
          key={action.key}
          className="piece-menu__item"
          disabled={action.disabled}
          onClick={() => { onAction(action.key); }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
