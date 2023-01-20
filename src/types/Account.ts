import { ObjectId } from "mongodb";
import { z } from "zod";

export const Account = z.object({
  isAccessible: z.boolean(),
  updateAt: z.date(),
  payload: z.string(),
  userId: z.instanceof(ObjectId),
});
export type Account = z.infer<typeof Account>;
