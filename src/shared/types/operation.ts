export type OperationStatus =
  | 'planning'
  | 'briefing'
  | 'deploying'
  | 'active'
  | 'paused'
  | 'recovering'
  | 'completed'
  | 'aborted';

export interface Operation {
  id: string;
  venueId: string;
  kitId: string;
  name: string;
  status: OperationStatus;
  principalId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  activeDrones: number;
  totalAlerts: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
