import { ParsedDocument } from "../../types/ParsedDocument.js";
import { documentToRow } from "./documentToRow.js";
import { BigQuery } from "@google-cloud/bigquery";
import { Try } from "@fox/lib-common-tools";

export const BigQueryWriter = ({ PROJECT_ID }: { PROJECT_ID: string }) => {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const table = bq.dataset("refined").table("documents");
  return async (parsedDocuments: ParsedDocument[]) => {
    const rows = parsedDocuments.map(documentToRow);
    return await Try(() => table.insert(rows));
  };
};
