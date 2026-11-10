import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, MaxLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import { trim } from '../../common/transforms';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @Transform(trim)
  @IsString()
  @Length(2, 100, { message: 'El nombre debe tener entre 2 y 100 caracteres.' })
  name: string;

  @Transform(normalizeEmail)
  @IsEmail({}, { message: 'El correo no es válido.' })
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(10, 72, {
    message: 'La contraseña debe tener entre 10 y 72 caracteres.',
  })
  password: string;
}

/** Usado por el administrador para crear cuentas operativas. */
export class CreateOperatorDto extends CreateUserDto {
  @IsIn([Role.OPERATOR], {
    message: 'Solo se pueden crear cuentas de operador.',
  })
  role: Role.OPERATOR;
}
