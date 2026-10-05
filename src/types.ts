export type CardType = 'Work' | 'Ops' | 'Cargo' | 'Burden';
export type CargoFamily = 'habitat' | 'industry' | 'science';
export type CardId =
  | 'crew-shift' | 'specialist-shift' | 'expert-shift' | 'colony-stores'
  | 'habitation-modules' | 'industrial-core' | 'europa-instruments'
  | 'streamlining' | 'crew-sync' | 'integrated-diagnostics' | 'salvage'
  | 'cross-training' | 'parallel-programs' | 'rapid-prototyping'
  | 'load-balancing' | 'systems-integration' | 'predictive-maintenance'
  | 'crew-reassignment' | 'watch-coordination' | 'archive-access' | 'cargo-reallocation'
  | 'logistics-network' | 'batch-preparation' | 'equipment-drills' | 'contingency-shift'
  | 'fatigue' | 'repair-backlog' | 'exposure-monitoring' | 'crew-conflict' | 'medical-followup';

export interface CardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  cost: number;
  text: string;
  flavor: string;
  points?: number;
  cargoFamily?: CargoFamily;
  available?: boolean;
  effect?: {
    draw?: number;
    ops?: number;
    work?: number;
    buys?: number;
    conditionalWork?: 'cargo' | 'burden';
    special?: 'retire' | 'salvage' | 'gain-ops' | 'discard-redraw' | 'upgrade' | 'inspect'
      | 'crew-retire' | 'watch-discard' | 'retrieve' | 'cargo-reallocate' | 'logistics-retrieve';
  };
}

export interface CardInstance { uid: number; id: CardId }

export type EventEffect =
  | { kind: 'discard-or-burden'; count: number; cardType?: CardType; burden: CardId }
  | { kind: 'restricted-ops'; available: number }
  | { kind: 'gain-burden'; burden: CardId }
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
  workCost: number;
  workText: string;
  cargoFamily: CargoFamily;
  cargoText: string;
  burden: CardId;
  burdenCount: number;
  deferText: string;
}

export type Encounter = { kind: 'cruise' } | { kind: 'event' | 'crisis'; id: string };

export type PendingChoice =
  | { kind: 'retire'; source: CardId; min: number; max: number; bonusCargoWork?: number; upgrade?: boolean; requiredId?: CardId; drawOnRetire?: number }
  | { kind: 'discard'; source: CardId | 'event'; min: number; max: number; redraw: boolean; requiredType?: CardType; requiredTypes?: CardType[]; drawPerCard?: number; retrieveAfter?: boolean }
  | { kind: 'retrieve'; source: CardId; min: number; max: number; requiredTypes?: CardType[] }
  | { kind: 'gain'; source: CardId; maxCost: number; requiredType?: CardType }
  | { kind: 'inspect'; source: CardId; cards: CardInstance[] };

export type ChoiceResolution =
  | { type: 'cards'; uids: number[] }
  | { type: 'gain'; cardId: CardId }
  | { type: 'inspect'; retire: number[]; discard: number[]; keep: number[] };

export interface LogEntry {
  month: number;
  kind: 'turn' | 'card' | 'purchase' | 'event' | 'crisis' | 'retirement' | 'arrival';
  arrivalTurn?: number;
  title: string;
  text: string;
}

export interface CrisisResult {
  month: number;
  id: string;
  response: 'work' | 'cargo' | 'defer';
  workSpent: number;
  cargoSpent: CardId | null;
  burdensAdded: number;
}

export interface GameState {
  seed: string;
  rng: number;
  nextUid: number;
  month: number;
  totalMonths: number;
  phase: 'briefing' | 'event' | 'ops' | 'work' | 'crisis' | 'buy' | 'report' | 'arrival-ready' | 'arrival-report' | 'arrival' | 'arrived';
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  inPlay: CardInstance[];
  retired: CardInstance[];
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
  crisisWindow: { id: string; opened: number; deadline: number } | null;
  arrival: ArrivalState | null;
  log: LogEntry[];
}

export type ArrivalObjective = 'trajectory' | 'ship' | 'surface';
export interface ArrivalState {
  turn: number;
  status: 'active' | 'complete';
  progress: Record<ArrivalObjective, number>;
  deployed: CardInstance[];
  sacrificed: CardId[];
  damage: number;
  fatigueTax: number;
}
