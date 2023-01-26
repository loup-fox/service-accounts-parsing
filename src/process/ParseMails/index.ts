import { Result, Success } from "@fox/lib-common-tools";
import * as Logger from "@fox/logger";
import { Axios } from "axios";
import { WithId } from "mongodb";
import { sha1, getOrderId } from "../../helpers/index.js";
import { Account } from "../../types/Account.js";
import { FetchedMail } from "../../types/FetchedMail.js";
import { ParsedDocument } from "../../types/ParsedDocument.js";
import { ParserRepository } from "../../types/ParserRepository.js";
import { callParsingLambda } from "./callParsingLambda.js";

export const ParseMails =
  ({ axios, parsers }: { axios: Axios; parsers: ParserRepository }) =>
  async (
    account: WithId<Account>,
    mails: FetchedMail[]
  ): Promise<Result<ParsedDocument[]>> => {
    Logger.info(`Parsing ${mails.length} mails`);
    const result: ParsedDocument[] = [];
    for (const mail of mails) {
      for (const parserName of mail.parsers) {
        const parser = parsers.get(parserName);
        const result = await callParsingLambda(axios, parser, mail);

        if (!result.success) {
          Logger.info(
            `Failed to call parsing Lambda with mail ${mail.uid} and parser ${parserName}`,
            {
              error: result.error,
            }
          );
          continue;
        }

        const { results } = result.value;
        Logger.info(`Parsed mail ${mail.uid} with parser ${parserName}`);

        const enriched = results.map((result, index): ParsedDocument => {
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
            userId: account.userId.toHexString(),
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

        results.concat(enriched);
      }
    }
    return Success(result);
  };
