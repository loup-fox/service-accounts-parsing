import { KMSClient } from "@aws-sdk/client-kms";
import { SQSClient } from "@aws-sdk/client-sqs";
import { DecryptPayload, FindAccount } from "@fox/lib-foxbrain-sdk";
import { isSuccess, Success } from "@fox/lib-common-tools";
import * as Logger from "@fox/logger";
import * as Axios from "axios";
import env from "env-var";
import ioredis from "ioredis";
import { MongoClient } from "mongodb";
import {
  buffer,
  bufferCount,
  filter,
  from,
  lastValueFrom,
  map,
  mergeMap,
  windowCount,
} from "rxjs";
import { Consumer } from "sqs-consumer";
import { parseAccountId } from "./helpers/index.js";
import { BigQueryWriter } from "./process/BigQueryWriter/index.js";
import { DummyParserRepository } from "./process/DummyParserRepository.js";
import { FetchMails, GetNewMails, ParseMails } from "./process/index.js";
import { FetchedMail } from "./types/FetchedMail.js";

Logger.info("Starting service-mails-parsing-v2 service.");

const INPUT_QUEUE = env.get("INPUT_QUEUE").required().asString();
const REDIS_URL = env.get("REDIS_URL").required().asString();
const MONGODB_PASSWORD = env.get("MONGODB_PASSWORD").required().asString();
const MONGODB_HOST = env.get("MONGODB_HOST").required().asString();
const MONGODB_USERNAME = env.get("MONGODB_USERNAME").required().asString();
const KEY_ID = env.get("KEY_ID").required().asString();
const PARSEMAIL_URL = env.get("PARSEMAIL_URL").required().asString();
const PROJECT_ID = env.get("PROJECT_ID").required().asString();

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

const fetchMails = FetchMails({ parsers });
const parseMails = ParseMails({ parsers, axios });
const getNewMails = GetNewMails({ parsers, redis });
const findAccount = FindAccount({ mongo });
const decryptPayload = DecryptPayload({ kms, KEY_ID });
const writeToBq = BigQueryWriter();

const processAccount = async (accountId: string) => {
  const account = await findAccount(accountId);
  if (!account.success) {
    Logger.error("Error finding account", account.error);
    return;
  }

  const mails = await getNewMails(accountId);
  if (mails.length === 0) {
    Logger.info(`No new mails for account ${accountId}.`);
    return;
  }

  Logger.info(`Processing ${mails.length} mails for account ${accountId}...`);

  const credentials = await decryptPayload(account.value.payload);
  if (!credentials.success) {
    Logger.error("Error decrypting credentials", credentials.error);
    return;
  }

  const $process = from(fetchMails(credentials.value, mails)).pipe(
    bufferCount(50),
    map((mails) => mails.filter(isSuccess).map((x) => x.value)),
    mergeMap((mails) => parseMails(account.value, mails)),
    bufferCount(5),
    map((mails) => mails.filter(isSuccess).map((x) => x.value)),
    mergeMap((mails) => writeToBq(mails)),
    map((result) => {
      if (!result.success) {
        Logger.error("Error writing to BigQuery", {
          message: result.error.message,
        });
      }
    })
  );

  return lastValueFrom($process);
};

const consumer = Consumer.create({
  sqs,
  queueUrl: INPUT_QUEUE,
  async handleMessage({ Body }) {
    try {
      const accountId = parseAccountId(Body);
      Logger.info(`Processing account ${accountId}...`);
      await processAccount(accountId);
    } catch (error: any) {
      Logger.error(error);
    }
  },
});

consumer.start();
Logger.info("Listening to input queue");
