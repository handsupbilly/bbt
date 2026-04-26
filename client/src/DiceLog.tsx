import type { DiceLogEntry } from './types';
import './DiceLog.css';

interface Props {
  log: DiceLogEntry[];
  pendingProb: number;       // probability of pending (not-yet-rolled) dodges
  pendingTargets: number[];  // targets queued but not yet rolled
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function fraction(target: number): string {
  const successes = 7 - target;
  return `${successes}/6`;
}

const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceLog({ log, pendingProb, pendingTargets }: Props) {
  // Combined probability of all rolled successes so far
  const rolledProb = log.length > 0 ? log[log.length - 1].cumulativeProb : 1;
  // Overall probability including pending (not yet rolled) dodges
  const overallProb = rolledProb * pendingProb;

  const hasPending = pendingTargets.length > 0;
  const hasAnything = log.length > 0 || hasPending;

  if (!hasAnything) return null;

  return (
    <div className="dice-log">
      <div className="dice-log__title">Dice Log</div>

      {log.map((entry, i) => (
        <div key={i} className={`dice-log__entry ${entry.success ? 'dice-log__entry--success' : 'dice-log__entry--fail'}`}>
          <span className="dice-log__face">{FACE[entry.roll]}</span>
          <span className="dice-log__detail">
            {entry.roll} vs {entry.target}+
          </span>
          <span className={`dice-log__badge ${entry.success ? 'dice-log__badge--ok' : 'dice-log__badge--fail'}`}>
            {entry.success ? '✓' : '✗'}
          </span>
        </div>
      ))}

      {hasPending && (
        <div className="dice-log__pending">
          {pendingTargets.map((t, i) => (
            <div key={i} className="dice-log__entry dice-log__entry--pending">
              <span className="dice-log__face">?</span>
              <span className="dice-log__detail">{t}+ ({fraction(t)})</span>
              <span className="dice-log__badge dice-log__badge--pending">…</span>
            </div>
          ))}
        </div>
      )}

      <div className="dice-log__prob">
        <span className="dice-log__prob-label">Turn probability</span>
        <span className={`dice-log__prob-value ${overallProb < 0.5 ? 'dice-log__prob-value--risky' : ''}`}>
          {pct(overallProb)}
        </span>
      </div>
    </div>
  );
}
