import * as Logger from "@fox/logger";

export const time = async <R>(fn: () => Promise<R>, name: string) => {
  const started = new Date();
  const result = await fn();
  const ended = new Date();
  Logger.info(
    `Function ${name} took ${ended.getTime() - started.getTime()} ms`
  );
  return result;
};
