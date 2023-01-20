import { NewMail } from "./NewMail.js";

export type FetchedMail = NewMail & {
  headers: {
    date: Date;
    from: string;
    subject: string;
    to: string;
    signature: string;
  };
  html: string;
};
