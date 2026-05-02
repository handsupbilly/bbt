import { useEffect, useState } from 'react';
import { fetchLeaderboard } from './api';
import type { LeaderboardEntry, Scenario } from './types';

import './Leaderboard.css';

interface Props {
  scenario: Scenario;
  onBack: () => void;
  highlightId?: string;
  initialEntries?: LeaderboardEntry[]; // pre-fetched after submit — skip internal fetch
}

function pct(p: number) { return `${Math.round(p * 100)}%`; }

export function Leaderboard({ scenario, onBack, highlightId, initialEntries }: Props) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries ?? []);
  const [loading, setLoading] = useState(!initialEntries);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialEntries) return; // already have fresh data from submit
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchLeaderboard(scenario.id);
        setEntries(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Load failed: ${msg} [${scenario.id}]`);
      } finally {
        setLoading(false);
      }
    })();
  }, [scenario.id, initialEntries]);

  return (
    <div className="leaderboard">
      <div className="leaderboard__header">
        <button className="lb-back-btn" onClick={onBack}>← Back</button>
        <div>
          <h2 className="leaderboard__title">{scenario.name}</h2>
          <p className="leaderboard__subtitle">Top plays by success probability</p>
        </div>
      </div>

      {loading && <div className="leaderboard__state">Loading…</div>}
      {error   && <div className="leaderboard__state leaderboard__state--error">{error}</div>}

      {!loading && !error && entries.length === 0 && (
        <div className="leaderboard__state">No scores yet — be the first!</div>
      )}

      {!loading && !error && entries.length > 0 && (
        <table className="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Probability</th>
              <th>Dice rolls</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id} className={e.id === highlightId ? 'lb-table__row--highlight' : ''}>
                <td className="lb-table__rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </td>
                <td className="lb-table__name">{e.name}</td>
                <td className="lb-table__prob">{pct(e.probability)}</td>
                <td className="lb-table__dice">{e.diceCount}</td>
                <td className="lb-table__date">{new Date(e.date).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
