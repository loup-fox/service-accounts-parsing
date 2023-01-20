import crypto from "crypto";

export const sha1 = (value: string) =>
  crypto.createHash("sha1").update(value).digest("hex");
