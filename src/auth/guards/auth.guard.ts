import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Guard global: exige "Authorization: Bearer <token>" en todas las rutas,
 * excepto las marcadas con @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = /^Bearer\s+(\S+)$/i.exec(
      request.headers.authorization ?? '',
    )?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Debes iniciar sesión para acceder a este recurso.',
      );
    }
    const { user, payload } = await this.authService.validateToken(token);
    request.user = user;
    request.tokenPayload = payload;
    return true;
  }
}
