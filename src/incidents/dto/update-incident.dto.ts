import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CreateIncidentDto } from './create-incident.dto';
import { IncidentStatus } from '../../common/enums/incident.enums';

export class UpdateIncidentDto extends PartialType(CreateIncidentDto) {
  @IsOptional()
  @IsEnum(IncidentStatus, { message: 'El estado no es válido.' })
  status?: IncidentStatus;

  /** Id de un operador o administrador; null para quitar el responsable. */
  @IsOptional()
  @IsUUID('all', { message: 'El responsable no es válido.' })
  assignedToId?: string | null;
}
