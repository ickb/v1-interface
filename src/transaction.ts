import { type TransactionSkeletonType } from "@ckb-lumos/helpers";
import {
  addCells,
  addCkbChange,
  binarySearch,
  since,
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
  maxEpoch,
  orderMaturityEstimate,
  txInfoPadding,
  type TxInfo,
  type WalletConfig,
} from "./utils.ts";
import { ckbSoftCapPerDeposit } from "@ickb/v1-core";
import { parseAbsoluteEpochSince, parseEpoch } from "@ckb-lumos/base/lib/since";
import { headerPlaceholder } from "./queries.ts";

export function base({
  txInfo = txInfoPadding,
  capacities = new Array<I8Cell>(),
  udts = new Array<I8Cell>(),
  receipts = new Array<I8Cell>(),
  wrGroups = new Array<
    Readonly<{
      ownedWithdrawalRequest: I8Cell;
      owner: I8Cell;
    }>
  >(),
  myOrders = new Array<MyOrder>(),
  tipHeader = headerPlaceholder,
}) {
  let { tx } = txInfo;
  const estimatedMaturities = [
    txInfo.estimatedMaturity,
    parseEpoch(tipHeader.epoch),
  ];

  if (myOrders.length > 0) {
    tx = orderMelt(tx, myOrders);
    for (const { info: i } of myOrders) {
      if (!i.isMatchable || i.isDualRatio) {
        continue;
      }
      const isCkb2Udt = i.isCkb2UdtMatchable;
      estimatedMaturities.push(
        orderMaturityEstimate(
          isCkb2Udt,
          isCkb2Udt ? i.ckbUnoccupied : i.udtAmount,
          tipHeader,
        ),
      );
    }
  }
  const cc = [capacities, udts, receipts].flat();
  if (cc.length > 0) {
    tx = addCells(tx, "append", cc, []);
  }
  if (wrGroups.length > 0) {
    tx = addWithdrawalRequestGroups(tx, wrGroups);
    estimatedMaturities.push(
      ...wrGroups.map((g) =>
        parseAbsoluteEpochSince(
          g.ownedWithdrawalRequest.cellOutput.type![since],
        ),
      ),
    );
  }

  const estimatedMaturity = Object.freeze(maxEpoch(estimatedMaturities));
  return Object.freeze({ ...txInfo, tx, estimatedMaturity });
}

type MyExtendedDeposit = ExtendedDeposit & { ickbCumulative: bigint };

export function convert(
  txInfo: TxInfo,
  isCkb2Udt: boolean,
  amount: bigint,
  deposits: Readonly<ExtendedDeposit[]>,
  tipHeader: I8Header,
  calculateFee: (tx: TransactionSkeletonType) => bigint,
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
        calculateFee,
        walletConfig,
      ));
  };
  return Object.freeze(
    attempt(binarySearch(N, (n) => attempt(n).error === "")),
  );
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
  calculateFee: (tx: TransactionSkeletonType) => bigint,
  walletConfig: WalletConfig,
) {
  let { tx } = txInfo;
  const { accountLocks, config } = walletConfig;
  const estimatedMaturities = [txInfo.estimatedMaturity];
  if (quantity > 0) {
    if (isCkb2Udt) {
      amount -= depositAmount * BigInt(quantity);
      if (amount < 0n) {
        return {
          ...txInfo,
          error: "Too many Deposits respectfully to the amount",
        };
      }
      tx = ickbDeposit(tx, quantity, depositAmount, config);
      tx = addReceiptDepositsChange(tx, accountLocks[0], config);
    } else {
      if (ickbPool.length < quantity) {
        return {
          ...txInfo,
          error: "Not enough Deposits to withdraw from",
        };
      }
      amount -= ickbPool[quantity - 1].ickbCumulative;
      if (amount < 0n) {
        return {
          ...txInfo,
          error: "Too many Withdrawal Requests respectfully to the amount",
        };
      }
      ickbPool = ickbPool.slice(0, quantity);
      const deposits = ickbPool.map((d) => d.deposit);
      tx = ickbRequestWithdrawalFrom(tx, deposits, config);
      tx = addOwnedWithdrawalRequestsChange(tx, accountLocks[0], config);
      estimatedMaturities.push(...ickbPool.map((d) => d.estimatedMaturity));
    }
  }

  let fee = txInfo.fee;
  if (amount > 0n) {
    tx = orderMint(
      tx,
      accountLocks[0],
      config,
      isCkb2Udt ? amount : undefined,
      isCkb2Udt ? undefined : amount,
      isCkb2Udt ? ratio : undefined,
      isCkb2Udt ? undefined : ratio,
    );
    // 0.1% fee to bot
    fee += isCkb2Udt
      ? amount -
        ickb2Ckb(
          (amount * ratio.ckbMultiplier) / ratio.udtMultiplier,
          tipHeader,
        )
      : ickb2Ckb(amount, tipHeader) -
        (amount * ratio.udtMultiplier) / ratio.ckbMultiplier;

    estimatedMaturities.push(
      orderMaturityEstimate(isCkb2Udt, amount, tipHeader),
    );
  }

  const estimatedMaturity = maxEpoch(estimatedMaturities);
  return addChange(
    { ...txInfo, tx, estimatedMaturity, fee },
    calculateFee,
    walletConfig,
  );
}

export function addChange(
  txInfo: TxInfo,
  calculateFee: (tx: TransactionSkeletonType) => bigint,
  walletConfig: WalletConfig,
) {
  let { tx } = txInfo;
  const { accountLocks, config } = walletConfig;
  let txFee, freeCkb, freeIckb;
  ({ tx, freeIckbUdt: freeIckb } = addIckbUdtChange(
    tx,
    accountLocks[0],
    config,
  ));
  ({ tx, txFee, freeCkb } = addCkbChange(
    tx,
    accountLocks[0],
    calculateFee,
    config,
  ));

  const fee = txInfo.fee + txFee;
  txInfo = { ...txInfo, tx, fee };

  if (freeCkb < 0n) {
    return { ...txInfo, error: "Not enough CKB" };
  }

  if (freeIckb < 0n) {
    return { ...txInfo, error: "Not enough iCKB" };
  }

  if (tx.outputs.size > 64) {
    return { ...txInfo, error: "More than 64 output cells" };
  }

  return txInfo;
}
