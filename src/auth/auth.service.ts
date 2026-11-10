import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/user.dto';
import { LoginDto } from './dto/login.dto';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

export interface JwtPayload {
  sub: string;
  jti: string;
  exp: number;
}

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  /** Tokens cerrados con logout (id del token -> fecha de expiración). */
  private revokedTokens = new Map<string, number>();
  /** Intentos fallidos de inicio de sesión por IP. */
  private failedLogins = new Map<string, number[]>();

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(payload: CreateUserDto) {
    const user = await this.usersService.create(payload, Role.CITIZEN);
    return { user, token: await this.signToken(user) };
  }

  async login({ email, password }: LoginDto, ip: string) {
    const now = Date.now();
    const recent = (this.failedLogins.get(ip) ?? []).filter(
      (time) => now - time < FAILED_LOGIN_WINDOW_MS,
    );
    if (recent.length >= MAX_FAILED_LOGINS) {
      throw new HttpException(
        'Demasiados intentos fallidos. Inténtalo más tarde.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      this.failedLogins.set(ip, [...recent, now]);
      throw new UnauthorizedException('Correo o contraseña incorrectos.');
    }

    this.failedLogins.delete(ip);
    const { password: _password, ...publicUser } = user;
    return { user: publicUser, token: await this.signToken(user) };
  }

  logout(payload: JwtPayload) {
    this.revokedTokens.set(payload.jti, payload.exp * 1000);
    this.purgeExpired();
    return { message: 'Sesión cerrada correctamente.' };
  }

  /** Valida el token y devuelve el usuario dueño de la sesión. */
  async validateToken(token: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Debes iniciar sesión para acceder a este recurso.',
      );
    }
    if (this.revokedTokens.has(payload.jti)) {
      throw new UnauthorizedException('La sesión fue cerrada.');
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException(
        'La cuenta asociada a esta sesión ya no existe.',
      );
    }
    return { user, payload };
  }

  private signToken(user: User) {
    return this.jwtService.signAsync({ sub: user.id, jti: randomUUID() });
  }

  private purgeExpired() {
    const now = Date.now();
    for (const [jti, expiresAt] of this.revokedTokens) {
      if (expiresAt <= now) this.revokedTokens.delete(jti);
    }
    for (const [ip, failures] of this.failedLogins) {
      if (failures.every((time) => now - time >= FAILED_LOGIN_WINDOW_MS)) {
        this.failedLogins.delete(ip);
      }
    }
  }
}
