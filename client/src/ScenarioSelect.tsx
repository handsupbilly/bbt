import { scenarios } from './scenarios';
import type { Scenario } from './types';
import './ScenarioSelect.css';

interface Props {
  onPlay: (scenario: Scenario) => void;
  onLeaderboard: (scenario: Scenario) => void;
  onFreePlay: () => void;
}

export function ScenarioSelect({ onPlay, onLeaderboard, onFreePlay }: Props) {
  return (
    <div className="scenario-select">
      <div className="scenario-select__header">
        <h1 className="scenario-select__title">Blood Bowl Tactics</h1>
        <p className="scenario-select__subtitle">
          Plan the perfect play. Compete for the highest probability touchdown.
        </p>
      </div>

      <div className="scenario-select__list">
        {scenarios.map(s => (
          <div key={s.id} className="scenario-card">
            <div className="scenario-card__body">
              <div className="scenario-card__name">{s.name}</div>
              <div className="scenario-card__desc">{s.description}</div>
              <div className="scenario-card__meta">
                {s.pieces.filter(p => p.team === s.activeTeam).length} attacker
                {s.pieces.filter(p => p.team === s.activeTeam).length !== 1 ? 's' : ''} ·{' '}
                {s.pieces.filter(p => p.team !== s.activeTeam).length} defender
                {s.pieces.filter(p => p.team !== s.activeTeam).length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="scenario-card__actions">
              <button className="btn btn--primary" onClick={() => onPlay(s)}>
                Play
              </button>
              <button className="btn btn--secondary" onClick={() => onLeaderboard(s)}>
                Leaderboard
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="scenario-select__footer">
        <button className="btn btn--ghost" onClick={onFreePlay}>
          Free Play (sandbox)
        </button>
      </div>
    </div>
  );
}
