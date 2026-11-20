import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Request, Response } from 'express';

/** Códigos de error de PostgreSQL que se traducen a respuestas HTTP claras. */
const PG_ERRORS: Record<string, { status: number; message: string }> = {
  '23505': { status: HttpStatus.CONFLICT, message: 'El registro ya existe.' },
  '23503': {
    status: HttpStatus.CONFLICT,
    message: 'El registro está relacionado con otros datos.',
  },
};

/**
 * Filtro global: todas las respuestas de error tienen la misma forma
 * { statusCode, message, error, path, timestamp }.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      message: 'Ocurrió un error inesperado.',
      error: 'Internal Server Error',
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const result = exception.getResponse();
      body =
        typeof result === 'string'
          ? { message: result }
          : (result as Record<string, unknown>);
    } else if (exception instanceof QueryFailedError) {
      const code = (exception.driverError as { code?: string })?.code ?? '';
      const known = PG_ERRORS[code];
      if (known) {
        status = known.status;
        body = { message: known.message, error: 'Conflict' };
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else {
      this.logger.error(exception);
    }

    response.status(status).json({
      statusCode: status,
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
