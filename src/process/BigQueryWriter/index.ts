import { ParsedDocument } from "../../types/ParsedDocument.js";
import { documentToRow } from "./documentToRow.js";
import { BigQuery } from "@google-cloud/bigquery";
import { Try } from "@fox/lib-common-tools";

export const BigQueryWriter = () => {
  const bq = new BigQuery({ projectId: "service-mails-fetching-dev" });
  const table = bq
    .dataset("refined", {
      projectId: "mails-sandbox",
    })
    .table("documents");
  return async (parsedDocuments: ParsedDocument[]) => {
    const rows = parsedDocuments.map(documentToRow);
    return await Try(() => table.insert(rows));
  };
};
