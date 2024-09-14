import {
  TransactionSkeleton,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import {
  addCells,
  addCkbChange,
  binarySearch,
  calculateTxFee,
  txSize,
  type I8Cell,
  type I8Header,
} from "@ickb/lumos-utils";
import {
  addIckbUdtChange,
  addOwnedWithdrawalRequestsChange,
  addReceiptDepositsChange,
  addWithdrawalRequestGroups,
  ickb2Ckb,
  ickbDeposit,
  ickbExchangeRatio,
  ickbRequestWithdrawalFrom,
  orderMelt,
  orderMint,
  type ExtendedDeposit,
  type MyOrder,
  type OrderRatio,
} from "@ickb/v1-core";
import {
  maxWaitTime,
  toText,
  txInfoFrom,
  type TxInfo,
  type WalletConfig,
} from "./utils.ts";
import { ckbSoftCapPerDeposit } from "@ickb/v1-core";

export function base({
  capacities,
  udts,
  receipts,
  wrGroups,
  myOrders,
}: {
  capacities: I8Cell[];
  udts: I8Cell[];
  receipts: I8Cell[];
  wrGroups: Readonly<{
    ownedWithdrawalRequest: I8Cell;
    owner: I8Cell;
  }>[];
  myOrders: MyOrder[];
}) {
  let tx = TransactionSkeleton();
  const info: string[] = [];

  tx = orderMelt(tx, myOrders);
  let notCompleted = myOrders.reduce(
    (c, { info }) => (info.isMatchable ? c + 1 : c),
    0,
  );
  if (notCompleted > 0) {
    info.push(
      `Cancelling ${notCompleted} Open Order${notCompleted > 1 ? "s" : ""}`,
    );
  }
  let completed = myOrders.length - notCompleted;
  if (completed > 0) {
    info.push(
      `Melting ${completed} Completed Order${completed > 1 ? "s" : ""}`,
    );
  }

  tx = addCells(tx, "append", [capacities, udts, receipts].flat(), []);
  // Receipts need explanation, while capacities and udts do not
  if (receipts.length > 0) {
    info.push(
      `Converting ${receipts.length} Receipt${receipts.length > 1 ? "s" : ""} to iCKB`,
    );
  }

  tx = addWithdrawalRequestGroups(tx, wrGroups);
  if (wrGroups.length > 0) {
    info.push(
      `Withdrawing from ${wrGroups.length} Withdrawal Request${wrGroups.length > 1 ? "s" : ""}`,
    );
  }

  return txInfoFrom({ tx, info });
}

type MyExtendedDeposit = ExtendedDeposit & { ickbCumulative: bigint };

export function convert(
  txInfo: TxInfo,
  isCkb2Udt: boolean,
  amount: bigint,
  deposits: Readonly<ExtendedDeposit[]>,
  tipHeader: I8Header,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
  if (txInfo.error !== "") {
    return txInfo;
  }

  const ickbPool: MyExtendedDeposit[] = [];
  if (!isCkb2Udt) {
    // Filter deposits
    let ickbCumulative = 0n;
    for (const d of deposits) {
      const c = ickbCumulative + d.ickbValue;
      if (c > amount) {
        continue;
      }
      ickbCumulative = c;
      ickbPool.push(Object.freeze({ ...d, ickbCumulative }));
      if (ickbPool.length >= 30) {
        break;
      }
    }
  }
  Object.freeze(ickbPool);

  const { ckbMultiplier, udtMultiplier } = ickbExchangeRatio(tipHeader);
  const ratio: OrderRatio = {
    ckbMultiplier,
    //   Pay 0.1% fee to bot
    udtMultiplier:
      udtMultiplier + (isCkb2Udt ? 1n : -1n) * (udtMultiplier / 1000n),
  };

  const depositAmount = ckbSoftCapPerDeposit(tipHeader);
  const N = isCkb2Udt ? Number(amount / depositAmount) : ickbPool.length;
  const txCache = Array<TxInfo | undefined>(N);
  const attempt = (n: number) => {
    n = N - n;
    return (txCache[n] =
      txCache[n] ??
      convertAttempt(
        n,
        isCkb2Udt,
        amount,
        txInfo,
        ratio,
        depositAmount,
        ickbPool,
        tipHeader,
        feeRate,
        walletConfig,
      ));
  };
  return attempt(binarySearch(N, (n) => attempt(n).error === ""));
}

function convertAttempt(
  quantity: number,
  isCkb2Udt: boolean,
  amount: bigint,
  txInfo: TxInfo,
  ratio: OrderRatio,
  depositAmount: bigint,
  ickbPool: Readonly<MyExtendedDeposit[]>,
  tipHeader: I8Header,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
  let { tx, info, error } = txInfo;
  if (error !== "") {
    return txInfo;
  }

  const { accountLock, config } = walletConfig;
  if (quantity > 0) {
    if (isCkb2Udt) {
      amount -= depositAmount * BigInt(quantity);
      if (amount < 0n) {
        return txInfoFrom({
          error: "Too many Deposits respectfully to the amount",
        });
      }
      tx = ickbDeposit(tx, quantity, depositAmount, config);
      tx = addReceiptDepositsChange(tx, accountLock, config);
      info = info.concat([]);
      info = info.concat([
        `Creating ${quantity} standard deposit${quantity > 1 ? "s" : ""} ` +
          `and ${quantity > 1 ? "their" : "its"} Receipt`,
      ]);
    } else {
      if (ickbPool.length < quantity) {
        return txInfoFrom({ error: "Not enough Deposits to withdraw from" });
      }
      amount -= ickbPool[quantity - 1].ickbCumulative;
      if (amount < 0n) {
        return txInfoFrom({
          error: "Too many Withdrawal Requests respectfully to the amount",
        });
      }
      ickbPool = ickbPool.slice(0, quantity);
      const deposits = ickbPool.map((d) => d.deposit);
      tx = ickbRequestWithdrawalFrom(tx, deposits, config);
      tx = addOwnedWithdrawalRequestsChange(tx, accountLock, config);
      const waitTime = maxWaitTime(
        ickbPool.map((d) => d.estimatedMaturity),
        tipHeader,
      );
      info = info.concat([
        `Requesting the Withdrawal from ${quantity} Deposit${quantity > 1 ? "s" : ""}` +
          ` with maturity in ${waitTime}`,
      ]);
    }
  }

  if (amount > 0n) {
    tx = orderMint(
      tx,
      accountLock,
      config,
      isCkb2Udt ? amount : undefined,
      isCkb2Udt ? undefined : amount,
      isCkb2Udt ? ratio : undefined,
      isCkb2Udt ? undefined : ratio,
    );
    // 0.1% fee to bot
    const fee = isCkb2Udt
      ? amount -
        ickb2Ckb(
          (amount * ratio.ckbMultiplier) / ratio.udtMultiplier,
          tipHeader,
        )
      : ickb2Ckb(amount, tipHeader) -
        (amount * ratio.udtMultiplier) / ratio.ckbMultiplier;
    info = info.concat([
      `Creating a Limit Order for ${quantity > 0 ? "the remaining" : ""} ` +
        `${toText(amount)} ${isCkb2Udt ? "CKB" : "iCKB"}, ` +
        `offering a Fee of ${toText(fee)} CKB`,
    ]);
  }

  return addChange(txInfoFrom({ tx, info }), feeRate, walletConfig);
}

export function addChange(
  txInfo: TxInfo,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
  let { tx, info, error } = txInfo;
  if (error !== "") {
    return txInfo;
  }

  const { accountLock, addPlaceholders, config } = walletConfig;
  let txFee, freeCkb, freeIckbUdt;
  ({ tx, freeIckbUdt } = addIckbUdtChange(tx, accountLock, config));
  ({ tx, txFee, freeCkb } = addCkbChange(
    tx,
    accountLock,
    (txWithDummyChange: TransactionSkeletonType) => {
      const baseFee = calculateTxFee(
        txSize(addPlaceholders(txWithDummyChange)),
        feeRate,
      );
      // Use a fee that is multiple of N=1249
      const N = 1249n;
      return ((baseFee + (N - 1n)) / N) * N;
    },
    config,
  ));

  if (freeCkb < 0n) {
    return txInfoFrom({ info, error: "Not enough CKB" });
  }

  if (freeIckbUdt < 0n) {
    return txInfoFrom({ info, error: "Not enough iCKB" });
  }

  if (tx.outputs.size > 64) {
    return txInfoFrom({
      info,
      error: "More than 64 output cells",
    });
  }

  info = info.concat([`Paying a Network Fee of ${toText(txFee)} CKB`]);

  return txInfoFrom({ tx, info });
}
