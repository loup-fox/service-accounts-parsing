export const parseAccountId = (body?: string) => {
  if (!body) {
    throw new Error("Body is empty");
  }
  const message = JSON.parse(body).Message;
  if (!message) {
    throw new Error("Message is empty");
  }
  return JSON.parse(message).accountId;
};
