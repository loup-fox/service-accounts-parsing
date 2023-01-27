import { z } from "zod";
import { ParsedItem } from "./ParsedItem.js";

export const ParsingServiceSuccess = z.object({
  results: z.array(ParsedItem),
});
export const ParsingServiceFailure = z.object({
  errorType: z.string().nullish(),
  errorMessage: z
    .string()
    // .transform((value) => {
    //   return z
    //     .object({
    //       error: z.string(),
    //       logs: z.unknown().array().nullish(),
    //     })
    //     .parse(JSON.parse(value));
    // })
    .nullish(),
  trace: z.unknown().array().nullish(),
});
export const ParsingServiceResult = z.union([
  ParsingServiceSuccess,
  ParsingServiceFailure,
]);
export type ParsingServiceSuccess = z.infer<typeof ParsingServiceSuccess>;
export type ParsingServiceFailure = z.infer<typeof ParsingServiceFailure>;
export type ParsingServiceResult = z.infer<typeof ParsingServiceResult>;
