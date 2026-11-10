import { canTransition, IncidentStatus } from './incident.enums';

describe('canTransition', () => {
  it('permite el flujo normal de un reporte', () => {
    expect(canTransition(IncidentStatus.NEW, IncidentStatus.ASSIGNED)).toBe(
      true,
    );
    expect(
      canTransition(IncidentStatus.ASSIGNED, IncidentStatus.IN_PROGRESS),
    ).toBe(true);
    expect(
      canTransition(IncidentStatus.IN_PROGRESS, IncidentStatus.RESOLVED),
    ).toBe(true);
  });

  it('no permite saltar a resuelto ni reabrir reportes cerrados', () => {
    expect(canTransition(IncidentStatus.NEW, IncidentStatus.RESOLVED)).toBe(
      false,
    );
    expect(canTransition(IncidentStatus.RESOLVED, IncidentStatus.NEW)).toBe(
      false,
    );
    expect(
      canTransition(IncidentStatus.CANCELLED, IncidentStatus.ASSIGNED),
    ).toBe(false);
  });
});
