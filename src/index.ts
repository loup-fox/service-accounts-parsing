import { KMSClient } from "@aws-sdk/client-kms";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DecryptPayload, FindAccount, AnyEvent } from "@fox/lib-foxbrain-sdk";
import * as Logger from "@fox/logger";
import * as Axios from "axios";
import env from "env-var";
import ioredis from "ioredis";
import { MongoClient } from "mongodb";
import { Consumer } from "sqs-consumer";
import { z } from "zod";
import { BigQueryWriter } from "./process/BigQueryWriter/index.js";
import { DummyParserRepository } from "./process/DummyParserRepository.js";
import { FetchMails, GetNewMails, ParseMail } from "./process/index.js";
import { ProcessAccount } from "./process/ProcessAccount.js";

Logger.info("Starting service-mails-parsing-v2 service.");

const INPUT_QUEUE = env.get("INPUT_QUEUE").required().asString();
const REDIS_URL = env.get("REDIS_URL").required().asString();
const MONGODB_PASSWORD = env.get("MONGODB_PASSWORD").required().asString();
const MONGODB_HOST = env.get("MONGODB_HOST").required().asString();
const MONGODB_USERNAME = env.get("MONGODB_USERNAME").required().asString();
const KEY_ID = env.get("KEY_ID").required().asString();
const PARSEMAIL_URL = env.get("PARSEMAIL_URL").required().asString();

const mongo = new MongoClient(
  `mongodb+srv://${MONGODB_USERNAME}:${MONGODB_PASSWORD}@${MONGODB_HOST}`
);
await mongo.connect();
Logger.info("MongoDB connected successfully.");

const Redis = ioredis.Redis;
const redis = new Redis(REDIS_URL);
Logger.info("Redis connected successfully.");

const axios = Axios.default.create({
  baseURL: PARSEMAIL_URL,
});

const sqs = new SQSClient({
  region: "eu-central-1",
});
const kms = new KMSClient({
  region: "eu-central-1",
});

const parsers = await DummyParserRepository({ mongo });

const processAccount = ProcessAccount({
  decryptPayload: DecryptPayload({ kms, KEY_ID }),
  fetchMails: FetchMails({ parsers }),
  findAccount: FindAccount({ mongo }),
  getNewMails: GetNewMails({ parsers, redis }),
  parseMail: ParseMail({ parsers, axios }),
  writeToBq: BigQueryWriter(),
});

const consumer = Consumer.create({
  sqs,
  queueUrl: INPUT_QUEUE,
  async handleMessage({ Body }) {
    try {
      if (Body) {
        const event = AnyEvent.parse(JSON.parse(Body));
        if (event.tag === "account:fetched:1") {
          Logger.info(`Processing account ${event.modelId}...`);
          await processAccount(event.modelId);
        } else {
          Logger.warn(
            `Ignoring event ${event.tag} for account ${event.modelId}`
          );
        }
      }
    } catch (error: any) {
      Logger.error(error);
    }
  },
});

consumer.start();
Logger.info("Listening to input queue");
