export type Stat = 'ship' | 'crew' | 'supplies' | 'readiness';
export type Stats = Record<Stat, number>;
export type ProjectId = 'agriculture' | 'fabrication' | 'training' | 'radiation' | 'europa';

export interface Effect {
  stats?: Partial<Stats>;
  science?: number;
  delay?: number;
  addFlag?: string;
  removeFlag?: string;
  followUp?: { eventId: string; afterMonths: number; chance?: number };
}

export interface Choice {
  id: string;
  label: string;
  description: string;
  outcome: string;
  effect: Effect;
  requiresProject?: ProjectId;
  requiresActiveProject?: boolean;
  requiresFlag?: string;
}

export interface VoyageEvent {
  id: string;
  category: string;
  title: string;
  body: string;
  choices: Choice[];
  minMonth?: number;
  maxMonth?: number;
  weight?: number;
  requiresFlag?: string;
  followUpOnly?: boolean;
}

export interface Project {
  id: ProjectId;
  name: string;
  duration: number;
  description: string;
  benefit: string;
  completion: Effect;
}

export interface LogEntry {
  month: number;
  title: string;
  text: string;
  kind: 'project' | 'choice' | 'consequence' | 'routine';
  changes?: Partial<Stats>;
}

export interface GameState {
  seed: string;
  rng: number;
  month: number;
  phase: 'ready' | 'decision' | 'arrived' | 'failed';
  stats: Stats;
  activeProject: { id: ProjectId; progress: number; delay: number } | null;
  completedProjects: ProjectId[];
  science: number;
  flags: string[];
  pending: { dueMonth: number; eventId: string }[];
  seenEvents: string[];
  currentEventId: string | null;
  log: LogEntry[];
}
