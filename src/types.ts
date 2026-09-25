export type CardType = 'Work' | 'Ops' | 'Cargo' | 'Burden';
export type CardId =
  | 'crew-shift' | 'specialist-shift' | 'expert-shift' | 'colony-stores'
  | 'habitation-modules' | 'industrial-core'
  | 'streamlining' | 'crew-sync' | 'integrated-diagnostics' | 'salvage'
  | 'cross-training' | 'parallel-programs' | 'rapid-prototyping'
  | 'load-balancing' | 'systems-integration' | 'predictive-maintenance'
  | 'fatigue' | 'repair-backlog' | 'exposure-monitoring' | 'crew-conflict' | 'medical-followup';

export interface CardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  cost: number;
  supply: number;
  text: string;
  flavor: string;
  points?: number;
  effect?: {
    draw?: number;
    ops?: number;
    work?: number;
    buys?: number;
    special?: 'retire' | 'salvage' | 'gain-ops' | 'discard-redraw' | 'upgrade' | 'inspect';
  };
}

export interface CardInstance { uid: number; id: CardId }

export type EventEffect =
  | { kind: 'discard-or-burden'; count: number; cardType?: CardType; burden: CardId }
  | { kind: 'restricted-ops'; available: number }
  | { kind: 'short-hand'; cards: number };

export interface VoyageEvent {
  id: string;
  name: string;
  description: string;
  rule: string;
  effect: EventEffect;
}

export interface Crisis {
  id: string;
  name: string;
  description: string;
  handSize: number;
  requiredOps: number;
  requiredWork: number;
  burden: CardId;
  successText: string;
  failureText: string;
}

export type Encounter = { kind: 'cruise' } | { kind: 'event' | 'crisis'; id: string };

export type PendingChoice =
  | { kind: 'retire'; source: CardId; min: number; max: number; bonusCargoWork?: number; upgrade?: boolean }
  | { kind: 'discard'; source: CardId | 'event'; min: number; max: number; redraw: boolean; requiredType?: CardType }
  | { kind: 'gain'; source: CardId; maxCost: number; requiredType?: CardType }
  | { kind: 'inspect'; source: CardId; cards: CardInstance[] };

export type ChoiceResolution =
  | { type: 'cards'; uids: number[] }
  | { type: 'gain'; cardId: CardId }
  | { type: 'inspect'; retire: number[]; discard: number[]; keep: number[] };

export interface LogEntry {
  month: number;
  kind: 'turn' | 'card' | 'purchase' | 'event' | 'crisis' | 'retirement';
  title: string;
  text: string;
}

export interface CrisisResult {
  month: number;
  id: string;
  success: boolean;
  work: number;
  ops: number;
}

export interface GameState {
  seed: string;
  rng: number;
  nextUid: number;
  month: number;
  totalMonths: number;
  phase: 'briefing' | 'event' | 'ops' | 'work' | 'buy' | 'report' | 'arrived';
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  inPlay: CardInstance[];
  retired: CardInstance[];
  supply: Partial<Record<CardId, number>>;
  ops: number;
  buys: number;
  work: number;
  workGenerated: number;
  opsPlayed: number;
  pending: PendingChoice | null;
  encounter: Encounter;
  eventQueue: string[];
  allowedOps: CardId[] | null;
  crisisResults: CrisisResult[];
  log: LogEntry[];
}
