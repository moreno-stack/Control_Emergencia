import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restringe una ruta a los roles indicados. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
