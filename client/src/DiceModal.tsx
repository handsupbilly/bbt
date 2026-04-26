import type { DiceResult, PendingDodge } from './types';
import './DiceModal.css';

interface Props {
  pending: PendingDodge;
  lastResult: DiceResult | null;
  onRoll: () => void;
  onDismiss: () => void; // after result shown, continue
}

const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceModal({ pending, lastResult, onRoll, onDismiss }: Props) {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2 className="modal__title">Dodge Roll Required</h2>
        <p className="modal__desc">
          Moving into a tackle zone — roll <strong>{pending.target}+</strong> on a D6 to dodge.
        </p>

        {!lastResult ? (
          <button className="modal__roll-btn" onClick={onRoll}>
            Roll D6
          </button>
        ) : (
          <>
            <div className={`modal__die ${lastResult.success ? 'modal__die--success' : 'modal__die--fail'}`}>
              {FACE[lastResult.roll]}
            </div>
            <p className={`modal__result ${lastResult.success ? 'modal__result--success' : 'modal__result--fail'}`}>
              {lastResult.success
                ? `Rolled ${lastResult.roll} — Dodge successful!`
                : `Rolled ${lastResult.roll} — Dodge failed! Piece stays put.`}
            </p>
            <button className="modal__continue-btn" onClick={onDismiss}>
              Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
