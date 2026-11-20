import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { distanceKm, IncidentsService } from './incidents.service';
import { Incident } from './entities/incident.entity';
import { IncidentHistory } from './entities/incident-history.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Env } from '../env.model';
import { Role } from '../common/enums/role.enum';
import {
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
} from '../common/enums/incident.enums';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFn = () => jest.fn<(...args: any[]) => any>();

const citizen = { id: 'ciudadano-1', name: 'Ana', role: Role.CITIZEN } as User;
const otherCitizen = {
  id: 'ciudadano-2',
  name: 'Beto',
  role: Role.CITIZEN,
} as User;
const operator = {
  id: 'operador-1',
  name: 'Olga',
  role: Role.OPERATOR,
} as User;

function buildIncident(changes: Partial<Incident> = {}): Incident {
  return {
    id: 'reporte-1',
    title: 'Incendio en bodega',
    category: IncidentCategory.FIRE,
    description: 'Sale humo negro de una bodega.',
    address: 'Calle 18 # 25-30, Pasto',
    latitude: null,
    longitude: null,
    contactPhone: null,
    priority: IncidentPriority.MEDIUM,
    status: IncidentStatus.NEW,
    createdById: citizen.id,
    assignedToId: null,
    ...changes,
  } as Incident;
}

describe('distanceKm', () => {
  it('es cero para el mismo punto', () => {
    expect(distanceKm(1.2142, -77.2811, 1.2142, -77.2811)).toBe(0);
  });

  it('un grado de latitud equivale a unos 111 km', () => {
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
  });

  it('da la misma distancia en ambos sentidos', () => {
    const ida = distanceKm(1.2142, -77.2811, 4.711, -74.0721);
    const vuelta = distanceKm(4.711, -74.0721, 1.2142, -77.2811);
    expect(ida).toBeCloseTo(vuelta, 10);
    // Pasto - Bogotá en línea recta: unos 520 km
    expect(ida).toBeGreaterThan(500);
    expect(ida).toBeLessThan(540);
  });
});

describe('IncidentsService', () => {
  let service: IncidentsService;
  let incidentRepository: {
    findOneBy: ReturnType<typeof mockFn>;
    save: ReturnType<typeof mockFn>;
    create: ReturnType<typeof mockFn>;
  };
  let historyRepository: {
    save: ReturnType<typeof mockFn>;
    create: ReturnType<typeof mockFn>;
    find: ReturnType<typeof mockFn>;
  };
  let usersService: { findStaffById: ReturnType<typeof mockFn> };

  /** Hace que el repositorio devuelva este reporte al buscarlo. */
  function stored(incident: Incident) {
    incidentRepository.findOneBy.mockResolvedValue(incident);
    return incident;
  }

  beforeEach(() => {
    incidentRepository = {
      findOneBy: mockFn(),
      save: mockFn().mockImplementation((data) =>
        Promise.resolve({ id: 'reporte-1', ...data }),
      ),
      create: mockFn().mockImplementation((data) => data),
    };
    historyRepository = {
      save: mockFn().mockImplementation((data) => Promise.resolve(data)),
      create: mockFn().mockImplementation((data) => data),
      find: mockFn(),
    };
    usersService = { findStaffById: mockFn() };
    const configService = { get: () => undefined };

    service = new IncidentsService(
      incidentRepository as unknown as Repository<Incident>,
      historyRepository as unknown as Repository<IncidentHistory>,
      usersService as unknown as UsersService,
      configService as unknown as ConfigService<Env>,
    );
  });

  describe('create', () => {
    const payload = {
      title: 'Incendio en bodega',
      category: IncidentCategory.FIRE,
      description: 'Sale humo negro de una bodega.',
      address: 'Calle 18 # 25-30, Pasto',
    };

    it('crea el reporte como nuevo, con prioridad media y su historial', async () => {
      stored(buildIncident());
      await service.create(payload, citizen);

      expect(incidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: IncidentPriority.MEDIUM,
          status: IncidentStatus.NEW,
          createdById: citizen.id,
        }),
      );
      expect(historyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'created',
          actor: { id: citizen.id },
        }),
      );
    });

    it('el personal operativo puede definir la prioridad', async () => {
      stored(buildIncident());
      await service.create(
        { ...payload, priority: IncidentPriority.CRITICAL },
        operator,
      );
      expect(incidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ priority: IncidentPriority.CRITICAL }),
      );
    });

    it('un ciudadano no puede definir la prioridad', async () => {
      await expect(
        service.create(
          { ...payload, priority: IncidentPriority.CRITICAL },
          citizen,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(incidentRepository.save).not.toHaveBeenCalled();
    });

    it('exige latitud y longitud juntas', async () => {
      await expect(
        service.create({ ...payload, latitude: 1.21 }, citizen),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('el ciudadano ve su propio reporte', async () => {
      const incident = stored(buildIncident());
      await expect(service.findOne(incident.id, citizen)).resolves.toBe(
        incident,
      );
    });

    it('el ciudadano no ve reportes ajenos (404)', async () => {
      stored(buildIncident());
      await expect(service.findOne('reporte-1', otherCitizen)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('el personal operativo ve cualquier reporte', async () => {
      const incident = stored(buildIncident());
      await expect(service.findOne(incident.id, operator)).resolves.toBe(
        incident,
      );
    });

    it('responde 404 si el reporte no existe', async () => {
      incidentRepository.findOneBy.mockResolvedValue(null);
      await expect(service.findOne('no-existe', operator)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll (validación de filtros)', () => {
    const base = { page: 1, limit: 10 };

    it('rechaza fechas inválidas', async () => {
      await expect(
        service.findAll({ ...base, from: '2026-02-30' }, operator),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza una fecha inicial posterior a la final', async () => {
      await expect(
        service.findAll(
          { ...base, from: '2026-11-20', to: '2026-11-01' },
          operator,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rechaza radius sin near', async () => {
      await expect(
        service.findAll({ ...base, radius: 3 }, operator),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('exige enviar al menos un campo', async () => {
      stored(buildIncident());
      await expect(
        service.update('reporte-1', { title: undefined }, operator),
      ).rejects.toThrow(BadRequestException);
    });

    it('asignar un responsable pasa el reporte a "assigned"', async () => {
      stored(buildIncident());
      usersService.findStaffById.mockResolvedValue(operator);

      await service.update(
        'reporte-1',
        { assignedToId: operator.id },
        operator,
      );

      expect(incidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedToId: operator.id,
          status: IncidentStatus.ASSIGNED,
        }),
      );
      expect(historyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'updated',
          details: expect.objectContaining({
            status: { from: IncidentStatus.NEW, to: IncidentStatus.ASSIGNED },
          }),
        }),
      );
    });

    it('quitar el responsable devuelve el reporte a "new"', async () => {
      stored(
        buildIncident({
          status: IncidentStatus.ASSIGNED,
          assignedToId: operator.id,
        }),
      );

      await service.update('reporte-1', { assignedToId: null }, operator);

      expect(incidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedToId: null,
          status: IncidentStatus.NEW,
        }),
      );
    });

    it('si se envía un estado, no se cambia automáticamente al asignar', async () => {
      stored(buildIncident());
      usersService.findStaffById.mockResolvedValue(operator);

      await service.update(
        'reporte-1',
        { assignedToId: operator.id, status: IncidentStatus.IN_PROGRESS },
        operator,
      );

      expect(incidentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: IncidentStatus.IN_PROGRESS }),
      );
    });

    it('el responsable debe ser una cuenta operativa', async () => {
      stored(buildIncident());
      usersService.findStaffById.mockResolvedValue(null);

      await expect(
        service.update('reporte-1', { assignedToId: citizen.id }, operator),
      ).rejects.toThrow(BadRequestException);
      expect(incidentRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza transiciones de estado inválidas con los estados permitidos', async () => {
      stored(buildIncident());

      const error = await service
        .update('reporte-1', { status: IncidentStatus.RESOLVED }, operator)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        error: 'INVALID_STATUS_TRANSITION',
        from: IncidentStatus.NEW,
        allowed: [
          IncidentStatus.ASSIGNED,
          IncidentStatus.IN_PROGRESS,
          IncidentStatus.CANCELLED,
        ],
      });
    });

    it('exige latitud y longitud juntas', async () => {
      stored(buildIncident());
      await expect(
        service.update('reporte-1', { latitude: 1.2 }, operator),
      ).rejects.toThrow(BadRequestException);
    });

    it('no guarda nada si los valores no cambian', async () => {
      const incident = stored(buildIncident());
      const result = await service.update(
        'reporte-1',
        { title: incident.title },
        operator,
      );
      expect(result).toBe(incident);
      expect(incidentRepository.save).not.toHaveBeenCalled();
      expect(historyRepository.save).not.toHaveBeenCalled();
    });

    describe('permisos del ciudadano', () => {
      it('puede editar su reporte mientras esté nuevo', async () => {
        stored(buildIncident());
        await service.update('reporte-1', { title: 'Nuevo título' }, citizen);
        expect(incidentRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ title: 'Nuevo título' }),
        );
      });

      it('puede cancelar su reporte', async () => {
        stored(buildIncident());
        await service.update(
          'reporte-1',
          { status: IncidentStatus.CANCELLED },
          citizen,
        );
        expect(incidentRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ status: IncidentStatus.CANCELLED }),
        );
      });

      it('no puede editarlo si ya no está nuevo (409)', async () => {
        stored(buildIncident({ status: IncidentStatus.ASSIGNED }));
        await expect(
          service.update('reporte-1', { title: 'Otro' }, citizen),
        ).rejects.toThrow(ConflictException);
      });

      it('no puede cambiar la prioridad ni el responsable (403)', async () => {
        stored(buildIncident());
        await expect(
          service.update(
            'reporte-1',
            { priority: IncidentPriority.HIGH },
            citizen,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.update('reporte-1', { assignedToId: operator.id }, citizen),
        ).rejects.toThrow(ForbiddenException);
      });

      it('solo puede pasar el estado a cancelado (403)', async () => {
        stored(buildIncident());
        await expect(
          service.update(
            'reporte-1',
            { status: IncidentStatus.IN_PROGRESS },
            citizen,
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('no puede editar reportes ajenos (404)', async () => {
        stored(buildIncident());
        await expect(
          service.update('reporte-1', { title: 'Otro' }, otherCitizen),
        ).rejects.toThrow(NotFoundException);
      });
    });
  });

  describe('findHistory', () => {
    it('devuelve el historial sin datos privados del autor', async () => {
      stored(buildIncident());
      historyRepository.find.mockResolvedValue([
        {
          id: 'h-1',
          action: 'created',
          actor: { ...operator, email: 'olga@example.com', password: 'hash' },
        },
      ]);

      const history = await service.findHistory('reporte-1', operator);

      expect(history).toEqual([
        {
          id: 'h-1',
          action: 'created',
          actor: { id: operator.id, name: 'Olga', role: Role.OPERATOR },
        },
      ]);
    });
  });
});
