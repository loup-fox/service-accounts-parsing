import _ from "lodash";
import { sha1 } from "@fox/lib-foxbrain-sdk";
import { ParsedItem } from "../types/ParsedItem.js";

export function getOrderId(
  parserName: string,
  results: ParsedItem[],
  document: {
    from: string;
    date: Date;
    uid: string;
    data: {
      originalOrderNumber?: string | number | undefined;
    };
  },
  userId: string
) {
  let originalOrders: Record<string, string> | null = {};
  let orderId = null;

  // original order id
  _.forEach(results, (result) => {
    const oon = result.data.originalOrderNumber;
    if (oon) {
      originalOrders![oon] = sha1(
        parserName + document.from + userId + document.date + document.uid + oon
      );
    }
  });

  const keys = Object.keys(originalOrders);

  if (keys.length > 1) {
    // use the order id from the mail
    orderId = originalOrders[keys[0]];
  } else {
    // generate an order id
    orderId = sha1(
      parserName + document.from + userId + document.date + document.uid
    );
    originalOrders = null;
  }

  return originalOrders && document.data.originalOrderNumber
    ? originalOrders[document.data.originalOrderNumber]
    : orderId;
}
