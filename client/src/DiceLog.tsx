import type { ActionLogEntry } from './types';
import { successChance } from './useGameState';
import './DiceLog.css';

interface Props {
  log: ActionLogEntry[];
  pendingProb: number;
  pendingTargets: number[];
}

function pct(p: number): string { return `${(p * 100).toFixed(1)}%`; }
function colLabel(col: number): string { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }): string { return `${colLabel(p.col)}${p.row + 1}`; }

export function DiceLog({ log, pendingProb, pendingTargets }: Props) {
  const hasPending = pendingTargets.length > 0;
  if (log.length === 0 && !hasPending) return null;

  const lastCumProb = log.length > 0 ? log[log.length - 1].cumulativeProb : 1;
  const overallProb = lastCumProb * pendingProb;

  return (
    <div className="dice-log">
      <div className="dice-log__title">Action Log</div>

      {log.map((entry, i) => {
        const prevCumProb = i === 0 ? 1 : log[i - 1].cumulativeProb;
        const actionProb = entry.cumulativeProb / prevCumProb;
        const showProb = actionProb < 0.9999;

        return (
          <div key={i} className="dice-log__entry dice-log__entry--move">
            <span className="dice-log__icon">→</span>
            <span className="dice-log__detail">
              <span className="dice-log__piece">{entry.pieceName}</span>
              {' '}{posLabel(entry.from)} → {posLabel(entry.to)}
              {' '}<span className="dice-log__ma">({entry.steps} sq)</span>
            </span>
            {showProb && entry.dodgeTarget !== null && (
              <span className="dice-log__prob">
                {entry.dodgeTarget}+ <span className="dice-log__prob-pct">({pct(actionProb)})</span>
              </span>
            )}
          </div>
        );
      })}

      {hasPending && pendingTargets.map((t, i) => (
        <div key={`p${i}`} className="dice-log__entry dice-log__entry--pending">
          <span className="dice-log__icon">?</span>
          <span className="dice-log__detail">Dodge {t}+ ({pct(successChance(t))})</span>
          <span className="dice-log__badge dice-log__badge--pending">…</span>
        </div>
      ))}

      {(log.some(e => e.dodgeTarget !== null) || hasPending) && (
        <div className="dice-log__prob-row">
          <span className="dice-log__prob-label">Cumulative probability</span>
          <span className={`dice-log__prob-total ${overallProb < 0.5 ? 'dice-log__prob-total--risky' : ''}`}>
            {pct(overallProb)}
          </span>
        </div>
      )}
    </div>
  );
}
