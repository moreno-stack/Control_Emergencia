import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { trim } from '../../common/transforms';

export class CreateCommentDto {
  @Transform(trim)
  @IsString()
  @Length(2, 1000, {
    message: 'El comentario debe tener entre 2 y 1000 caracteres.',
  })
  message: string;
}
