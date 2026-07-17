import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function withValidation(schema: { parse: (data: unknown) => any }, handler: Function) {
  return async (request: Request, context: any) => {
    try {
      let body: any;
      const contentType = request.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = {};
      }

      const validated = schema.parse(body);

      (request as any).validatedBody = validated;

      return handler(request, context);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: 'بيانات غير صالحة',
              code: 'VALIDATION_ERROR',
              details: error.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
              })),
            },
          },
          { status: 422 }
        );
      }

      return NextResponse.json(
        { success: false, error: { message: 'خطأ في معالجة الطلب' } },
        { status: 400 }
      );
    }
  };
}
