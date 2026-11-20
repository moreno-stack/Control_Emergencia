import { jest } from '@jest/globals';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService, JwtPayload } from './auth.service';
import { RevokedToken } from './entities/revoked-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

const PASSWORD = 'clave-segura-123';

async function createService() {
  const user = {
    id: 'user-1',
    name: 'Ana',
    email: 'ana@example.com',
    role: Role.CITIZEN,
    password: await bcrypt.hash(PASSWORD, 4),
  } as User;

  const usersService = {
    create: jest.fn(async () => ({ ...user, password: undefined })),
    findByEmailWithPassword: jest.fn(async (email: string) =>
      email === user.email ? { ...user } : null,
    ),
    findById: jest.fn(async (id: string) => (id === user.id ? user : null)),
    updateName: jest.fn(async (_id: string, name: string) => ({
      ...user,
      name,
    })),
    updatePassword: jest.fn(async () => undefined),
  };

  // JWT simulado: el token es el JSON del contenido
  const jwtService = {
    signAsync: jest.fn(async (payload: object) =>
      JSON.stringify({ ...payload, exp: 4102444800 }),
    ),
    verifyAsync: jest.fn(async (token: string) => {
      try {
        return JSON.parse(token) as JwtPayload;
      } catch {
        throw new Error('invalid token');
      }
    }),
  };

  // Tokens cerrados guardados en un arreglo en lugar de la base de datos
  const revoked: { jti: string; expiresAt: Date }[] = [];
  const revokedTokenRepository = {
    save: jest.fn(async (token: { jti: string; expiresAt: Date }) => {
      revoked.push(token);
      return token;
    }),
    existsBy: jest.fn(async ({ jti }: { jti: string }) =>
      revoked.some((token) => token.jti === jti),
    ),
    delete: jest.fn(async () => undefined),
  };

  const service = new AuthService(
    usersService as unknown as UsersService,
    jwtService as unknown as JwtService,
    revokedTokenRepository as unknown as Repository<RevokedToken>,
  );
  return { service, user, usersService, revoked };
}

describe('AuthService', () => {
  it('registra ciudadanos y devuelve un token', async () => {
    const { service, usersService } = await createService();

    const result = await service.register({
      name: 'Ana',
      email: 'ana@example.com',
      password: PASSWORD,
    });

    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@example.com' }),
      Role.CITIZEN,
    );
    expect(result.token).toBeDefined();
  });

  it('inicia sesión sin devolver la contraseña', async () => {
    const { service } = await createService();

    const result = await service.login(
      { email: 'ana@example.com', password: PASSWORD },
      '1.1.1.1',
    );

    expect(result.user).not.toHaveProperty('password');
    expect(JSON.parse(result.token)).toMatchObject({ sub: 'user-1' });
  });

  it('rechaza una contraseña incorrecta o un correo que no existe', async () => {
    const { service } = await createService();

    await expect(
      service.login({ email: 'ana@example.com', password: 'otra' }, '1.1.1.1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login(
        { email: 'nadie@example.com', password: PASSWORD },
        '1.1.1.1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('bloquea la IP después de 10 intentos fallidos', async () => {
    const { service } = await createService();
    for (let i = 0; i < 10; i++) {
      await expect(
        service.login(
          { email: 'ana@example.com', password: 'mala' },
          '2.2.2.2',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    const blocked = service.login(
      { email: 'ana@example.com', password: PASSWORD },
      '2.2.2.2',
    );
    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(blocked).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    // Otra IP sigue pudiendo iniciar sesión
    await expect(
      service.login(
        { email: 'ana@example.com', password: PASSWORD },
        '3.3.3.3',
      ),
    ).resolves.toHaveProperty('token');
  });

  it('el logout guarda el token y ya no se puede usar', async () => {
    const { service, revoked } = await createService();
    const { token } = await service.login(
      { email: 'ana@example.com', password: PASSWORD },
      '1.1.1.1',
    );
    const { payload } = await service.validateToken(token);

    await service.logout(payload);

    expect(revoked).toHaveLength(1);
    expect(revoked[0].expiresAt).toEqual(new Date(payload.exp * 1000));
    await expect(service.validateToken(token)).rejects.toThrow(
      'La sesión fue cerrada.',
    );
  });

  it('rechaza tokens inválidos o de cuentas que ya no existen', async () => {
    const { service } = await createService();

    await expect(
      service.validateToken('no-es-un-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.validateToken(
        JSON.stringify({ sub: 'borrado', jti: 'x', exp: 4102444800 }),
      ),
    ).rejects.toThrow('La cuenta asociada a esta sesión ya no existe.');
  });

  it('cambia la contraseña solo si la actual es correcta', async () => {
    const { service, user, usersService } = await createService();

    await expect(
      service.changePassword(user, {
        currentPassword: 'equivocada',
        newPassword: 'clave-nueva-456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.changePassword(user, {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.changePassword(user, {
      currentPassword: PASSWORD,
      newPassword: 'clave-nueva-456',
    });
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      'user-1',
      'clave-nueva-456',
    );
  });

  it('actualiza el nombre del perfil', async () => {
    const { service, user } = await createService();

    const result = await service.updateProfile(user, 'Ana María');

    expect(result.user.name).toBe('Ana María');
  });
});
