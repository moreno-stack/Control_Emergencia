export enum IncidentCategory {
  MEDICAL = 'medical',
  FIRE = 'fire',
  CRIME = 'crime',
  TRAFFIC = 'traffic',
  NATURAL_DISASTER = 'natural_disaster',
  OTHER = 'other',
}

export enum IncidentPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IncidentStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CANCELLED = 'cancelled',
}

export const OPEN_STATUSES = [
  IncidentStatus.NEW,
  IncidentStatus.ASSIGNED,
  IncidentStatus.IN_PROGRESS,
];

/** Estados a los que puede pasar un reporte desde su estado actual. */
export const STATUS_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.NEW]: [
    IncidentStatus.ASSIGNED,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.ASSIGNED]: [
    IncidentStatus.NEW,
    IncidentStatus.IN_PROGRESS,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.IN_PROGRESS]: [
    IncidentStatus.ASSIGNED,
    IncidentStatus.RESOLVED,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.RESOLVED]: [],
  [IncidentStatus.CANCELLED]: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}
