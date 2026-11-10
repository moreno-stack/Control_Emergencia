import { Body, Controller, Get, HttpCode, Ip, Post, Req } from '@nestjs/common';
import { AuthService, JwtPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CreateUserDto } from '../users/dto/user.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() payload: CreateUserDto) {
    return this.authService.register(payload);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() payload: LoginDto, @Ip() ip: string) {
    return this.authService.login(payload, ip);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return { user };
  }

  @HttpCode(200)
  @Post('logout')
  logout(@Req() request: { tokenPayload: JwtPayload }) {
    return this.authService.logout(request.tokenPayload);
  }
}
