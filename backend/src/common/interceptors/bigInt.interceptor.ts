import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        return this.serializeBigInt(data);
      }),
    );
  }

  private serializeBigInt(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle core Object: bigInt to string
    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    //Handle Date Objects
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    //Handle Arrays recursively
    if (Array.isArray(obj)) {
      return obj.map((item: unknown) => this.serializeBigInt(item));
    }

    //Handle standard Objects
    if (typeof obj === 'object') {
      const record = obj as Record<string | symbol, unknown>;
      const serializedObj: Record<string | symbol, unknown> = {};

      for (const key of Object.keys(record)) {
        serializedObj[key] = this.serializeBigInt(record[key]);
      }
      return serializedObj;
    }

    //Return primitives (string, number, boolean) directly
    return obj;
  }
}
