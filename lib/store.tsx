'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { analyzeIncident } from './ai-engine';
import { FLOOD_ZONES, INITIAL_CHECKPOINTS, INITIAL_EQUIPMENT, INITIAL_INCIDENTS, TEAMS } from './mock-data';
import { nearestNode } from './road-network';
import type { Checkpoint, EquipmentStock, FloodZone, Incident, Referral, ReferralChannel, ReferralStatus, ReportInput, Team } from './types';

interface State {
  checkpoints: Checkpoint[];
  incidents: Incident[];
  teams: Team[];
  equipment: EquipmentStock[];
  live: boolean;
  lastUpdate: number | null;
}

type Action =
  | { type: 'tick'; index: number; delta: number; at: number }
  | { type: 'report'; checkpoint: Checkpoint; incident: Incident | null }
  | { type: 'dispatch'; id: string; teamIds: string[]; equipment: Record<string, number>; at: number }
  | { type: 'rescue'; id: string; at: number }
  | { type: 'reopen'; id: string }
  | { type: 'refer'; id: string; referral: Referral }
  | { type: 'referralStatus'; id: string; referralId: string; status: ReferralStatus; at: number }
  | { type: 'live'; value: boolean };

function release(state: State, inc: Incident): Pick<State, 'teams' | 'equipment'> {
  return {
    teams: state.teams.map((t) => (inc.assignedTeamIds.includes(t.id) ? { ...t, status: 'available' as const } : t)),
    equipment: state.equipment.map((e) => ({
      ...e,
      available: Math.min(e.total, e.available + (inc.assignedEquipment[e.id] ?? 0)),
    })),
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'tick': {
      const target = state.checkpoints[a.index % state.checkpoints.length];
      const depthCm = Math.max(0, Math.min(150, target.depthCm + a.delta));
      return {
        ...state,
        lastUpdate: a.at,
        checkpoints: state.checkpoints.map((c) => (c.id === target.id ? { ...c, depthCm, updatedAt: a.at } : c)),
      };
    }
    case 'report':
      return {
        ...state,
        lastUpdate: a.checkpoint.updatedAt,
        checkpoints: [...state.checkpoints, a.checkpoint],
        incidents: a.incident ? [a.incident, ...state.incidents] : state.incidents,
      };
    case 'dispatch': {
      const inc = state.incidents.find((i) => i.id === a.id);
      if (!inc || inc.status !== 'pending') return state;
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === a.id
            ? { ...i, status: 'dispatched', assignedTeamIds: a.teamIds, assignedEquipment: a.equipment, dispatchedAt: a.at }
            : i,
        ),
        teams: state.teams.map((t) => (a.teamIds.includes(t.id) ? { ...t, status: 'busy' as const } : t)),
        equipment: state.equipment.map((e) => ({ ...e, available: Math.max(0, e.available - (a.equipment[e.id] ?? 0)) })),
      };
    }
    case 'rescue': {
      const inc = state.incidents.find((i) => i.id === a.id);
      if (!inc) return state;
      const rel = inc.status === 'dispatched' ? release(state, inc) : {};
      return {
        ...state,
        ...rel,
        incidents: state.incidents.map((i) => (i.id === a.id ? { ...i, status: 'rescued', rescuedAt: a.at } : i)),
      };
    }
    case 'reopen': {
      const inc = state.incidents.find((i) => i.id === a.id);
      if (!inc) return state;
      const rel = inc.status === 'dispatched' ? release(state, inc) : {};
      return {
        ...state,
        ...rel,
        incidents: state.incidents.map((i) =>
          i.id === a.id ? { ...i, status: 'pending', assignedTeamIds: [], assignedEquipment: {}, dispatchedAt: undefined, rescuedAt: undefined } : i,
        ),
      };
    }
    case 'refer':
      return {
        ...state,
        incidents: state.incidents.map((i) => (i.id === a.id ? { ...i, referrals: [...(i.referrals ?? []), a.referral] } : i)),
      };
    case 'referralStatus':
      return {
        ...state,
        incidents: state.incidents.map((i) =>
          i.id === a.id
            ? { ...i, referrals: (i.referrals ?? []).map((r) => (r.id === a.referralId ? { ...r, status: a.status, updatedAt: a.at } : r)) }
            : i,
        ),
      };
    case 'live':
      return { ...state, live: a.value };
  }
}

interface Store extends State {
  zones: FloodZone[];
  addReport: (input: ReportInput) => { checkpoint: Checkpoint; incident: Incident | null };
  dispatchIncident: (id: string, teamIds: string[], equipment: Record<string, number>) => void;
  markRescued: (id: string) => void;
  reopen: (id: string) => void;
  addReferral: (incidentId: string, agencyId: string, channel: ReferralChannel) => void;
  setReferralStatus: (incidentId: string, referralId: string, status: ReferralStatus) => void;
  setLive: (v: boolean) => void;
}

const Ctx = createContext<Store | null>(null);

export function FloodStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    checkpoints: INITIAL_CHECKPOINTS,
    incidents: INITIAL_INCIDENTS,
    teams: TEAMS,
    equipment: INITIAL_EQUIPMENT,
    live: true,
    lastUpdate: null,
  });

  // Simulated real-time feed: every few seconds a random checkpoint's depth drifts by a few cm.
  useEffect(() => {
    if (!state.live) return;
    const id = setInterval(() => {
      dispatch({
        type: 'tick',
        index: Math.floor(Math.random() * 1000),
        delta: Math.round((Math.random() - 0.45) * 6),
        at: Date.now(),
      });
    }, 8000);
    return () => clearInterval(id);
  }, [state.live]);

  const addReport = useCallback((input: ReportInput) => {
    const at = Date.now();
    const node = nearestNode([input.lng, input.lat]);
    const checkpoint: Checkpoint = {
      id: `cp-${at}`,
      name: input.locationName || `ใกล้${node.name}`,
      district: node.district,
      lng: input.lng,
      lat: input.lat,
      depthCm: input.depthCm,
      source: 'citizen',
      updatedAt: at,
    };
    const hasRescue = input.needs.length > 0 || input.hazards.length > 0;
    const incident: Incident | null = hasRescue
      ? {
          id: `i-${at}`,
          reporter: input.reporter || 'ไม่ระบุชื่อ',
          phone: input.phone,
          locationName: checkpoint.name,
          district: node.district,
          lng: input.lng,
          lat: input.lat,
          depthCm: input.depthCm,
          passability: input.passability,
          needs: input.needs,
          hazards: input.hazards,
          people: input.people,
          note: input.note,
          photos: input.photos,
          photoReviews: input.photoReviews,
          createdAt: at,
          status: 'pending',
          recommendation: analyzeIncident(input),
          assignedTeamIds: [],
          assignedEquipment: {},
        }
      : null;
    dispatch({ type: 'report', checkpoint, incident });
    return { checkpoint, incident };
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      zones: FLOOD_ZONES,
      addReport,
      dispatchIncident: (id, teamIds, equipment) => dispatch({ type: 'dispatch', id, teamIds, equipment, at: Date.now() }),
      markRescued: (id) => dispatch({ type: 'rescue', id, at: Date.now() }),
      reopen: (id) => dispatch({ type: 'reopen', id }),
      addReferral: (id, agencyId, channel) => {
        const at = Date.now();
        dispatch({ type: 'refer', id, referral: { id: `r-${at}-${agencyId}`, agencyId, channel, status: 'sent', at, updatedAt: at } });
      },
      setReferralStatus: (id, referralId, status) => dispatch({ type: 'referralStatus', id, referralId, status, at: Date.now() }),
      setLive: (v) => dispatch({ type: 'live', value: v }),
    }),
    [state, addReport],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFloodStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFloodStore must be used inside FloodStoreProvider');
  return v;
}
