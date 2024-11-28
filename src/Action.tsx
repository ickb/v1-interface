import {
  epochSinceValuePadding,
  toText,
  txInfoPadding,
  type TxInfo,
  type WalletConfig,
} from "./utils.ts";
import Progress from "./Progress.tsx";
import { l1StateOptions } from "./queries.ts";
import { useState } from "react";
import { isPopulated, type I8Header } from "@ickb/lumos-utils";
import { useQuery } from "@tanstack/react-query";
import { parseEpoch, type EpochSinceValue } from "@ckb-lumos/base/lib/since";

export default function Action({
  isCkb2Udt,
  amount,
  freeze,
  formReset,
  walletConfig,
}: {
  isCkb2Udt: boolean;
  amount: bigint;
  freeze: (s: boolean) => void;
  formReset: () => void;
  walletConfig: WalletConfig;
}) {
  const [message, setMessage] = useState("");
  const [frozenTxInfo, _setFrozenTxInfo] = useState(txInfoPadding);
  const freezeTxInfo = (txInfo: TxInfo) => {
    _setFrozenTxInfo(txInfo);
    freeze(txInfo != txInfoPadding);
  };
  const isFrozen = frozenTxInfo !== txInfoPadding;
  const {
    data: l1Data,
    isStale,
    isFetching,
  } = useQuery(l1StateOptions(walletConfig, isFrozen));
  const { txBuilder, tipHeader } = l1Data!;
  const txInfo = isFrozen ? frozenTxInfo : txBuilder(isCkb2Udt, amount);
  const isValid =
    isPopulated(txInfo.tx) &&
    txInfo.fee > 0n &&
    txInfo.estimatedMaturity !== epochSinceValuePadding &&
    txInfo.error === "";
  const { maturity, isReady } = timeUntilEpoch(
    txInfo.estimatedMaturity,
    tipHeader,
  );

  return (
    <span
      className={"grid grid-cols-2 items-center justify-items-center gap-y-4"}
    >
      <Progress isDone={!isFetching && !isFrozen}>
        <button
          className="text-s col-span-2 min-h-12 w-full cursor-pointer rounded border-2 border-amber-400 px-8 leading-relaxed font-bold tracking-wider text-amber-400 uppercase disabled:cursor-default disabled:opacity-50"
          {...{
            onClick: isStale
              ? () =>
                  walletConfig.queryClient.invalidateQueries({
                    queryKey: [
                      walletConfig.chain,
                      walletConfig.address,
                      "l1State",
                    ],
                  })
              : () =>
                  transact(
                    txInfo,
                    freezeTxInfo,
                    setMessage,
                    formReset,
                    walletConfig,
                  ),
            disabled: isFetching || isFrozen || !isValid,
          }}
        >
          {isFrozen
            ? message
            : isFetching
              ? "refreshing..."
              : txInfo.error !== ""
                ? txInfo.error
                : !isValid
                  ? "finding a goose egg"
                  : isStale
                    ? `refresh before ${amount > 0 ? `converting to ${isCkb2Udt ? "iCKB" : "CKB"}` : "collecting converted funds"}`
                    : amount > 0
                      ? `request conversion to ${isCkb2Udt ? "iCKB" : "CKB"}`
                      : `${isReady ? "fully" : "partially"} collect converted funds`}
        </button>
      </Progress>
      <span className="leading-relaxed font-bold tracking-wider">Fee:</span>
      <span>{toText(txInfo.fee)} CKB</span>
      <span className="leading-relaxed font-bold tracking-wider">
        Maturity:
      </span>
      <span>{maturity}</span>
    </span>
  );
}

async function transact(
  txInfo: TxInfo,
  freezeTxInfo: (txInfo: TxInfo) => void,
  setMessage: (message: string) => void,
  formReset: () => void,
  walletConfig: WalletConfig,
) {
  const { rpc, sendSigned, queryClient } = walletConfig;
  try {
    freezeTxInfo(txInfo);
    setMessage("Waiting for user confirmation...");
    const txHash = await sendSigned(txInfo.tx);

    let status = "pending";
    while (status === "pending" || status === "proposed") {
      setMessage("Waiting for network confirmation...");
      await new Promise((r) => setTimeout(r, 10000));
      status = (await rpc.getTransaction(txHash)).txStatus.status;
    }

    if (status === "committed") {
      setMessage("Transaction confirmed!!!");
      formReset();
    } else {
      setMessage("Something went wrong, retry in a minute");
    }
    queryClient.invalidateQueries(l1StateOptions(walletConfig, true));
    await new Promise((r) => setTimeout(r, 10000));
  } finally {
    setMessage("");
    freezeTxInfo(txInfoPadding);
  }
}

function timeUntilEpoch(e: EpochSinceValue, tipHeader: I8Header) {
  const t = parseEpoch(tipHeader.epoch);
  const epochs = e.index / e.length - t.index / t.length + e.number - t.number;
  if (epochs <= 0) {
    return { maturity: "⌛️ Ready", isReady: true };
  }

  if (epochs <= 0.375) {
    //90 minutes
    return {
      maturity: `⏳ ${String(Math.ceil(epochs * 4 * 60))} minutes`,
      isReady: false,
    };
  }

  if (epochs <= 6) {
    //24 hours
    return {
      maturity: `⏳ ${String(1 + Math.ceil(epochs * 4))} hours`,
      isReady: false,
    };
  }

  return {
    maturity: `⏳ ${String(1 + Math.ceil(epochs / 6))} days`,
    isReady: false,
  };
}
