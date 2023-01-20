import { MongoClient, WithId } from "mongodb";
import { Parser } from "../types/Parser.js";

export const GetParsers =
  ({ mongo }: { mongo: MongoClient }) =>
  async () => {
    const parsers = await mongo
      .db("service-foxbrain")
      .collection<Parser>("parsers")
      .find({
        activated: true,
        from: { $ne: "" },
        $or: [{ type: "mail" }, { type: { $exists: false } }],
      })
      .toArray()
      .then((parsers) =>
        parsers.reduce((acc: { [key: string]: WithId<Parser> }, parser) => {
          acc[parser.name] = parser;
          return acc;
        }, {})
      );
    return parsers;
  };
