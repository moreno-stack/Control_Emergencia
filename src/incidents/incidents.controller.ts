import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('incidents')
export class IncidentsController {
  constructor(private incidentsService: IncidentsService) {}

  @Post()
  async create(@Body() payload: CreateIncidentDto, @CurrentUser() user: User) {
    return { incident: await this.incidentsService.create(payload, user) };
  }

  @Get()
  findAll(@Query() query: ListIncidentsQueryDto, @CurrentUser() user: User) {
    return this.incidentsService.findAll(query, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { incident: await this.incidentsService.findOne(id, user) };
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changes: UpdateIncidentDto,
    @CurrentUser() user: User,
  ) {
    return { incident: await this.incidentsService.update(id, changes, user) };
  }

  @Get(':id/history')
  async findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return { history: await this.incidentsService.findHistory(id, user) };
  }
}
