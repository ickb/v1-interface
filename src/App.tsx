import { useDeferredValue, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dashboard } from "./Dashboard.tsx";
import Form from "./Form.tsx";
import {
  type WalletConfig,
  symbol2Direction,
  direction2Symbol,
  toText,
  sanitize,
  toBigInt,
} from "./utils.ts";
import { l1StateOptions } from "./queries.ts";
import Action from "./Action.tsx";

export default function App({ walletConfig }: { walletConfig: WalletConfig }) {
  const [isFrozen, freeze] = useState(false);
  const [rawText, setRawText] = useState(direction2Symbol(true));
  const symbol = rawText[0];
  const isCkb2Udt = symbol2Direction(symbol);
  let text = sanitize(rawText);
  let amount = toBigInt(text);

  const {
    ckbBalance,
    ickbUdtBalance,
    ckbAvailable,
    ickbUdtAvailable,
    tipHeader,
  } = useQuery(l1StateOptions(walletConfig, isFrozen)).data!;

  const amountCap = isCkb2Udt ? ckbAvailable : ickbUdtAvailable;
  if (amount > amountCap) {
    amount = amountCap;
    text = toText(amountCap);
  }

  const formReset = () => setRawText(direction2Symbol(true));
  const formSetMax = (direction: boolean) =>
    setRawText(
      direction2Symbol(direction) +
        toText(direction ? ckbAvailable : ickbUdtAvailable),
    );

  return (
    <>
      <Dashboard
        {...{ isFrozen, walletConfig, ckbBalance, ickbUdtBalance, formSetMax }}
      />
      <Form {...{ rawText: symbol + text, setRawText, tipHeader, isFrozen }} />
      <Action
        {...useDeferredValue({
          isCkb2Udt,
          amount,
          freeze,
          formReset,
          walletConfig,
        })}
      />
    </>
  );
}
