import type { Cell, HexString, Transaction } from "@ckb-lumos/base";
import {
  TransactionSkeleton,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import type { QueryClient } from "@tanstack/react-query";
import {
  CKB,
  epochSinceCompare,
  isPopulated,
  type ChainConfig,
  type I8Header,
  type I8Script,
} from "@ickb/lumos-utils";
import { parseEpoch, type EpochSinceValue } from "@ckb-lumos/base/lib/since";

export interface RootConfig extends ChainConfig {
  queryClient: QueryClient;
}

export interface WalletConfig extends RootConfig {
  address: HexString;
  accountLock: I8Script;
  expander: (c: Cell) => I8Script | undefined;
  addPlaceholders: (tx: TransactionSkeletonType) => TransactionSkeletonType;
  signer: (tx: TransactionSkeletonType) => Promise<Transaction>;
}

export function symbol2Direction(s: string) {
  return s === "C";
}

export function direction2Symbol(d: boolean) {
  return d ? "C" : "I";
}

export function sanitize(text: string) {
  // Filter leading zeros
  let i = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if ("1" <= c && c <= "9") {
      break;
    }
  }

  //Filter decimal part
  let dot = "";
  const decimalChars: string[] = [];
  for (; i < text.length; i++) {
    const c = text[i];
    if ("0" <= c && c <= "9") {
      decimalChars.push(c);
    } else if (c == ".") {
      dot = ".";
      break;
    }
  }

  //Filter fractional part
  const fractionalChars: string[] = [];
  for (; i < text.length && fractionalChars.length < 8; i++) {
    const c = text[i];
    if ("0" <= c && c <= "9") {
      fractionalChars.push(c);
    }
  }

  return [decimalChars, [dot], fractionalChars].flat().join("");
}

export function toText(n: bigint) {
  return String(n / CKB) + String(Number(n % CKB) / Number(CKB)).slice(1);
}

export function toBigInt(text: string) {
  const [decimal, ...fractionals] = text.split(".");
  return BigInt(
    (decimal ?? "0") + ((fractionals ?? []).join("") + "00000000").slice(0, 8),
  );
}

export function maxWaitTime(ee: EpochSinceValue[], tipHeader: I8Header) {
  const t = parseEpoch(tipHeader.epoch);
  const e = ee.reduce((a, b) => (epochSinceCompare(a, b) === -1 ? b : a));
  const epochs = e.index / e.length - t.index / t.length + e.number - t.number;
  if (epochs <= 0.375) {
    //90 minutes
    return `${String(1 + Math.ceil(epochs * 4 * 60))} minutes`;
  }

  if (epochs <= 6) {
    //24 hours
    return `${String(1 + Math.ceil(epochs * 4))} hours`;
  }

  return `${String(1 + Math.ceil(epochs / 6))} days`;
}

export type TxInfo = {
  tx: TransactionSkeletonType;
  info: readonly string[];
  error: string;
  isEmpty: boolean;
};

export function txInfoFrom({
  tx = TransactionSkeleton(),
  info = <readonly string[]>[],
  error = "",
}): Readonly<TxInfo> {
  if (error.length > 0) {
    tx = TransactionSkeleton();
  }

  const isEmpty = !isPopulated(tx) && info.length === 0 && error.length === 0;
  return Object.freeze({ tx, info: Object.freeze(info), error, isEmpty });
}
