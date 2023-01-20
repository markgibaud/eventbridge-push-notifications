import { z } from 'zod';

export const requestSchema = z.object({
  device_token: z.string(),
  platform: z.string(),
  datetime: z.string(),
  message: z.string(),
  bundle_id: z.string(),
});
