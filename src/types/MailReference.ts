import { z } from "zod";

export const MailReference = z.object({
  uid: z.string().transform((x) => parseInt(x, 10)),
  sender: z.string(),
  path: z.string(),
  subject: z.string(),
});
export type MailReference = z.infer<typeof MailReference>;
