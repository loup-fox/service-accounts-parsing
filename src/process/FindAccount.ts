import { MongoClient, ObjectId } from "mongodb";
import { Account } from "../types/Account.js";

export const FindAccount =
  ({ mongo }: { mongo: MongoClient }) =>
  async (accountId: string) => {
    const account = await mongo
      .db("service-foxbrain")
      .collection<Account>("accounts")
      .findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }
    return account;
  };
