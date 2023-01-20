import { z } from "zod";

export const DecryptedPayload = z.object({
  email: z.string(),
  password: z.string(),
  app: z.string(),
  type: z.string(),
  settings: z.object({
    host: z.string(),
    port: z.number(),
    tls: z.union([z.boolean(), z.record(z.string())]),
  }),
});
export type DecryptedPayload = z.infer<typeof DecryptedPayload>;
