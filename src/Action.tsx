import { Button } from "react-aria-components";
import type { WalletConfig } from "./utils.ts";
import {
  TransactionSkeleton,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
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
  const [frozenTx, _setFrozenTx] = useState(TransactionSkeleton());
  const freezeTx = (tx: TransactionSkeletonType) => {
    _setFrozenTx(tx);
    freeze(isPopulated(tx));
  };
  const isFrozen = isPopulated(frozenTx);
  const { data, isStale, isFetching, isPending } = useQuery(
    l1StateOptions(walletConfig, isFrozen),
  );
  const tx = isFrozen ? frozenTx : data!.txBuilder(isCkb2Udt, amount);
  const isValid = isPopulated(tx);

  return (
    <>
      {isPending ? (
        <p>Downloading the latest L1 Cell data, just for you. Hang tight...</p>
      ) : (
        <div className={isFrozen ? "text-slate-100" : ""}>
          {String(tx.inputs.size) +
            " Cells => " +
            String(tx.outputs.size) +
            " Cells (TODO: improve tx explanation)"}
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
            : () => transact(tx, freezeTx, formReset, walletConfig),
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
  tx: TransactionSkeletonType,
  freezeTx: (tx: TransactionSkeletonType) => void,
  formReset: () => void,
  walletConfig: WalletConfig,
) {
  const { rpc, signer } = walletConfig;
  try {
    freezeTx(tx);
    const txHash = await rpc.sendTransaction(await signer(tx));
    let status = "pending";
    while (status === "pending" || status === "proposed") {
      await new Promise((r) => setTimeout(r, 10000));
      status = (await rpc.getTransaction(txHash)).txStatus.status;
    }
    formReset();
    console.log(txHash, status);
  } finally {
    freezeTx(TransactionSkeleton());
  }
}
