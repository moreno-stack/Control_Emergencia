import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from './entities/incident.entity';
import { IncidentHistory } from './entities/incident-history.entity';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import {
  canTransition,
  IncidentPriority,
  IncidentStatus,
  STATUS_TRANSITIONS,
} from '../common/enums/incident.enums';
import { Env } from '../env.model';

/** Distancia en km entre dos coordenadas (fórmula de Haversine). */
export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isValidDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

const isStaff = (user: User) => user.role !== Role.CITIZEN;

@Injectable()
export class IncidentsService {
  private readonly timeZone: string;

  constructor(
    @InjectRepository(Incident)
    private incidentRepository: Repository<Incident>,
    @InjectRepository(IncidentHistory)
    private historyRepository: Repository<IncidentHistory>,
    private usersService: UsersService,
    configService: ConfigService<Env>,
  ) {
    this.timeZone = configService.get('TIMEZONE') || 'America/Bogota';
  }

  async create(payload: CreateIncidentDto, user: User) {
    if (payload.priority !== undefined && !isStaff(user)) {
      throw new ForbiddenException(
        'Solo el personal operativo puede definir la prioridad.',
      );
    }
    this.checkCoordinates(payload);
    const incident = await this.incidentRepository.save(
      this.incidentRepository.create({
        ...payload,
        priority: payload.priority ?? IncidentPriority.MEDIUM,
        status: IncidentStatus.NEW,
        createdById: user.id,
      }),
    );
    await this.addHistory(incident, user, 'created');
    return this.findOne(incident.id, user);
  }

  async findAll(query: ListIncidentsQueryDto, user: User) {
    const {
      page,
      limit,
      status,
      priority,
      category,
      q,
      from,
      to,
      near,
      radius,
    } = query;
    for (const date of [from, to]) {
      if (date && !isValidDate(date)) {
        throw new BadRequestException(
          'Las fechas deben ser válidas (YYYY-MM-DD).',
        );
      }
    }
    if (from && to && from > to) {
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
    }
    if (radius !== undefined && !near) {
      throw new BadRequestException(
        'El filtro radius requiere el filtro near.',
      );
    }

    const builder = this.incidentRepository.createQueryBuilder('incident');
    // Los ciudadanos solo ven sus propios reportes
    if (!isStaff(user)) {
      builder.andWhere('incident.createdById = :userId', { userId: user.id });
    }
    if (status) builder.andWhere('incident.status = :status', { status });
    if (priority)
      builder.andWhere('incident.priority = :priority', { priority });
    if (category)
      builder.andWhere('incident.category = :category', { category });
    if (q?.trim()) {
      builder.andWhere(
        '(incident.title ILIKE :q OR incident.description ILIKE :q OR incident.address ILIKE :q)',
        { q: `%${q.trim()}%` },
      );
    }
    const localDate = '(incident.created_at AT TIME ZONE :tz)::date';
    if (from)
      builder.andWhere(`${localDate} >= :from`, { from, tz: this.timeZone });
    if (to) builder.andWhere(`${localDate} <= :to`, { to, tz: this.timeZone });

    if (!near) {
      const [incidents, total] = await builder
        .orderBy('incident.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();
      return { incidents, pagination: this.pagination(page, limit, total) };
    }

    // Búsqueda por cercanía: se calcula la distancia y se ordena del más cercano
    const [latitude, longitude] = near.split(',').map(Number);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException(
        'El filtro near debe tener el formato latitud,longitud.',
      );
    }
    const maxDistance = radius ?? 5;
    const nearby = (
      await builder
        .andWhere(
          'incident.latitude IS NOT NULL AND incident.longitude IS NOT NULL',
        )
        .getMany()
    )
      .map((incident) => ({
        ...incident,
        distanceKm:
          Math.round(
            distanceKm(
              latitude,
              longitude,
              incident.latitude!,
              incident.longitude!,
            ) * 100,
          ) / 100,
      }))
      .filter((incident) => incident.distanceKm <= maxDistance)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return {
      incidents: nearby.slice((page - 1) * limit, page * limit),
      pagination: this.pagination(page, limit, nearby.length),
    };
  }

  /** Busca un reporte que el usuario tenga permitido ver. */
  async findOne(id: string, user: User) {
    const incident = await this.incidentRepository.findOneBy({ id });
    if (!incident || (!isStaff(user) && incident.createdById !== user.id)) {
      throw new NotFoundException('No se encontró el reporte solicitado.');
    }
    return incident;
  }

  async update(id: string, changes: UpdateIncidentDto, user: User) {
    const incident = await this.findOne(id, user);
    const sent = Object.fromEntries(
      Object.entries(changes).filter(([, value]) => value !== undefined),
    ) as UpdateIncidentDto;
    if (Object.keys(sent).length === 0) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }

    if (!isStaff(user)) {
      if (incident.status !== IncidentStatus.NEW) {
        throw new ConflictException(
          'Solo puedes editar reportes que todavía estén nuevos.',
        );
      }
      if (sent.priority !== undefined || sent.assignedToId !== undefined) {
        throw new ForbiddenException(
          'Solo el personal operativo puede cambiar la prioridad o el responsable.',
        );
      }
      if (
        sent.status !== undefined &&
        sent.status !== IncidentStatus.CANCELLED
      ) {
        throw new ForbiddenException(
          'Como ciudadano solo puedes cancelar tu reporte.',
        );
      }
    }
    if ((sent.latitude === undefined) !== (sent.longitude === undefined)) {
      throw new BadRequestException('Debes enviar latitud y longitud juntas.');
    }

    if (sent.assignedToId) {
      const assignee = await this.usersService.findStaffById(sent.assignedToId);
      if (!assignee) {
        throw new BadRequestException(
          'El responsable debe ser una cuenta operativa existente.',
        );
      }
    }
    // Asignar un responsable mueve el reporte a "assigned"; quitarlo lo devuelve a "new"
    if (sent.status === undefined && sent.assignedToId !== undefined) {
      if (sent.assignedToId && incident.status === IncidentStatus.NEW) {
        sent.status = IncidentStatus.ASSIGNED;
      }
      if (
        sent.assignedToId === null &&
        incident.status === IncidentStatus.ASSIGNED
      ) {
        sent.status = IncidentStatus.NEW;
      }
    }
    if (sent.status && !canTransition(incident.status, sent.status)) {
      throw new ConflictException({
        message: `No se puede cambiar el estado de ${incident.status} a ${sent.status}.`,
        error: 'INVALID_STATUS_TRANSITION',
        from: incident.status,
        allowed: STATUS_TRANSITIONS[incident.status],
      });
    }

    const changedFields: string[] = [];
    const details: Record<string, { from: unknown; to: unknown }> = {};
    for (const [field, value] of Object.entries(sent)) {
      const key = field as keyof UpdateIncidentDto;
      if (incident[key] !== value) {
        changedFields.push(field);
        if (['status', 'priority', 'assignedToId'].includes(field)) {
          details[field] = { from: incident[key], to: value };
        }
      }
    }
    if (changedFields.length === 0) return incident;

    // Se borra la relación cargada para que TypeORM use el nuevo assignedToId
    const { assignedTo: _assignedTo, ...current } = incident;
    await this.incidentRepository.save({ ...current, ...sent });
    await this.addHistory(incident, user, 'updated', changedFields, details);
    return this.findOne(id, user);
  }

  async findHistory(id: string, user: User) {
    const incident = await this.findOne(id, user);
    const history = await this.historyRepository.find({
      where: { incident: { id: incident.id } },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });
    return history.map(({ actor, ...entry }) => ({
      ...entry,
      actor: { id: actor.id, name: actor.name, role: actor.role },
    }));
  }

  private addHistory(
    incident: Incident,
    actor: User,
    action: 'created' | 'updated',
    changedFields: string[] = [],
    details: Record<string, { from: unknown; to: unknown }> = {},
  ) {
    return this.historyRepository.save(
      this.historyRepository.create({
        incident: { id: incident.id },
        actor: { id: actor.id },
        action,
        changedFields,
        details,
      }),
    );
  }

  private checkCoordinates(payload: { latitude?: number; longitude?: number }) {
    if (
      (payload.latitude === undefined) !==
      (payload.longitude === undefined)
    ) {
      throw new BadRequestException('Debes enviar latitud y longitud juntas.');
    }
  }

  private pagination(page: number, limit: number, total: number) {
    return { page, limit, total, pages: Math.ceil(total / limit) };
  }
}
