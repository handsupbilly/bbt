import type { Scenario } from '../types';

// Load all scenario JSON files at build time
const modules = import.meta.glob<Scenario>('./*.json', { eager: true });

export const scenarios: Scenario[] = Object.values(modules).sort((a, b) =>
  a.id.localeCompare(b.id)
);

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find(s => s.id === id);
}
