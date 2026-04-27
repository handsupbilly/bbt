import { useState } from 'react';
import type { ActionLogEntry } from './types';
import './SubmitModal.css';

interface Props {
  actionLog: ActionLogEntry[];
  onSubmit: (name: string) => void;
  onDismiss: () => void;
}

function pct(p: number) { return `${(p * 100).toFixed(1)}%`; }
function colLabel(col: number) { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }) { return `${colLabel(p.col)}${p.row + 1}`; }



export function SubmitModal({ actionLog, onSubmit, onDismiss }: Props) {
  const [name, setName] = useState('');

  const riskyMoves = actionLog.filter(e => e.dodgeTarget !== null);
  const cumulativeProb = actionLog.length > 0
    ? actionLog[actionLog.length - 1].cumulativeProb
    : 1;


  return (
    <div className="modal-backdrop">
      <div className="modal submit-modal">
        <div className="submit-modal__td">🏈 TOUCHDOWN!</div>

        {riskyMoves.length > 0 ? (
          <div className="submit-modal__moves">
            <div className="submit-modal__moves-title">Risky moves</div>
            {riskyMoves.map((entry, i) => (
              <div key={i} className="submit-modal__move-row">
                <span className="submit-modal__move-label">
                  {posLabel(entry.from)} → {posLabel(entry.to)}
                </span>
                <span className="submit-modal__move-dodge">{entry.dodgeTarget}+</span>
                <span className="submit-modal__move-prob">{pct(entry.actionProb)}</span>
              </div>
            ))}
            <div className="submit-modal__cum-row">
              <span className="submit-modal__cum-label">Cumulative probability</span>
              <span className={`submit-modal__cum-value${cumulativeProb < 0.5 ? ' submit-modal__cum-value--risky' : ''}`}>
                {pct(cumulativeProb)}
              </span>
            </div>
          </div>
        ) : (
          <p className="submit-modal__no-risk">Clean run — no dodges needed!</p>
        )}

        <div className="submit-modal__score-block">
          <span className="submit-modal__score-label">Score</span>
          <span className="submit-modal__score-value">{pct(cumulativeProb)}</span>
        </div>

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
