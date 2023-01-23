import * as Logger from "@fox/logger";
import { Axios } from "axios";
import { WithId } from "mongodb";
import { sha1, getOrderId } from "../helpers/index.js";
import { Account } from "../types/Account.js";
import { FetchedMail } from "../types/FetchedMail.js";
import { ParserRepository } from "../types/ParserRepository.js";
import { ParsingServiceResult } from "../types/ParsingServiceResult.js";

export const ParseMails =
  ({ axios, parsers }: { axios: Axios; parsers: ParserRepository }) =>
  async (account: WithId<Account>, mails: FetchedMail[]) => {
    Logger.info(`Parsing ${mails.length} mails`);
    for (const mail of mails) {
      for (const parserName of mail.parsers) {
        const parser = parsers.get(parserName);
        const axiosResponse = await axios.post(
          "/parse",
          {
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
          },
          { headers: { "Content-Type": "application/json" } }
        );
        const result = ParsingServiceResult.safeParse(axiosResponse.data);
        if (result.success) {
          const { results } = result.data;
          Logger.info(`Parsed mail ${mail.uid} with parser ${parserName}`);

          const enriched = results.map((result, index) => {
            return {
              ...result,
              createdAt: mail.headers.date,
              date: mail.headers.date,
              parser: parser.name,
              parserName: parser.name,
              parserId: parser._id.toString(),
              parserIdSql: parser.idParser,
              parserVersion: parser.version,
              accountId: account._id.toString(),
              userId: account.userId,
              _id: "<to do>",
              boxName: mail.path,
              uid: mail.uid,
              signature: mail.headers.signature,
              domain: mail.headers.from.split("@")[1],
              from: mail.headers.from,
              documentId: sha1(
                parser.name +
                  mail.headers.from +
                  account.userId +
                  mail.headers.date +
                  mail.uid +
                  index
              ),
              index,
              orderId: getOrderId(
                parserName,
                results,
                {
                  data: {
                    originalOrderNumber: result.data.originalOrderNumber,
                  },
                  from: mail.headers.from,
                  date: mail.headers.date,
                  uid: mail.uid,
                },
                account.userId.toHexString()
              ),
            };
          });

          Logger.info(`Enriched mail ${mail.uid} with parser ${parserName}`, {
            enriched,
          });

          return enriched;
        } else {
          // Logger.info(
          //   `Failed to parse mail ${mail.uid} with parser ${parserName}`
          // );
          return [];
        }
      }
    }
  };
