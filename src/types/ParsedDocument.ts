import { z } from "zod";
import { ParsedItem } from "./ParsedItem.js";

export const ParsedDocument = z
  .object({
    accountId: z.string(),
    boxName: z.string(),
    createdAt: z.date(),
    date: z.date(),
    documentId: z.string(),
    domain: z.string(),
    from: z.string(),
    _id: z.string(),
    index: z.number(),
    orderId: z.string(),
    parserIdSql: z.string(),
    parserId: z.string(),
    parserName: z.string(),
    parserVersion: z.string(),
    parser: z.string(),
    signature: z.string(),
    uid: z.number(),
    userId: z.string(),
  })
  .merge(ParsedItem);
export type ParsedDocument = z.infer<typeof ParsedDocument>;
