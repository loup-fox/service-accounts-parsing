import * as Logger from "@fox/logger";
import _ from "lodash";
import { MailReference } from "../types/MailReference.js";
import { NewMail } from "../types/NewMail.js";
import { Redis } from "ioredis";
import { Parser } from "../types/Parser.js";

export const GetNewMails =
  ({ redis, parsers }: { redis: Redis; parsers: Record<string, Parser> }) =>
  async (accountId: string): Promise<NewMail[]> => {
    const popMailReferences = async (
      accountId: string
    ): Promise<MailReference[] | null> => {
      const mailBatch = await redis.lpop(
        `service-mails-fetching:mails:${accountId}`,
        500
      );
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
    let mailsRef = await popMailReferences(accountId);
    const mailsToProcess: NewMail[] = [];
    while (mailsRef !== null) {
      for (const mailRef of mailsRef) {
        const { uid, sender, path, subject } = mailRef;
        const applicableParsers = _.filter(parsers, (parser) => {
          const rFrom = new RegExp(parser.from.replace(/,/g, "|"), "i");
          const rSubject = new RegExp(parser.subjectFilter, "i");
          return !!rFrom.exec(sender) && !!rSubject.exec(subject);
        });

        if (applicableParsers.length > 0) {
          // Logger.info(
          //   "Applicable parsers (by from / subject): " +
          //     applicableParsers.map((x) => x.name).join(", ")
          // );
          mailsToProcess.push({
            accountId,
            uid,
            path,
            parsers: applicableParsers.map((x) => x.name),
          });
        }
      }
      mailsRef = await popMailReferences(accountId);
    }
    const end = new Date();
    const duration = end.getTime() - started.getTime();
    Logger.info(`Got ${mailsToProcess.length} new mails in ${duration}ms.`);
    return mailsToProcess;
  };
