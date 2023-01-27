import { Failure, Result, Success, Try } from "@fox/lib-common-tools";
import * as Logger from "@fox/logger";
import { ImapFlow } from "imapflow";
import _ from "lodash";
import { simpleParser } from "mailparser";
import { sha1 } from "@fox/lib-foxbrain-sdk";
import { DecryptedPayload } from "@fox/lib-foxbrain-sdk";
import { FetchedMail } from "../types/FetchedMail.js";
import { NewMail } from "../types/NewMail.js";
import { ParserRepository } from "../types/ParserRepository.js";

export type Dependencies = {
  parsers: ParserRepository;
};

export const FetchMails = ({ parsers }: Dependencies) =>
  async function* (
    credentials: DecryptedPayload,
    mails: NewMail[]
  ): AsyncGenerator<Result<FetchedMail>> {
    Logger.info(`Fetching ${mails.length} mails`);
    const signatures: { [key: string]: boolean } = {};
    const boxes = _(mails)
      .groupBy((x) => x.path)
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
      const connect = await Try(() => imap.connect());
      if (!connect.success) {
        Logger.info(`IMAP connected successfully.`);
        return Failure(connect.error);
      }
      for (const [path, mails] of _.entries(boxes)) {
        Logger.info(`Fetching mails from box ${path}...`);
        const lock = await Try(() => imap.getMailboxLock(path));
        if (!lock.success) {
          Logger.warn(`Failed to lock box ${path}. Skipping.`);
          continue;
        }

        try {
          for await (const message of imap.fetch(
            { or: _.map(mails, (mail) => ({ uid: mail.uid.toString() })) },
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
            const newMail = boxes[path][message.uid];
            const allowedParsers = _.filter(newMail.parsers, (parserName) => {
              const parser = parsers.get(parserName);
              const rHtmlFilter = new RegExp(parser.htmlFilter, "i");
              return !rHtmlFilter.test(html);
            });
            if (allowedParsers.length === 0) {
              // Logger.info(
              //   `Mail ${message.uid} in box ${path} has no allowed parsers. Skipping.`
              // );
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
              // Logger.warn(
              //   `Mail ${message.uid} in box ${path} has no date. Skipping.`
              // );
              continue;
            }
            if (!from) {
              // Logger.warn(
              //   `Mail ${message.uid} in box ${path} has no from. Skipping.`
              // );
              continue;
            }
            if (!subject) {
              // Logger.warn(
              //   `Mail ${message.uid} in box ${path} has no subject. Skipping.`
              // );
              continue;
            }
            if (!to) {
              // Logger.warn(
              //   `Mail ${message.uid} in box ${path} has no to. Skipping.`
              // );
              continue;
            }
            if (!signatures[signature]) {
              const result: FetchedMail = {
                html,
                accountId: newMail.accountId,
                path,
                uid: message.uid,
                parsers: newMail.parsers,
                headers: {
                  date,
                  from: from.text,
                  subject,
                  to: _.isArray(to)
                    ? to.map((t) => t.text).join(", ")
                    : to.text,
                  signature,
                },
              };
              yield Success(result);
              signatures[signature] = true;
            } else {
              // Logger.info(
              //   `Mail ${message.uid} in box ${path} has duplicate signature. Skipping.`
              // );
            }
          }
        } finally {
          lock.value.release();
        }
      }
      imap.close();
      Logger.info(`IMAP closed successfully.`);
    }
  };

export type FetchMails = ReturnType<typeof FetchMails>;
