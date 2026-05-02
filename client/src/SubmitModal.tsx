import { useState } from 'react';
import type { ActionLogEntry } from './types';
import './SubmitModal.css';

interface Props {
  actionLog: ActionLogEntry[];
  onSubmit: (name: string) => void;
  onDismiss: () => void;
}

function pct(p: number) { return `${(p * 100).toFixed(1)}%`; }
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function cumFraction(entries: ActionLogEntry[]): string {
  let num = 1, den = 1;
  for (const e of entries) {
    if (e.isGfi) { num *= 5; den *= 6; }
    if (e.dodgeTarget !== null) { num *= (7 - e.dodgeTarget); den *= 6; }
  }
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}
function colLabel(col: number) { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }) { return `${colLabel(p.col)}${p.row + 1}`; }

function actionLabel(e: ActionLogEntry): string {
  if (e.isGfi && e.dodgeTarget !== null) return `GFI 2+ · Dodge ${e.dodgeTarget}+`;
  if (e.isGfi) return 'Go For It 2+';
  return `Dodge ${e.dodgeTarget}+`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SubmitModal({ actionLog, onSubmit, onDismiss }: Props) {
  const [name, setName] = useState('');

  const riskyMoves = actionLog.filter(e => e.isGfi || e.dodgeTarget !== null);
  const cumulativeProb = actionLog.length > 0
    ? actionLog[actionLog.length - 1].cumulativeProb
    : 1;

  return (
    <div className="modal-backdrop">
      <div className="modal submit-modal">
        <div className="submit-modal__td">🏈 TOUCHDOWN!</div>

        {riskyMoves.length > 0 ? (
          <div className="submit-modal__moves">
            <div className="submit-modal__moves-header">
              <span>Player</span>
              <span>Type</span>
              <span>Move</span>
              <span>Action</span>
              <span className="submit-modal__col-right">Chance</span>
            </div>
            {riskyMoves.map((entry, i) => (
              <div key={i} className="submit-modal__move-row">
                <span className="submit-modal__move-name">{entry.pieceName}</span>
                <span className="submit-modal__move-role">{capitalize(entry.pieceRole)}</span>
                <span className="submit-modal__move-pos">{posLabel(entry.from)} → {posLabel(entry.to)}</span>
                <span className="submit-modal__move-action">{actionLabel(entry)}</span>
                <span className="submit-modal__move-prob">{pct(entry.actionProb)}</span>
              </div>
            ))}
            <div className="submit-modal__cum-row">
              <span className="submit-modal__cum-label">Cumulative probability</span>
              <span className={`submit-modal__cum-value${cumulativeProb < 0.5 ? ' submit-modal__cum-value--risky' : ''}`}>
                {cumFraction(riskyMoves)} <span className="submit-modal__cum-pct">({pct(cumulativeProb)})</span>
              </span>
            </div>
          </div>
        ) : (
          <p className="submit-modal__no-risk">Clean run — no rolls needed!</p>
        )}

        <p className="submit-modal__prompt">Enter your name for the leaderboard:</p>
        <input
          className="submit-modal__input"
          type="text"
          maxLength={32}
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onSubmit(name.trim())}
          autoFocus
        />
        <div className="submit-modal__actions">
          <button
            className="modal__roll-btn"
            disabled={!name.trim()}
            onClick={() => onSubmit(name.trim())}
          >
            Submit Score
          </button>
          <button className="modal__continue-btn" onClick={onDismiss}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
