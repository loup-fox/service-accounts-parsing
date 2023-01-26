import { DecryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { Failure, Result, Try } from "@fox/lib-common-tools";
import { DecryptedPayload } from "../types/DecryptedPayload.js";

export const DecryptPayload =
  ({ kms, KEY_ID }: { kms: KMSClient; KEY_ID: string }) =>
  async (payload: string): Promise<Result<DecryptedPayload>> => {
    const result = await Try(() =>
      kms.send(
        new DecryptCommand({
          CiphertextBlob: Buffer.from(payload, "base64"),
          KeyId: KEY_ID,
        })
      )
    );
    if (!result.success) {
      return Failure(result.error);
    }
    if (!result.value.Plaintext) {
      return Failure(new Error("PAYLOAD_DECRYPT_IS_EMPTY"));
    }
    return Try(() =>
      DecryptedPayload.parse(
        JSON.parse(Buffer.from(result.value.Plaintext!).toString("utf-8"))
      )
    );
  };
