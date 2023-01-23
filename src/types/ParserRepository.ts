import { WithId } from "mongodb";
import { Parser } from "./Parser.js";

export interface ParserRepository {
  get(name: string): WithId<Parser>;
  all(): WithId<Parser>[];
}
