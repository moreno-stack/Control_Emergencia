import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('incidents/:incidentId/comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  async findAll(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @CurrentUser() user: User,
  ) {
    return {
      comments: await this.commentsService.findByIncident(incidentId, user),
    };
  }

  @Post()
  async create(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
    @Body() payload: CreateCommentDto,
    @CurrentUser() user: User,
  ) {
    return {
      comment: await this.commentsService.create(incidentId, payload, user),
    };
  }
}
