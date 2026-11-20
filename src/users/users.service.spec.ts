import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Incident } from '../incidents/entities/incident.entity';
import { Role } from '../common/enums/role.enum';
import { Env } from '../env.model';

/** Repositorio de usuarios simulado: guarda los datos en un arreglo. */
function createUserRepository() {
  const users: User[] = [];
  return {
    users,
    existsBy: jest.fn(async ({ email }: { email: string }) =>
      users.some((user) => user.email === email),
    ),
    create: jest.fn((data: Partial<User>) => ({ ...data }) as User),
    save: jest.fn(async (user: User) => {
      const saved = { ...user, id: `id-${users.length + 1}` };
      users.push(saved);
      return saved;
    }),
    findOneBy: jest.fn(
      async ({ id }: { id: string }) =>
        users.find((user) => user.id === id) ?? null,
    ),
    update: jest.fn(async ({ id }: { id: string }, changes: Partial<User>) => {
      const user = users.find((item) => item.id === id);
      if (user) Object.assign(user, changes);
    }),
  };
}

function createService(env: Partial<Env> = {}) {
  const userRepository = createUserRepository();
  const configService = {
    get: (key: keyof Env) => env[key],
  } as unknown as ConfigService<Env>;
  const service = new UsersService(
    userRepository as unknown as Repository<User>,
    {} as Repository<Incident>,
    configService,
  );
  return { service, userRepository };
}

describe('UsersService', () => {
  it('crea usuarios con la contraseña cifrada y el rol indicado', async () => {
    const { service, userRepository } = createService();

    const user = await service.create(
      { name: 'Ana', email: 'ana@example.com', password: 'clave-segura-123' },
      Role.CITIZEN,
    );

    expect(user.role).toBe(Role.CITIZEN);
    const stored = userRepository.users[0];
    expect(stored.password).not.toBe('clave-segura-123');
    expect(await bcrypt.compare('clave-segura-123', stored.password)).toBe(
      true,
    );
  });

  it('no permite dos cuentas con el mismo correo', async () => {
    const { service } = createService();
    const payload = {
      name: 'Ana',
      email: 'ana@example.com',
      password: 'clave-segura-123',
    };
    await service.create(payload, Role.CITIZEN);

    await expect(service.create(payload, Role.CITIZEN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('crea el administrador definido en .env al iniciar', async () => {
    const { service, userRepository } = createService({
      ADMIN_NAME: 'Admin',
      ADMIN_EMAIL: ' ADMIN@Example.com ',
      ADMIN_PASSWORD: 'admin-password-123',
    });

    await service.onApplicationBootstrap();

    expect(userRepository.users).toHaveLength(1);
    expect(userRepository.users[0]).toMatchObject({
      email: 'admin@example.com',
      role: Role.ADMIN,
    });
  });

  it('no crea el administrador dos veces', async () => {
    const env = {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'admin-password-123',
    };
    const { service, userRepository } = createService(env);

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(userRepository.users).toHaveLength(1);
  });

  it('no crea el administrador si la contraseña es muy corta', async () => {
    const { service, userRepository } = createService({
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'corta',
    });

    await service.onApplicationBootstrap();

    expect(userRepository.users).toHaveLength(0);
  });

  it('actualiza el nombre y guarda la nueva contraseña cifrada', async () => {
    const { service, userRepository } = createService();
    const user = await service.create(
      { name: 'Ana', email: 'ana@example.com', password: 'clave-segura-123' },
      Role.CITIZEN,
    );

    const updated = await service.updateName(user.id, 'Ana María');
    await service.updatePassword(user.id, 'clave-nueva-456');

    expect(updated.name).toBe('Ana María');
    expect(
      await bcrypt.compare('clave-nueva-456', userRepository.users[0].password),
    ).toBe(true);
  });
});
