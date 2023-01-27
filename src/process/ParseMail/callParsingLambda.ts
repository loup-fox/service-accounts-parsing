import { Axios } from "axios";
import * as Logger from "@fox/logger";
import { Failure, Result, Success, Try } from "@fox/lib-common-tools";
import { FetchedMail } from "../../types/FetchedMail.js";
import { Parser } from "../../types/Parser.js";
import {
  ParsingServiceResult,
  ParsingServiceSuccess,
} from "../../types/ParsingServiceResult.js";

export const callParsingLambda = async (
  axios: Axios,
  parser: Parser,
  mail: FetchedMail
): Promise<Result<ParsingServiceSuccess>> => {
  const axiosResponse = await Try(() =>
    axios.post(
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
    )
  );
  if (!axiosResponse.success) {
    return Failure(axiosResponse.error);
  }
  const parsedResult = ParsingServiceResult.safeParse(axiosResponse.value.data);
  if (!parsedResult.success) {
    Logger.info(axiosResponse.value.data);
    return Failure(parsedResult.error);
  }
  if ("results" in parsedResult.data) {
    return Success(parsedResult.data);
  }
  Logger.error("Error while parsing mail", parsedResult.data);
  return Failure(parsedResult.data.errorMessage);
};
