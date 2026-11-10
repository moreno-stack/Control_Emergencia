import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/user.dto';
import { Role, STAFF_ROLES } from '../common/enums/role.enum';
import { OPEN_STATUSES } from '../common/enums/incident.enums';
import { Incident } from '../incidents/entities/incident.entity';
import { Env } from '../env.model';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Incident)
    private incidentRepository: Repository<Incident>,
    private configService: ConfigService<Env>,
  ) {}

  /** Crea la cuenta de administrador definida en .env si todavía no existe. */
  async onApplicationBootstrap() {
    const email = this.configService.get('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.configService.get('ADMIN_PASSWORD');
    if (!email || !password) return;
    if (password.length < 10) {
      this.logger.warn('ADMIN_PASSWORD debe tener al menos 10 caracteres.');
      return;
    }
    if (await this.userRepository.existsBy({ email })) return;
    await this.create(
      {
        name: this.configService.get('ADMIN_NAME')?.trim() || 'Administrador',
        email,
        password,
      },
      Role.ADMIN,
    );
    this.logger.log(`Administrador ${email} creado.`);
  }

  async create(payload: CreateUserDto, role: Role) {
    if (await this.userRepository.existsBy({ email: payload.email })) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }
    const user = this.userRepository.create({
      ...payload,
      password: await bcrypt.hash(payload.password, 10),
      role,
    });
    const saved = await this.userRepository.save(user);
    return (await this.findById(saved.id)) as User;
  }

  findById(id: string) {
    return this.userRepository.findOneBy({ id });
  }

  /** Incluye la contraseña cifrada; solo se usa para iniciar sesión. */
  findByEmailWithPassword(email: string) {
    return this.userRepository.findOne({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        password: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findStaffById(id: string) {
    return this.userRepository.findOneBy({ id, role: In(STAFF_ROLES) });
  }

  /** Lista el personal operativo con su número de reportes abiertos asignados. */
  async findStaffWithWorkload() {
    const users = await this.userRepository.find({
      where: { role: In(STAFF_ROLES) },
      order: { name: 'ASC' },
    });
    const counts = await this.incidentRepository
      .createQueryBuilder('incident')
      .select('incident.assigned_to', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('incident.status IN (:...statuses)', { statuses: OPEN_STATUSES })
      .andWhere('incident.assigned_to IS NOT NULL')
      .groupBy('incident.assigned_to')
      .getRawMany<{ userId: string; count: string }>();
    const countByUser = new Map(
      counts.map((row) => [row.userId, Number(row.count)]),
    );
    return users.map((user) => ({
      ...user,
      activeIncidentCount: countByUser.get(user.id) ?? 0,
    }));
  }
}
