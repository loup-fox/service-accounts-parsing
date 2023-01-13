import { Consumer } from "sqs-consumer";
import { SQSClient } from "@aws-sdk/client-sqs";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";
import ioredis from "ioredis";
import env from "env-var";
import { MongoClient, ObjectId } from "mongodb";
import * as Logger from "@fox/logger";
import { z } from "zod";
import { simpleParser } from "mailparser";
import _ from "lodash";
import { ImapFlow, MailboxCreateResponse } from "imapflow";
import crypto from "crypto";

Logger.info("Starting service-mails-parsing-v2 service.");
const Redis = ioredis.default;

const INPUT_QUEUE = env.get("INPUT_QUEUE").required().asString();
const REDIS_URL = env.get("REDIS_URL").required().asString();
const MONGODB_PASSWORD = env.get("MONGODB_PASSWORD").required().asString();
const MONGODB_HOST = env.get("MONGODB_HOST").required().asString();
const MONGODB_USERNAME = env.get("MONGODB_USERNAME").required().asString();
const KEY_ID = env.get("KEY_ID").required().asString();

export const Account = z.object({
  isAccessible: z.boolean(),
  updateAt: z.date(),
  payload: z.string(),
  userId: z.instanceof(ObjectId),
});
export type Account = z.infer<typeof Account>;

type MailToParse = {
  accountId: string;
  uid: string;
  boxName: string;
  parsers: string[];
};

export const DecryptedPayload = z.object({
  email: z.string(),
  password: z.string(),
  app: z.string(),
  type: z.string(),
  settings: z.object({
    host: z.string(),
    port: z.number(),
    tls: z.union([z.boolean(), z.record(z.string())]),
  }),
});
export type DecryptedPayload = z.infer<typeof DecryptedPayload>;

const Parser = z.object({
  name: z.string(),
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

const sha1 = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex");

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
    .collection<Parser>("parsers")
    .find({
      activated: true,
      from: { $ne: "" },
      $or: [{ type: "mail" }, { type: { $exists: false } }],
    })
    .toArray()
    .then((parsers) =>
      parsers.reduce((acc: { [key: string]: Parser }, parser) => {
        acc[parser.name] = parser;
        return acc;
      }, {})
    );
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

type FetchedMail = {
  body: {
    html?: string;
    text?: string;
    date: Date;
    from: string;
    subject: string;
    to: string;
    signature: string;
  };
};

const fetchMails = async (
  credentials: DecryptedPayload,
  mails: MailToParse[]
) => {
  const signatures: { [key: string]: boolean } = {};
  const boxes = _.chain(mails)
    .reduce(
      (
        acc: { [key: string]: { boxName: string; mails: MailToParse[] } },
        mail
      ) => {
        if (!acc[mail.boxName]) {
          acc[mail.boxName] = { boxName: mail.boxName, mails: [] };
        }
        if (!acc[mail.boxName].mails.find((x) => x.uid === mail.uid)) {
          acc[mail.boxName].mails.push(mail);
        }
        return acc;
      },
      {}
    )
    .values()
    .filter((x) => x.mails.length > 0)
    .value();

  if (boxes.length > 0) {
    const imap = new ImapFlow({
      logger: false,
      host: credentials.settings.host,
      port: credentials.settings.port,
      auth: {
        user: credentials.email,
        pass: credentials.password,
      },
    });
    await imap.connect();
    Logger.info(
      `IMAP connected successfully processing ${boxes.length} boxes.`
    );
    for (const box of boxes) {
      const lock = await imap.getMailboxLock(box.boxName);

      for await (const message of imap.fetch(
        { or: box.mails.map((mail) => ({ uid: mail.uid })) },
        {
          uid: true,
          flags: true,
          bodyStructure: true,
          envelope: true,
          source: true,
          //@ts-ignore invalid types for ImapFlow
          date: true,
          internalDate: true,
          size: true,
          headers: ["date", "subject", "from", "to"],
        },
        { uid: true }
      )) {
        const result: any = { ...message };
        result.folder_name = box.boxName;
        result.body = await simpleParser(message.source, {
          skipHtmlToText: true,
          skipTextLinks: true,
        });
        result.body.signature = sha1(
          message.internalDate.getTime() +
            result.body.subject +
            result.body.from.text +
            result.body.to
        );
        if (result.body.attachments && result.body.attachments.length > 0) {
          const pdfAttachment = result.body.attachments.find(
            (a: any) =>
              a.contentType === "application/pdf" ||
              a.contentType === "application/octet-stream"
          );

          if (pdfAttachment) {
            result.body.pdf = await pdf.toHtml(pdfAttachment);
          }
        }
        console.log("fetched email", {
          uid: message.uid,
          boxName: box.boxName,
          subject: message.envelope.subject,
          // from: message.envelope.from[0].address,
          // to: message.envelope.to[0].address,
        });
      }
      lock.release();
    }
    imap.close();
  }
};

const decryptPayload = async (account: Account) => {
  const result = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(account.payload, "base64"),
      KeyId: KEY_ID,
    })
  );
  if (!result.Plaintext) {
    throw new Error("PAYLOAD_DECRYPT_IS_EMPTY");
  }
  return DecryptedPayload.parse(
    JSON.parse(Buffer.from(result.Plaintext).toString("utf-8"))
  );
};

const processAccount = async (accountId: string) => {
  let mailRef = await popMailRef(accountId);
  const mailsToProcess: MailToParse[] = [];
  while (mailRef !== null) {
    const { uid, sender, boxName, subject } = mailRef;
    const applicableParsers = _.filter(parsers, (parser) => {
      const rFrom = new RegExp(parser.from.replace(/,/g, "|"), "i");
      const rSubject = new RegExp(parser.subjectFilter, "i");
      return !!rFrom.exec(sender) && !!rSubject.exec(subject);
    });

    if (applicableParsers.length > 0) {
      mailsToProcess.push({
        accountId,
        uid,
        boxName,
        parsers: applicableParsers.map((x) => x.name),
      });
    }
    mailRef = await popMailRef(accountId);
  }
  const account = await mongo
    .db("service-foxbrain")
    .collection<Account>("accounts")
    .findOne({ _id: new ObjectId(accountId) });
  if (!account) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }
  const credentials = await decryptPayload(account);

  await fetchMails(credentials, mailsToProcess);
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
