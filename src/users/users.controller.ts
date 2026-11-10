import { Body, Controller, Get, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateOperatorDto } from './dto/user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles(Role.ADMIN)
  @Post()
  async createOperator(@Body() payload: CreateOperatorDto) {
    const { role, ...data } = payload;
    return { user: await this.usersService.create(data, role) };
  }

  @Roles(Role.OPERATOR, Role.ADMIN)
  @Get()
  async getStaff() {
    return { users: await this.usersService.findStaffWithWorkload() };
  }
}
