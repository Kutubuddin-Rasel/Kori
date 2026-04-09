import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { HttpExceptionResponse } from '../interfaces/httpException.interface';

/**
 * AllExceptionFilter is a global exception filter that catches all exceptions thrown in the application.
 * This filter catches all exceptions thrown in the application and formats the response
 * in a consistent way. It handles both expected exceptions (like HttpException) and
 * unexpected ones, ensuring that clients receive a clear and informative error message.
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  /**
   * The catch method is called when an exception is thrown.
   * @param exception - The exception that was thrown.
   * @param host - The arguments host containing the request and response objects.
   */
  catch(exception: unknown, host: ArgumentsHost) {
    // Switch to the HTTP context to access the request and response objects
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Default status code and message for unexpected errors
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    // If the exception is an instance of HttpException, we can extract the status and message
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // The exception response can be a string or an object. We handle both cases here.
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        // If it's an object, we assume it has the structure defined in HttpExceptionResponse
        const errorObject = exceptionResponse as HttpExceptionResponse;
        message = errorObject.message || 'An unexpected error occurred';
      }
    }

    // Send the formatted error response back to the client
    response.status(status).json({
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }
}
