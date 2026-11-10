import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Incident } from '../incidents/entities/incident.entity';
import { User } from '../users/entities/user.entity';
import {
  IncidentPriority,
  IncidentStatus,
  OPEN_STATUSES,
} from '../common/enums/incident.enums';
import { Env } from '../env.model';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Incident)
    private incidentRepository: Repository<Incident>,
    private configService: ConfigService<Env>,
  ) {}

  async getSummary(user: User) {
    const timeZone = this.configService.get('TIMEZONE') || 'America/Bogota';
    const byStatus = Object.fromEntries(
      Object.values(IncidentStatus).map((status) => [status, 0]),
    ) as Record<IncidentStatus, number>;
    const byPriority = Object.fromEntries(
      Object.values(IncidentPriority).map((priority) => [priority, 0]),
    ) as Record<IncidentPriority, number>;

    const rows = await this.incidentRepository
      .createQueryBuilder('incident')
      .select('incident.status', 'status')
      .addSelect('incident.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .groupBy('incident.status')
      .addGroupBy('incident.priority')
      .getRawMany<{
        status: IncidentStatus;
        priority: IncidentPriority;
        count: string;
      }>();

    let total = 0;
    let open = 0;
    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      byStatus[row.status] += count;
      byPriority[row.priority] += count;
      if (OPEN_STATUSES.includes(row.status)) open += count;
    }

    const createdToday = await this.incidentRepository
      .createQueryBuilder('incident')
      .where(
        '(incident.created_at AT TIME ZONE :tz)::date = (now() AT TIME ZONE :tz)::date',
        { tz: timeZone },
      )
      .getCount();
    const assignedToMe = await this.incidentRepository.countBy({
      assignedToId: user.id,
    });

    return {
      summary: {
        total,
        open,
        createdToday,
        assignedToMe,
        byStatus,
        byPriority,
      },
    };
  }
}
