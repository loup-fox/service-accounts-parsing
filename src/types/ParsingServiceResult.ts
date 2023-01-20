import { z } from "zod";
import { ParsedItem } from "./ParsedItem.js";

export const ParsingServiceResult = z.object({
  results: z.array(ParsedItem),
});
export type ParsingServiceResult = z.infer<typeof ParsingServiceResult>;
