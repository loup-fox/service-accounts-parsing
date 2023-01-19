import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { SQSClient } from "@aws-sdk/client-sqs";
import * as Logger from "@fox/logger";
import { createClient } from "@redis/client";
import * as Axios from "axios";
import crypto from "crypto";
import env from "env-var";
import { ImapFlow } from "imapflow";
import _ from "lodash";
import { simpleParser } from "mailparser";
import { MongoClient, ObjectId } from "mongodb";
import { Consumer } from "sqs-consumer";
import { z } from "zod";

Logger.info("Starting service-mails-parsing-v2 service.");

const INPUT_QUEUE = env.get("INPUT_QUEUE").required().asString();
const REDIS_URL = env.get("REDIS_URL").required().asString();
const MONGODB_PASSWORD = env.get("MONGODB_PASSWORD").required().asString();
const MONGODB_HOST = env.get("MONGODB_HOST").required().asString();
const MONGODB_USERNAME = env.get("MONGODB_USERNAME").required().asString();
const KEY_ID = env.get("KEY_ID").required().asString();
const PARSEMAIL_URL = env.get("PARSEMAIL_URL").required().asString();

export const Account = z.object({
  isAccessible: z.boolean(),
  updateAt: z.date(),
  payload: z.string(),
  userId: z.instanceof(ObjectId),
});
export type Account = z.infer<typeof Account>;

type NewMail = {
  accountId: string;
  uid: string;
  boxName: string;
  parsers: string[];
};
type FetchedMail = NewMail & {
  headers: {
    date: Date;
    from: string;
    subject: string;
    to: string;
    signature: string;
  };
  html: string;
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
  htmlFilter: z.string(),
  pdf: z.boolean(),
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

const redis = createClient({
  url: REDIS_URL,
});
await redis.connect();
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

const extractPdfAttachements = (rawMail: FetchedMail, parser: Parser) => {
  //* From dev-npm-foxapi
  // if (parser.pdf && !pdfContent.value) {
  //   if (rawMail.attachments && rawMail.attachments.length > 0) {
  //     const pdfs = rawMail.attachments.filter(
  //       (attachment) =>
  //         attachment.contentType === "application/pdf" ||
  //         attachment.contentType === "application/octet-stream"
  //     );
  //     let extractedPdfContent;
  //     for (let i = 0; i < pdfs.length && !extractedPdfContent; i += 1) {
  //       try {
  //         const pdfExtractionResult = await Pdf.toHtml(pdfs[i]);
  //         extractedPdfContent = pdfExtractionResult;
  //       } catch (error) {
  //         Logger.error(error);
  //       }
  //     }
  //     if (!extractedPdfContent) {
  //       throw new Error("pdf attachment is null");
  //     }
  //     pdfContent.value = extractedPdfContent; //! this makes no sense
  //   } else {
  //     throw new Error("pdf attachment is null");
  //   }
  // }
};

const parseMails = async (mails: FetchedMail[]) => {
  Logger.info(`Parsing ${mails.length} mails`);
  for (const mail of mails) {
    for (const parserName of mail.parsers) {
      const parser = parsers[parserName];
      const result = await axios.post("/parse", {
        parser,
        mail: {
          headers: {
            date: mail.headers.date,
            from: mail.headers.from,
            subject: mail.headers.subject,
            to: mail.headers.to,
            signature: mail.headers.signature,
          },
          html: mail.html,
        },
        postParser: true,
        hash: true,
        sanityCheck: true,
      });
      Logger.info(`Parsed mail ${mail.uid} with parser ${parserName}`);
      Logger.info("Data", result.data);
    }
  }
};

const fetchMails = async (credentials: DecryptedPayload, mails: NewMail[]) => {
  Logger.info(`Fetching ${mails.length} mails`);
  const results: FetchedMail[] = [];
  const signatures: { [key: string]: boolean } = {};
  const boxes = _(mails)
    .groupBy("boxName")
    .mapValues((mails) =>
      mails.reduce((acc, el) => {
        acc[el.uid] = el;
        return acc;
      }, {} as Record<string, NewMail>)
    )
    .value();

  Logger.info(`${_.size(boxes)} boxes to process`);

  if (_.size(boxes) > 0) {
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
    Logger.info(`IMAP connected successfully.`);
    for (const [boxName, mails] of _.entries(boxes)) {
      Logger.info(`Fetching mails from box ${boxName}...`);
      const lock = await imap.getMailboxLock(boxName);

      try {
        for await (const message of imap.fetch(
          { or: _.map(mails, (mail) => ({ uid: mail.uid })) },
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
          const parsedMessage = await simpleParser(message.source, {
            skipTextToHtml: true,
            skipTextLinks: true,
          });
          const html =
            typeof parsedMessage.html === "string" ? parsedMessage.html : "";
          const newMail = boxes[boxName][message.uid];
          const allowedParsers = _.filter(newMail.parsers, (parserName) => {
            const parser = parsers[parserName];
            const rHtmlFilter = new RegExp(parser.htmlFilter, "i");
            return !rHtmlFilter.test(html);
          });
          if (allowedParsers.length === 0) {
            Logger.info(
              `Mail ${message.uid} in box ${boxName} has no allowed parsers. Skipping.`
            );
            continue;
          }
          const signature = sha1(
            message.internalDate.getTime() +
              (parsedMessage.subject ?? "") +
              (parsedMessage.from?.text ?? "") +
              parsedMessage.to
          );
          const date = parsedMessage.date;
          const from = parsedMessage.from;
          const subject = parsedMessage.subject;
          const to = parsedMessage.to;
          if (!date) {
            Logger.warn(
              `Mail ${message.uid} in box ${boxName} has no date. Skipping.`
            );
            continue;
          }
          if (!from) {
            Logger.warn(
              `Mail ${message.uid} in box ${boxName} has no from. Skipping.`
            );
            continue;
          }
          if (!subject) {
            Logger.warn(
              `Mail ${message.uid} in box ${boxName} has no subject. Skipping.`
            );
            continue;
          }
          if (!to) {
            Logger.warn(
              `Mail ${message.uid} in box ${boxName} has no to. Skipping.`
            );
            continue;
          }
          if (!signatures[signature]) {
            const result: FetchedMail = {
              html,
              accountId: newMail.accountId,
              boxName: boxName,
              uid: message.uid.toString(),
              parsers: newMail.parsers,
              headers: {
                date,
                from: from.text,
                subject,
                to: _.isArray(to) ? to.map((t) => t.text).join(", ") : to.text,
                signature,
              },
            };
            results.push(result);
            signatures[signature] = true;
          } else {
            Logger.info(
              `Mail ${message.uid} in box ${boxName} has duplicate signature. Skipping.`
            );
          }
        }
      } finally {
        lock.release();
      }
    }
    imap.close();
    Logger.info(`IMAP closed successfully.`);
  }
  Logger.info(`Fetched ${results.length} mails`);
  return results;
};

const decryptPayload = async (payload: string) => {
  const result = await kms.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(payload, "base64"),
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

const findAccount = async (accountId: string) => {
  const account = await mongo
    .db("service-foxbrain")
    .collection<Account>("accounts")
    .findOne({ _id: new ObjectId(accountId) });
  if (!account) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }
  return account;
};

const time = async <R>(fn: () => Promise<R>, name: string) => {
  const started = new Date();
  const result = await fn();
  const ended = new Date();
  Logger.info(
    `Function ${name} took ${ended.getTime() - started.getTime()} ms`
  );
  return result;
};

const getNewMails = async (accountId: string): Promise<NewMail[]> => {
  const popMailsRef = async (
    accountId: string
  ): Promise<MailReference[] | null> => {
    const mailBatch = await redis.sendCommand([
      "LPOP",
      `service-mails-fetching:mails:${accountId}`,
      50 + "",
    ]);
    if (Array.isArray(mailBatch)) {
      return mailBatch
        .map((mail) => {
          if (typeof mail === "string") {
            return MailReference.parse(JSON.parse(mail));
          }
        })
        .filter((x): x is MailReference => !!x);
    }
    return null;
  };
  const started = new Date();
  let mailsRef = await popMailsRef(accountId);
  const mailsToProcess: NewMail[] = [];
  while (mailsRef !== null) {
    for (const mailRef of mailsRef) {
      const { uid, sender, boxName, subject } = mailRef;
      const applicableParsers = _.filter(parsers, (parser) => {
        const rFrom = new RegExp(parser.from.replace(/,/g, "|"), "i");
        const rSubject = new RegExp(parser.subjectFilter, "i");
        return !!rFrom.exec(sender) && !!rSubject.exec(subject);
      });

      if (applicableParsers.length > 0) {
        Logger.info(
          "Applicable parsers (by from / subject): " +
            applicableParsers.map((x) => x.name).join(", ")
        );
        mailsToProcess.push({
          accountId,
          uid,
          boxName,
          parsers: applicableParsers.map((x) => x.name),
        });
      }
    }
    mailsRef = await popMailsRef(accountId);
  }
  const end = new Date();
  const duration = end.getTime() - started.getTime();
  Logger.info(`Got ${mailsToProcess.length} new mails in ${duration}ms.`);
  return mailsToProcess;
};

const processAccount = async (accountId: string) => {
  const account = await findAccount(accountId);
  const mails = await getNewMails(accountId);
  if (mails.length === 0) {
    Logger.info(`No new mails for account ${accountId}.`);
    return;
  }

  Logger.info(`Processing ${mails.length} mails for account ${accountId}...`);

  const credentials = await decryptPayload(account.payload);
  const rawMails = await fetchMails(credentials, mails);
  const parsedMails = await parseMails(rawMails);
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
      console.log(error);
    }
  },
});

consumer.start();
Logger.info("Listening to input queue");
