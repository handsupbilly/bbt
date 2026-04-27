import type { ActionLogEntry } from './types';
import './DiceLog.css';

interface Props {
  log: ActionLogEntry[];
  pendingProb: number;
  pendingTargets: number[];
}

function pct(p: number): string { return `${(p * 100).toFixed(1)}%`; }
function colLabel(col: number): string { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }): string { return `${colLabel(p.col)}${p.row + 1}`; }

export function DiceLog({ log, pendingProb }: Props) {
  if (log.length === 0) return null;

  const lastCumProb = log.length > 0 ? log[log.length - 1].cumulativeProb : 1;
  const overallProb = lastCumProb * pendingProb;
  const hasDodge = log.some(e => e.dodgeTarget !== null);

  return (
    <div className="dice-log">
      <div className="dice-log__title">Action Log</div>

      {log.map((entry, i) => (
        <div key={i} className={`dice-log__entry ${entry.dodgeTarget !== null ? 'dice-log__entry--dodge' : 'dice-log__entry--move'}`}>
          <span className="dice-log__icon">→</span>
          <span className="dice-log__detail">
            <span className="dice-log__piece">{entry.pieceName}</span>
            {' '}{posLabel(entry.from)} → {posLabel(entry.to)}
            {' '}<span className="dice-log__ma">({entry.steps} sq)</span>
          </span>
          {entry.dodgeTarget !== null && (
            <span className="dice-log__prob">
              {entry.dodgeTarget}+ <span className="dice-log__prob-pct">({pct(entry.actionProb)})</span>
            </span>
          )}
        </div>
      ))}

      {hasDodge && (
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
