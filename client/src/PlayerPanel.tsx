import type { PlayerPiece } from './types';
import './PlayerPanel.css';

interface Props {
  piece: PlayerPiece | null;
  side: 'left' | 'right';
}

interface StatRowProps {
  label: string;
  value: string | number;
  title: string;
}

function StatRow({ label, value, title }: StatRowProps) {
  return (
    <div className="panel__stat" title={title}>
      <span className="panel__stat-label">{label}</span>
      <span className="panel__stat-value">{value}</span>
    </div>
  );
}

export function PlayerPanel({ piece, side }: Props) {
  return (
    <aside className={`panel panel--${side} ${piece ? `panel--${piece.team}` : 'panel--empty'}`}>
      {piece ? (
        <>
          <div className="panel__header">
            <div className={`panel__avatar panel__avatar--${piece.team}`} />
            <div className="panel__identity">
              <div className="panel__name">{piece.name}</div>
              <div className="panel__team">
                {piece.team === 'human' ? 'Human Team' : 'Orc Team'}
              </div>
            </div>
          </div>

          <div className="panel__divider" />

          <div className="panel__stats">
            <StatRow label="MA" value={piece.ma} title="Movement Allowance — squares moved per turn" />
            <StatRow label="ST" value={piece.st} title="Strength — used for block dice" />
            <StatRow label="AG" value={piece.ag} title="Agility — used for catching, dodging" />
            <StatRow label="AV" value={piece.av} title="Armour Value — resistance to injury" />
          </div>

          {piece.skills.length > 0 && (
            <>
              <div className="panel__divider" />
              <div className="panel__skills-label">Skills</div>
              <div className="panel__skills">
                {piece.skills.map(s => (
                  <span key={s} className="panel__skill">{s}</span>
                ))}
              </div>
            </>
          )}

          <div className="panel__divider" />

          <div className="panel__status">
            {piece.activated
              ? <span className="panel__status--done">Activated</span>
              : <span className="panel__status--ready">Ready</span>}
          </div>
        </>
      ) : (
        <div className="panel__empty">
          {side === 'left'
            ? 'Select your piece'
            : 'Hover over opponent'}
        </div>
      )}
    </aside>
  );
}
