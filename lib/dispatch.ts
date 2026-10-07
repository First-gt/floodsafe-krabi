import { haversine } from './geo';
import type { Incident, Skill, Team } from './types';

export interface TeamSuggestion {
  team: Team;
  matches: Skill[];
  distKm: number;
  etaMin: number;
}

/** Rank teams by availability, skill match with the AI recommendation, and proximity. */
export function suggestTeams(incident: Incident, teams: Team[]): TeamSuggestion[] {
  const need = incident.recommendation.skills;
  return teams
    .map((team) => {
      const matches = team.skills.filter((s) => need.includes(s));
      const distKm = haversine([team.lng, team.lat], [incident.lng, incident.lat]) / 1000;
      return { team, matches, distKm, etaMin: Math.round((distKm / 25) * 60 + 5) };
    })
    .sort((a, b) => {
      const av = a.team.status === 'available' ? 1 : 0;
      const bv = b.team.status === 'available' ? 1 : 0;
      if (av !== bv) return bv - av;
      const sa = a.matches.length * 20 - a.distKm;
      const sb = b.matches.length * 20 - b.distKm;
      return sb - sa;
    });
}

/** Greedy pick of up to 3 available teams so every required skill is covered. */
export function autoSelectTeams(suggestions: TeamSuggestion[], required: Skill[]): string[] {
  const picked: string[] = [];
  const covered = new Set<Skill>();
  for (const s of suggestions) {
    if (s.team.status !== 'available') continue;
    const adds = s.matches.filter((m) => !covered.has(m));
    if (adds.length === 0 && picked.length > 0) continue;
    picked.push(s.team.id);
    adds.forEach((m) => covered.add(m));
    if (picked.length >= 3 || required.every((r) => covered.has(r))) break;
  }
  return picked;
}
