import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { DecryptedPayload } from "../types/DecryptedPayload.js";

export const DecryptPayload =
  ({ kms, KEY_ID }: { kms: KMSClient; KEY_ID: string }) =>
  async (payload: string) => {
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
