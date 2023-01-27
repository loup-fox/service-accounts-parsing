import { isSuccess } from "@fox/lib-common-tools";
import { DecryptPayload, FindAccount } from "@fox/lib-foxbrain-sdk";
import * as Logger from "@fox/logger";
import { bufferCount, filter, from, lastValueFrom, map, mergeMap } from "rxjs";
import { BigQueryWriter } from "./BigQueryWriter/index.js";
import { FetchMails } from "./FetchMails.js";
import { GetNewMails } from "./GetNewMails.js";
import { ParseMail } from "./index.js";

export const ProcessAccount =
  ({
    findAccount,
    getNewMails,
    decryptPayload,
    fetchMails,
    parseMail,
    writeToBq,
  }: {
    findAccount: FindAccount;
    getNewMails: GetNewMails;
    decryptPayload: DecryptPayload;
    fetchMails: FetchMails;
    parseMail: ParseMail;
    writeToBq: BigQueryWriter;
  }) =>
  async (accountId: string) => {
    const account = await findAccount(accountId);
    if (!account.success) {
      Logger.error("Error finding account", account.error);
      return;
    }
    const credentials = await decryptPayload(account.value.payload);
    if (!credentials.success) {
      Logger.error("Error decrypting credentials", credentials.error);
      return;
    }

    const $process = from(getNewMails(accountId)).pipe(
      mergeMap((mails) => fetchMails(credentials.value, mails)),
      bufferCount(50),
      map((mails) => mails.filter(isSuccess).map((x) => x.value)),
      mergeMap((mails) =>
        from(mails).pipe(
          mergeMap((mail) => parseMail(account.value, mail)),
          filter(isSuccess),
          map(({ value }) => value)
        )
      ),
      bufferCount(50),
      mergeMap((documents) => {
        Logger.info(`Writing ${documents.length} documents to BigQuery...`);
        return writeToBq(documents);
      }),
      map((result) => {
        if (!result.success) {
          Logger.error("Error writing to BigQuery", {
            message: result.error.message,
          });
          return "FAILURE";
        }
        return "SUCCESS";
      })
    );

    return lastValueFrom($process, { defaultValue: "EMPTY" });
  };
