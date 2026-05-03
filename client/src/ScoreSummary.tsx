import type { LeaderboardEntry } from './types';
import './ScoreSummary.css';

interface Props {
  entry: LeaderboardEntry;
  onBack: () => void;
}

function pct(p: number) { return `${(p * 100).toFixed(1)}%`; }
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
function cumFraction(moves: LeaderboardEntry['moves']): string {
  let num = 1, den = 1;
  for (const m of moves) {
    if (m.isGfi) { num *= 5; den *= 6; }
    if (m.dodgeTarget !== null) { num *= (7 - m.dodgeTarget); den *= 6; }
  }
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}
function colLabel(col: number) { return String.fromCharCode(65 + col); }
function posLabel(p: { col: number; row: number }) { return `${colLabel(p.col)}${p.row + 1}`; }
function actionLabel(m: LeaderboardEntry['moves'][number]): string {
  if (m.isGfi && m.dodgeTarget !== null) return `GFI 2+ · Dodge ${m.dodgeTarget}+`;
  if (m.isGfi) return 'Go For It 2+';
  return `Dodge ${m.dodgeTarget}+`;
}
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

export function ScoreSummary({ entry, onBack }: Props) {
  const moves = entry.moves ?? [];
  const cumProb = moves.length > 0 ? moves[moves.length - 1].cumulativeProb : entry.probability;

  return (
    <div className="score-summary">
      <div className="score-summary__header">
        <button className="lb-back-btn" onClick={onBack}>← Back</button>
        <div>
          <h2 className="score-summary__name">{entry.name}</h2>
          <p className="score-summary__meta">
            {new Date(entry.date).toLocaleDateString()} · {pct(entry.probability)}
          </p>
        </div>
      </div>

      {moves.length === 0 ? (
        <p className="score-summary__empty">No move data available for this entry.</p>
      ) : (
        <div className="score-summary__moves">
          <div className="score-summary__moves-header">
            <span>Player</span>
            <span>Type</span>
            <span>Move</span>
            <span>Action</span>
            <span className="score-summary__col-right">Chance</span>
          </div>
          {moves.map((m, i) => (
            <div key={i} className="score-summary__move-row">
              <span className="score-summary__move-name">{m.pieceName}</span>
              <span className="score-summary__move-role">{capitalize(m.pieceRole)}</span>
              <span className="score-summary__move-pos">{posLabel(m.from)} → {posLabel(m.to)}</span>
              <span className="score-summary__move-action">{actionLabel(m)}</span>
              <span className="score-summary__move-prob">{pct(m.actionProb)}</span>
            </div>
          ))}
          <div className="score-summary__cum-row">
            <span className="score-summary__cum-label">Cumulative probability</span>
            <span className={`score-summary__cum-value${cumProb < 0.5 ? ' score-summary__cum-value--risky' : ''}`}>
              {cumFraction(moves)} <span className="score-summary__cum-pct">({pct(cumProb)})</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
