import type { TransactionSkeletonType } from "@ckb-lumos/helpers";
import { isPopulated } from "@ickb/lumos-utils";

export default function Explainer({
  tx,
  isFrozen,
}: {
  tx: TransactionSkeletonType;
  isFrozen: boolean;
}) {
  if (!isPopulated(tx)) {
    return (
      <p>Downloading the latest L1 Cell data, just for you. Hang tight...</p>
    );
  }

  // return (
  //   <div className={isFrozen ? "text-slate-100" : ""}>{JSON.stringify(tx)}</div>
  // );

  return (
    <div className={isFrozen ? "text-slate-100" : ""}>
      {String(tx.inputs.size) +
        " Cells => " +
        String(tx.outputs.size) +
        " Cells (TODO: improve tx explanation)"}
    </div>
  );
}
