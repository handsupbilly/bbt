import type { LeaderboardEntry } from './types';

const BASE = '/api';

export async function fetchLeaderboard(scenarioId: string): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${BASE}/leaderboard/${scenarioId}`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function submitScore(
  scenarioId: string,
  name: string,
  probability: number,
  diceCount: number,
): Promise<LeaderboardEntry> {
  const res = await fetch(`${BASE}/leaderboard/${scenarioId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, probability, diceCount }),
  });
  if (!res.ok) throw new Error('Failed to submit score');
  return res.json();
}
