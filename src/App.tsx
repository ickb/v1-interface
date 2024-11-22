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
  reservedCKB,
} from "./utils.ts";
import { headerPlaceholder, l1StateOptions } from "./queries.ts";
import Action from "./Action.tsx";
import Progress from "./Progress.tsx";
import { max } from "@ickb/lumos-utils";

export default function App({ walletConfig }: { walletConfig: WalletConfig }) {
  const [isFrozen, freeze] = useState(false);
  const [rawText, setRawText] = useState(direction2Symbol(true));
  const symbol = rawText[0];
  const isCkb2Udt = symbol2Direction(symbol);
  let text = sanitize(rawText);
  let amount = toBigInt(text);

  const {
    ckbNative,
    ickbNative,
    ckbAvailable,
    ickbAvailable,
    ckbBalance,
    ickbBalance,
    tipHeader,
  } = useQuery(l1StateOptions(walletConfig, isFrozen)).data!;

  const conversionCap = isCkb2Udt
    ? max(ckbAvailable - reservedCKB, 0n)
    : ickbAvailable;
  if (amount > conversionCap) {
    amount = conversionCap;
    text = toText(conversionCap);
  }

  const formReset = () => setRawText(direction2Symbol(isCkb2Udt));
  const deferredActionParams = useDeferredValue({
    isCkb2Udt,
    amount,
    freeze,
    formReset,
    walletConfig,
  });

  if (tipHeader === headerPlaceholder) {
    return (
      <>
        <Dashboard {...{ walletConfig }} />
        <Progress>
          Downloading the latest L1 Cell data, just for you. Hang tight!
        </Progress>
      </>
    );
  }

  return (
    <>
      <Dashboard {...{ walletConfig }} />
      <Form
        {...{
          rawText: symbol + text,
          setRawText,
          amount,
          tipHeader,
          isFrozen,
          ckbNative,
          ickbNative,
          ckbAvailable,
          ickbAvailable,
          ckbBalance,
          ickbBalance,
        }}
      />
      <Action {...deferredActionParams} />
    </>
  );
}
