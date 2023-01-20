import { z } from "zod";

const Parser = z.object({
  name: z.string(),
  from: z.string(),
  subjectFilter: z.string(),
  htmlFilter: z.string(),
  pdf: z.boolean(),
  idParser: z.string(),
  version: z.string(),
});
export type Parser = z.infer<typeof Parser>;
