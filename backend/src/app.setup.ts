import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionFilter } from './common/filters/all-exceptions.filter';
import { BigIntInterceptor } from './common/interceptors/bigInt.interceptor';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication): void {
  // Set global prefix for all routes
  app.setGlobalPrefix('api/v1');
  // Use global pipes for validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Use global filters
  app.useGlobalFilters(new AllExceptionFilter());
  // Use global interceptors
  app.useGlobalInterceptors(new BigIntInterceptor());
  // Use cookie parser
  app.use(cookieParser());
}
