import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

// This interceptor is designed to serialize BigInt values to strings in the response.
@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  /**
   * The intercept method is called for each request and response cycle.
   * It uses the RxJS map operator to transform the response data by calling the serializeBigInt method.
   * @param context - The execution context of the request.
   * @param next - The call handler that allows the request to proceed to the next interceptor or controller.
   * @returns An Observable that emits the transformed response data.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        return this.serializeBigInt(data);
      }),
    );
  }

  /**
   * This method recursively traverses the input object and converts any BigInt values to strings.
   * It handles various data types including primitives, arrays, and objects.
   * @param obj - The input object to be serialized.
   * @returns The serialized object with BigInt values converted to strings.
   */
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

      //Iterate over each key in the object and serialize its value
      for (const key of Object.keys(record)) {
        serializedObj[key] = this.serializeBigInt(record[key]);
      }
      return serializedObj;
    }

    //Return primitives (string, number, boolean) directly
    return obj;
  }
}
