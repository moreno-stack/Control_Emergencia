import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { IncidentsService } from '../incidents/incidents.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private incidentsService: IncidentsService,
  ) {}

  async findByIncident(incidentId: string, user: User) {
    // Verifica que el usuario pueda ver el reporte
    await this.incidentsService.findOne(incidentId, user);
    const comments = await this.commentRepository.find({
      where: { incident: { id: incidentId } },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
    return comments.map((comment) => this.toResponse(comment, incidentId));
  }

  async create(incidentId: string, payload: CreateCommentDto, user: User) {
    await this.incidentsService.findOne(incidentId, user);
    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        message: payload.message,
        incident: { id: incidentId },
        author: user,
      }),
    );
    return this.toResponse(comment, incidentId);
  }

  private toResponse(
    { id, message, createdAt, author }: Comment,
    incidentId: string,
  ) {
    return {
      id,
      incidentId,
      message,
      createdAt,
      author: { id: author.id, name: author.name, role: author.role },
    };
  }
}
