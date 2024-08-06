import { Button } from "react-aria-components";
import { txInfoFrom, type TxInfo, type WalletConfig } from "./utils.ts";
import Progress from "./Progress.tsx";
import { l1StateOptions } from "./queries.ts";
import { useState } from "react";
import { isPopulated } from "@ickb/lumos-utils";
import { useQuery } from "@tanstack/react-query";

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
  const [frozenTxInfo, _setFrozenTxInfo] = useState(txInfoFrom({}));
  const freezeTxInfo = (txInfo: TxInfo) => {
    _setFrozenTxInfo(txInfo);
    freeze(!txInfo.isEmpty);
  };
  const isFrozen = !frozenTxInfo.isEmpty;
  const { data, isStale, isFetching } = useQuery(
    l1StateOptions(walletConfig, isFrozen),
  );
  const txInfo = isFrozen ? frozenTxInfo : data!.txBuilder(isCkb2Udt, amount);
  const isValid = isPopulated(txInfo.tx);

  return (
    <>
      {txInfo.isEmpty ? (
        <p>Downloading the latest L1 Cell data, just for you. Hang tight!</p>
      ) : (
        <div className={isFrozen ? "text-slate-100" : ""}>
          {txInfo.info
            .concat(txInfo.error !== "" ? [txInfo.error, ""] : [""])
            .join(". ")}
        </div>
      )}
      <Button
        className="text-s h-12 w-full rounded border-2 border-amber-400 px-8 font-bold uppercase leading-relaxed tracking-wider text-amber-400 disabled:opacity-50"
        {...{
          onPress: isStale
            ? () =>
                walletConfig.queryClient.invalidateQueries({
                  queryKey: [
                    walletConfig.chain,
                    walletConfig.address,
                    "l1State",
                  ],
                })
            : () => transact(txInfo, freezeTxInfo, formReset, walletConfig),
          isDisabled: isFetching || isFrozen || !isValid,
        }}
      >
        {isFetching
          ? "refreshing..."
          : !isValid
            ? "nothing to sign"
            : isStale
              ? "refresh before signing"
              : isFrozen
                ? "transacting..."
                : "sign with wallet"}
      </Button>
      {isFetching || isFrozen ? <Progress /> : undefined}
    </>
  );
}

async function transact(
  txInfo: TxInfo,
  freezeTxInfo: (txInfo: TxInfo) => void,
  formReset: () => void,
  walletConfig: WalletConfig,
) {
  const { rpc, signer } = walletConfig;
  try {
    freezeTxInfo(txInfo);
    const txHash = await rpc.sendTransaction(await signer(txInfo.tx));
    let status = "pending";
    while (status === "pending" || status === "proposed") {
      await new Promise((r) => setTimeout(r, 10000));
      status = (await rpc.getTransaction(txHash)).txStatus.status;
    }
    formReset();
    console.log(txHash, status);
  } finally {
    freezeTxInfo(txInfoFrom({}));
  }
}
