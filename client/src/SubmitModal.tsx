import { useState } from 'react';
import './DiceModal.css';
import './SubmitModal.css';

interface Props {
  probability: number;
  diceCount: number;
  onSubmit: (name: string) => void;
  onDismiss: () => void;
}

function pct(p: number) { return `${Math.round(p * 100)}%`; }

export function SubmitModal({ probability, diceCount, onSubmit, onDismiss }: Props) {
  const [name, setName] = useState('');

  return (
    <div className="modal-backdrop">
      <div className="modal submit-modal">
        <div className="submit-modal__td">🏈 TOUCHDOWN!</div>
        <div className="submit-modal__stats">
          <div className="submit-modal__stat">
            <span className="submit-modal__stat-label">Success chance</span>
            <span className="submit-modal__stat-value">{pct(probability)}</span>
          </div>
          <div className="submit-modal__stat">
            <span className="submit-modal__stat-label">Dice rolls</span>
            <span className="submit-modal__stat-value">{diceCount}</span>
          </div>
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
