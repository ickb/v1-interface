import {
  TransactionSkeleton,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import {
  addCells,
  addCkbChange,
  binarySearch,
  isPopulated,
  type I8Cell,
  type I8Header,
} from "@ickb/lumos-utils";
import {
  addIckbUdtChange,
  addOwnedWithdrawalRequestsChange,
  addReceiptDepositsChange,
  addWithdrawalRequestGroups,
  ickbDeposit,
  ickbExchangeRatio,
  ickbRequestWithdrawalFrom,
  orderMelt,
  orderMint,
  type ExtendedDeposit,
  type MyOrder,
  type OrderRatio,
} from "@ickb/v1-core";
import type { WalletConfig } from "./utils.ts";
import { ckbSoftCapPerDeposit } from "@ickb/v1-core";

type MyExtendedDeposit = ExtendedDeposit & { ickbCumulative: bigint };

export function convert(
  baseTx: TransactionSkeletonType,
  isCkb2Udt: boolean,
  amount: bigint,
  deposits: Readonly<ExtendedDeposit[]>,
  tipHeader: I8Header,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
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
  const txCache = Array<TransactionSkeletonType | undefined>(N);
  const attempt = (n: number) => {
    n = N - n;
    return (txCache[n] =
      txCache[n] ??
      convertAttempt(
        n,
        isCkb2Udt,
        amount,
        baseTx,
        ratio,
        depositAmount,
        ickbPool,
        feeRate,
        walletConfig,
      ));
  };
  return attempt(binarySearch(N, (n) => isPopulated(attempt(n))));
}

function convertAttempt(
  quantity: number,
  isCkb2Udt: boolean,
  amount: bigint,
  tx: TransactionSkeletonType,
  ratio: OrderRatio,
  depositAmount: bigint,
  ickbPool: Readonly<MyExtendedDeposit[]>,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
  const { accountLock, config } = walletConfig;
  if (quantity > 0) {
    if (isCkb2Udt) {
      amount -= depositAmount * BigInt(quantity);
      if (amount < 0n) {
        return TransactionSkeleton();
      }
      tx = ickbDeposit(tx, quantity, depositAmount, config);
    } else {
      if (ickbPool.length < quantity) {
        return TransactionSkeleton();
      }
      amount -= ickbPool[quantity - 1].ickbCumulative;
      if (amount < 0n) {
        return TransactionSkeleton();
      }
      const deposits = ickbPool.slice(0, quantity).map((d) => d.deposit);
      tx = ickbRequestWithdrawalFrom(tx, deposits, config);
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
  }

  return addChange(tx, feeRate, walletConfig);
}

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
  tx = addCells(tx, "append", [capacities, udts, receipts].flat(), []);
  tx = addWithdrawalRequestGroups(tx, wrGroups);
  tx = orderMelt(tx, myOrders);
  return tx;
}

export function addChange(
  tx: TransactionSkeletonType,
  feeRate: bigint,
  walletConfig: WalletConfig,
) {
  const { accountLock, addPlaceholders, config } = walletConfig;
  let freeCkb, freeIckbUdt;
  tx = addReceiptDepositsChange(tx, accountLock, config);
  tx = addOwnedWithdrawalRequestsChange(tx, accountLock, config);
  ({ tx, freeIckbUdt } = addIckbUdtChange(tx, accountLock, config));
  ({ tx, freeCkb } = addCkbChange(
    tx,
    accountLock,
    feeRate,
    addPlaceholders,
    config,
  ));

  if (freeCkb < 0n || freeIckbUdt < 0n || tx.outputs.size > 64) {
    return TransactionSkeleton();
  }

  return tx;
}
