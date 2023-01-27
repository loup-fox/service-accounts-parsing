import { Result, Success } from "@fox/lib-common-tools";
import { Account, sha1 } from "@fox/lib-foxbrain-sdk";
import * as Logger from "@fox/logger";
import { Axios } from "axios";
import { WithId } from "mongodb";
import { getOrderId } from "../../helpers/index.js";
import { FetchedMail } from "../../types/FetchedMail.js";
import { ParsedDocument } from "../../types/ParsedDocument.js";
import { ParserRepository } from "../../types/ParserRepository.js";
import { callParsingLambda } from "./callParsingLambda.js";

export const ParseMail = ({
  axios,
  parsers,
}: {
  axios: Axios;
  parsers: ParserRepository;
}) =>
  async function* (
    account: WithId<Account>,
    mail: FetchedMail
  ): AsyncGenerator<Result<ParsedDocument>> {
    for (const parserName of mail.parsers) {
      const parser = parsers.get(parserName);
      const parsingResult = await callParsingLambda(axios, parser, mail);

      if (!parsingResult.success) {
        Logger.info(
          `Failed to call parsing Lambda with mail ${mail.uid} and parser ${parserName}`,
          {
            error: parsingResult.error.message,
          }
        );
        continue;
      }

      const { results: items } = parsingResult.value;
      Logger.info(`Parsed mail ${mail.uid} with parser ${parserName}`);

      for (const [index, item] of items.entries()) {
        const enriched = {
          ...item,
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
            items,
            {
              data: {
                originalOrderNumber: item.data.originalOrderNumber,
              },
              from: mail.headers.from,
              date: mail.headers.date,
              uid: mail.uid,
            },
            account.userId.toHexString()
          ),
        };
        Logger.info(`Enriched mail ${mail.uid} with parser ${parserName}`, {
          enriched,
        });
        yield Success(enriched);
      }
    }
  };

export type ParseMail = ReturnType<typeof ParseMail>;
