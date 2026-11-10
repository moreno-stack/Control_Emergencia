import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  IncidentCategory,
  IncidentPriority,
  IncidentStatus,
} from '../../common/enums/incident.enums';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class ListIncidentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'El filtro status no es válido.' })
  status?: IncidentStatus;

  @IsOptional()
  @IsEnum(IncidentPriority, { message: 'El filtro priority no es válido.' })
  priority?: IncidentPriority;

  @IsOptional()
  @IsEnum(IncidentCategory, { message: 'El filtro category no es válido.' })
  category?: IncidentCategory;

  /** Texto a buscar en título, descripción y dirección. */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'La búsqueda no puede superar 100 caracteres.' })
  q?: string;

  @IsOptional()
  @Matches(DATE_FORMAT, {
    message: 'Las fechas deben tener el formato YYYY-MM-DD.',
  })
  from?: string;

  @IsOptional()
  @Matches(DATE_FORMAT, {
    message: 'Las fechas deben tener el formato YYYY-MM-DD.',
  })
  to?: string;

  /** "latitud,longitud" del punto de búsqueda. */
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/, {
    message: 'El filtro near debe tener el formato latitud,longitud.',
  })
  near?: string;

  /** Radio en kilómetros (por defecto 5). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100, { message: 'El radio debe estar entre 0 y 100 km.' })
  radius?: number;
}
