import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { IncidentsService } from '../incidents/incidents.service';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFn = () => jest.fn<(...args: any[]) => any>();

const author = {
  id: 'operador-1',
  name: 'Olga',
  email: 'olga@example.com',
  password: 'hash-secreto',
  role: Role.OPERATOR,
} as User;
const createdAt = new Date('2026-11-19T12:00:00.000Z');

describe('CommentsService', () => {
  let service: CommentsService;
  let commentRepository: {
    find: ReturnType<typeof mockFn>;
    save: ReturnType<typeof mockFn>;
    create: ReturnType<typeof mockFn>;
  };
  let incidentsService: { findOne: ReturnType<typeof mockFn> };

  beforeEach(() => {
    commentRepository = {
      find: mockFn(),
      save: mockFn().mockImplementation((data) =>
        Promise.resolve({ id: 'comentario-1', createdAt, ...data }),
      ),
      create: mockFn().mockImplementation((data) => data),
    };
    incidentsService = {
      findOne: mockFn().mockResolvedValue({ id: 'reporte-1' }),
    };
    service = new CommentsService(
      commentRepository as unknown as Repository<Comment>,
      incidentsService as unknown as IncidentsService,
    );
  });

  describe('create', () => {
    it('guarda el comentario y no expone datos privados del autor', async () => {
      const result = await service.create(
        'reporte-1',
        { message: 'Unidad en camino.' },
        author,
      );

      expect(commentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unidad en camino.',
          incident: { id: 'reporte-1' },
          author,
        }),
      );
      expect(result).toEqual({
        id: 'comentario-1',
        incidentId: 'reporte-1',
        message: 'Unidad en camino.',
        createdAt,
        author: { id: author.id, name: 'Olga', role: Role.OPERATOR },
      });
    });

    it('verifica que el usuario pueda ver el reporte antes de comentar', async () => {
      incidentsService.findOne.mockRejectedValue(
        new NotFoundException('No se encontró el reporte solicitado.'),
      );

      await expect(
        service.create('reporte-ajeno', { message: 'Hola' }, author),
      ).rejects.toThrow(NotFoundException);
      expect(incidentsService.findOne).toHaveBeenCalledWith(
        'reporte-ajeno',
        author,
      );
      expect(commentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findByIncident', () => {
    it('lista los comentarios del reporte en orden cronológico', async () => {
      commentRepository.find.mockResolvedValue([
        { id: 'c-1', message: 'Primero', createdAt, author },
        { id: 'c-2', message: 'Segundo', createdAt, author },
      ]);

      const comments = await service.findByIncident('reporte-1', author);

      expect(commentRepository.find).toHaveBeenCalledWith({
        where: { incident: { id: 'reporte-1' } },
        relations: { author: true },
        order: { createdAt: 'ASC' },
      });
      expect(comments.map((comment) => comment.message)).toEqual([
        'Primero',
        'Segundo',
      ]);
      expect(comments[0].author).toEqual({
        id: author.id,
        name: 'Olga',
        role: Role.OPERATOR,
      });
    });

    it('no lista comentarios de reportes que el usuario no puede ver', async () => {
      incidentsService.findOne.mockRejectedValue(new NotFoundException());

      await expect(
        service.findByIncident('reporte-ajeno', author),
      ).rejects.toThrow(NotFoundException);
      expect(commentRepository.find).not.toHaveBeenCalled();
    });
  });
});
