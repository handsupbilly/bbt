import type { GameState } from './types';
import './DiceModal.css'; // reuse backdrop/modal styles

interface Props {
  state: GameState;
  onContinue: () => void;
}

export function PhaseModal({ state, onContinue }: Props) {
  if (state.phase === 'playing') return null;

  const isGameOver = state.phase === 'game_over';
  const { human, orc } = state.score;

  let title = '';
  let body = '';
  let btnLabel = '';

  if (isGameOver) {
    title = 'Full Time!';
    body =
      human > orc
        ? 'Human wins!'
        : orc > human
        ? 'Orc wins!'
        : "It's a draw!";
    btnLabel = 'Play Again';
  } else {
    title = 'Half Time!';
    body = `Score: Human ${human} – ${orc} Orc`;
    btnLabel = 'Start 2nd Half';
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal__title">{title}</h2>
        <p className="modal__desc">{body}</p>
        <p className="modal__desc" style={{ fontSize: '1.4rem' }}>
          {human} – {orc}
        </p>
        <button className="modal__roll-btn" onClick={onContinue}>
          {btnLabel}
        </button>
      </div>
    </div>
  );
}
