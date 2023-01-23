import { MongoClient, WithId } from "mongodb";
import { Parser } from "../types/Parser.js";
import { ParserRepository } from "../types/ParserRepository.js";

export const DummyParserRepository = async ({
  mongo,
}: {
  mongo: MongoClient;
}): Promise<ParserRepository> => {
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
  return {
    get(name: string) {
      return parsers[name];
    },
    all() {
      return Object.values(parsers);
    },
  };
};
