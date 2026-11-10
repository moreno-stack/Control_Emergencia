import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  IncidentCategory,
  IncidentPriority,
} from '../../common/enums/incident.enums';
import { trim } from '../../common/transforms';

export class CreateIncidentDto {
  @Transform(trim)
  @IsString()
  @Length(4, 120, { message: 'El título debe tener entre 4 y 120 caracteres.' })
  title: string;

  @IsEnum(IncidentCategory, {
    message: 'La categoría del reporte no es válida.',
  })
  category: IncidentCategory;

  @Transform(trim)
  @IsString()
  @Length(10, 2000, {
    message: 'La descripción debe tener entre 10 y 2000 caracteres.',
  })
  description: string;

  @Transform(trim)
  @IsString()
  @Length(5, 300, {
    message: 'La dirección debe tener entre 5 y 300 caracteres.',
  })
  address: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90, { message: 'La latitud debe estar entre -90 y 90.' })
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180, { message: 'La longitud debe estar entre -180 y 180.' })
  longitude?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(7, 25, { message: 'El teléfono de contacto no es válido.' })
  contactPhone?: string;

  /** Solo el personal operativo puede definir la prioridad. */
  @IsOptional()
  @IsEnum(IncidentPriority, { message: 'La prioridad no es válida.' })
  priority?: IncidentPriority;
}
