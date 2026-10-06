export interface HttpExceptionResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
}
