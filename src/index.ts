import { Consumer } from "sqs-consumer";
import { SQSClient } from "@aws-sdk/client-sqs";
import { KMSClient } from "@aws-sdk/client-kms";
import ioredis from "ioredis";
import env from "env-var";
import { MongoClient, ObjectId } from "mongodb";
import * as Logger from "@fox/logger";
import { z } from "zod";

Logger.info("Starting service-mails-parsing-v2 service.");
const Redis = ioredis.default;

const INPUT_QUEUE = env.get("INPUT_QUEUE").required().asString();
const REDIS_URL = env.get("REDIS_URL").required().asString();
const MONGODB_PASSWORD = env.get("MONGODB_PASSWORD").required().asString();
const MONGODB_HOST = env.get("MONGODB_HOST").required().asString();
const MONGODB_USERNAME = env.get("MONGODB_USERNAME").required().asString();

const Parser = z.object({
  _id: z.instanceof(ObjectId),
  from: z.string(),
  subjectFilter: z.string(),
});
export type Parser = z.infer<typeof Parser>;

const MailReference = z.object({
  uid: z.string(),
  sender: z.string(),
  boxName: z.string(),
  subject: z.string(),
});
export type MailReference = z.infer<typeof MailReference>;

const mongo = new MongoClient(
  `mongodb+srv://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}`
);
await mongo.connect();
Logger.info("MongoDB connected successfully.");

const redis = new Redis(REDIS_URL);

const sqs = new SQSClient({
  region: "eu-central-1",
});
const kms = new KMSClient({
  region: "eu-central-1",
});

const parseAccountId = (body?: string) => {
  if (!body) {
    throw new Error("Body is empty");
  }
  const message = JSON.parse(body).Message;
  if (!message) {
    throw new Error("Message is empty");
  }
  return JSON.parse(message).accountId;
};

async function getParsers() {
  const parsers = await mongo
    .db("service-foxbrain")
    .collection("parsers")
    .find({
      activated: true,
      from: { $ne: "" },
      $or: [{ type: "mail" }, { type: { $exists: false } }],
    })
    .map(Parser.parse)
    .toArray();
  return parsers;
}

const parsers = await getParsers();

const popMailRef = async (accountId: string) => {
  const mail = await redis.lpop(`service-mails-fetching:mails:${accountId}`);
  if (mail) {
    return MailReference.parse(JSON.parse(mail));
  }
  return null;
};

const processAccount = async (accountId: string) => {
  const account = await mongo
    .db("service-foxbrain")
    .collection("accounts")
    .findOne({ _id: new ObjectId(accountId) });

  let mailRef = await popMailRef(accountId);
  while (mailRef !== null) {
    const { uid, sender, boxName, subject } = mailRef;

    Logger.info("sender", sender);
    Logger.info("subject", subject);

    const applicableParsers = parsers.filter((parser) => {
      const rFrom = new RegExp(parser.from.replace(/,/g, "|"), "i");
      console.log(rFrom.source);
      const rSubject = new RegExp(parser.subjectFilter, "i");
      const a = rFrom.exec(sender);
      const b = rSubject.exec(subject);
      console.log("a", { a });
      console.log("b", { b });
      return a && b;
    });

    console.log(applicableParsers.length);

    mailRef = await popMailRef(accountId);
  }
};

const consumer = Consumer.create({
  sqs,
  queueUrl: INPUT_QUEUE,
  async handleMessage({ Body }) {
    try {
      const accountId = parseAccountId(Body);
      await processAccount(accountId);
    } catch (error: any) {
      console.log(error);
    }
  },
});

consumer.start();
Logger.info("Listening to input queue");
