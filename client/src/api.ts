import type { LeaderboardEntry, RiskyMove } from './types';

const BASE = '/api';

export async function fetchLeaderboard(scenarioId: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${BASE}/leaderboard/${scenarioId}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ''}`);
  }
  return res.json();
}

export async function submitScore(
  scenarioId: string,
  name: string,
  probability: number,
  diceCount: number,
  moves: RiskyMove[],
): Promise<LeaderboardEntry> {
  const res = await fetch(`${BASE}/leaderboard/${scenarioId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, probability, diceCount, moves }),
  });
  if (!res.ok) throw new Error('Failed to submit score');
  return res.json();
}
