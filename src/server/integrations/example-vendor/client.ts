import { z } from 'zod';
import { env } from '../../env';
import { createVendorClient } from '../../platform/http/vendor-client';

// Outbound side of the example integration. Real vendors: copy, rename, replace the schemas.
export const widgetSchema = z.object({ id: z.string(), name: z.string(), updatedAt: z.string() });
export type Widget = z.infer<typeof widgetSchema>;

export function exampleVendorClient(fetchImpl?: typeof fetch) {
  const http = createVendorClient({
    name: 'example-vendor',
    baseUrl: env.EXAMPLE_VENDOR_BASE_URL,
    headers: { authorization: `Bearer ${env.EXAMPLE_VENDOR_API_KEY ?? ''}` },
    fetchImpl,
  });
  return {
    listWidgets: () => http.get('widgets', { schema: z.array(widgetSchema) }),
    getWidget: (id: string) =>
      http.get(`widgets/${encodeURIComponent(id)}`, { schema: widgetSchema }),
    renameWidget: (id: string, name: string, idempotencyKey: string) =>
      http.patch(`widgets/${encodeURIComponent(id)}`, {
        schema: widgetSchema,
        body: { name },
        idempotencyKey,
      }),
  };
}
