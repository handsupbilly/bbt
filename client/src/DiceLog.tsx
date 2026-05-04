import type { ActionLogEntry } from './types';
import './DiceLog.css';

interface Props {
  log: ActionLogEntry[];
  pendingProb: number;
  pendingTargets: number[];
}

function pct(p: number): string { return `${(p * 100).toFixed(1)}%`; }
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

function cumFraction(log: ActionLogEntry[]): string {
  let num = 1, den = 1;
  for (const e of log) {
    if (e.kind === 'handoff')    { num *= (7 - e.catchTarget); den *= 6; continue; }
    if (e.kind === 'pass')       { num *= (7 - e.passTarget);  den *= 6; continue; }
    if (e.kind === 'pass-catch') { num *= (7 - e.catchTarget); den *= 6; continue; }
    if (e.isGfi) { num *= 5; den *= 6; }
    if (e.dodgeTarget !== null) { num *= (7 - e.dodgeTarget); den *= 6; }
  }
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}

const BAND_LABEL: Record<string, string> = {
  quick: 'Quick', short: 'Short', long: 'Long', bomb: 'Bomb',
};

function colLabel(col: number): string { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }): string { return `${colLabel(p.col)}${p.row + 1}`; }

function entryClass(e: ActionLogEntry): string {
  if (e.kind === 'handoff')    return 'dice-log__entry--handoff';
  if (e.kind === 'pass')       return 'dice-log__entry--pass';
  if (e.kind === 'pass-catch') return 'dice-log__entry--pass-catch';
  if (e.isGfi && e.dodgeTarget !== null) return 'dice-log__entry--gfi-dodge';
  if (e.isGfi) return 'dice-log__entry--gfi';
  if (e.dodgeTarget !== null) return 'dice-log__entry--dodge';
  return 'dice-log__entry--move';
}

export function DiceLog({ log, pendingProb }: Props) {
  if (log.length === 0) return null;

  const lastCumProb = log[log.length - 1].cumulativeProb;
  const overallProb = lastCumProb * pendingProb;
  const hasRoll = log.some(e => e.kind === 'handoff' || e.kind === 'pass' || e.kind === 'pass-catch' || e.isGfi || e.dodgeTarget !== null);

  return (
    <div className="dice-log">
      <div className="dice-log__title">Action Log</div>

      {log.map((entry, i) => (
        <div key={i} className={`dice-log__entry ${entryClass(entry)}`}>
          <span className="dice-log__icon">→</span>
          <span className="dice-log__detail">
            <span className="dice-log__piece">
              {entry.kind === 'handoff'
                ? `${entry.pieceName} → ${entry.receiverName}`
                : entry.kind === 'pass'
                ? `${entry.pieceName} → ${entry.receiverName}`
                : entry.pieceName}
            </span>
            {' '}{posLabel(entry.from)} → {posLabel(entry.to)}
          </span>
          {entry.kind === 'handoff' ? (
            <span className="dice-log__prob">
              <span className="dice-log__handoff-tag">Catch {entry.catchTarget}+</span>
              {' '}<span className="dice-log__prob-pct">({pct(entry.actionProb)})</span>
            </span>
          ) : entry.kind === 'pass' ? (
            <span className="dice-log__prob">
              <span className="dice-log__pass-tag">{BAND_LABEL[entry.rangeBand]} {entry.passTarget}+</span>
              {' '}<span className="dice-log__prob-pct">({pct(entry.actionProb)})</span>
            </span>
          ) : entry.kind === 'pass-catch' ? (
            <span className="dice-log__prob">
              <span className="dice-log__pass-catch-tag">Catch {entry.catchTarget}+</span>
              {' '}<span className="dice-log__prob-pct">({pct(entry.actionProb)})</span>
            </span>
          ) : (entry.isGfi || entry.dodgeTarget !== null) && (
            <span className="dice-log__prob">
              {entry.isGfi && <span className="dice-log__gfi-tag">GFI 2+</span>}
              {entry.dodgeTarget !== null && (
                <span>{entry.dodgeTarget}+ <span className="dice-log__prob-pct">({pct(entry.actionProb)})</span></span>
              )}
              {entry.isGfi && entry.dodgeTarget === null && (
                <span className="dice-log__prob-pct">({pct(entry.actionProb)})</span>
              )}
            </span>
          )}
        </div>
      ))}

      {hasRoll && (
        <div className="dice-log__prob-row">
          <span className="dice-log__prob-label">Cumulative</span>
          <span className={`dice-log__prob-total ${overallProb < 0.5 ? 'dice-log__prob-total--risky' : ''}`}>
            {cumFraction(log)} <span className="dice-log__prob-pct">({pct(overallProb)})</span>
          </span>
        </div>
      )}
    </div>
  );
}
