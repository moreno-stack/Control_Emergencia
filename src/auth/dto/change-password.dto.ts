import { IsNotEmpty, IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes enviar tu contraseña actual.' })
  currentPassword: string;

  @IsString()
  @Length(10, 72, {
    message: 'La nueva contraseña debe tener entre 10 y 72 caracteres.',
  })
  newPassword: string;
}
