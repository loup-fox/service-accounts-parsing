import { Try } from "@fox/lib-common-tools";
import { MongoClient, ObjectId } from "mongodb";
import { Account } from "../types/Account.js";

export const FindAccount =
  ({ mongo }: { mongo: MongoClient }) =>
  async (accountId: string) => {
    return Try(async () => {
      const account = await mongo
        .db("service-foxbrain")
        .collection<Account>("accounts")
        .findOne({ _id: new ObjectId(accountId) });
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }
      return account;
    });
  };
