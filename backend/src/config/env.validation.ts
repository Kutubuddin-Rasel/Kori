import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * This file defines the EnvironmentVariables class and the validate function to ensure that the environment variables are properly validated.
 * The EnvironmentVariables class uses decorators from the class-validator library to specify the validation rules for each environment variable.
 * The validate function takes a configuration object, transforms it into an instance of EnvironmentVariables, and validates it. If there are any validation errors, it throws an error with the details.
 */

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsNotEmpty()
  @IsNumber()
  Port: number = 3000;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL: string = '';

  @IsNotEmpty()
  @IsString()
  REDIS_HOST: string = '';

  @IsNotEmpty()
  @IsNumber()
  REDIS_PORT: number = 6379;

  @IsNotEmpty()
  @IsString()
  REDIS_PASSWORD: string = '';
}

/**
 * Validates the provided configuration object against the EnvironmentVariables class.
 * @param config - The configuration object to validate.
 * @returns An instance of EnvironmentVariables if validation is successful.
 * @throws An error if validation fails, containing the details of the validation errors.
 */
export function validate(config: Record<string, unknown>) {
  // Transform the plain configuration object into an instance of EnvironmentVariables, enabling implicit type conversion.
  const validateConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  // Validate the instance and collect any validation errors. The option skipMissingProperties is set to false to ensure that all properties are validated.
  const errors = validateSync(validateConfig, { skipMissingProperties: false });

  // If there are validation errors, throw an error with the details of the errors.
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validateConfig;
}
