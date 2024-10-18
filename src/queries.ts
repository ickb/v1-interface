import {
  TransactionSkeleton,
  createTransactionFromSkeleton,
  encodeToAddress,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import { queryOptions } from "@tanstack/react-query";
import {
  CKB,
  I8Header,
  capacitySifter,
  ckbDelta,
  hex,
  i8ScriptPadding,
  lockExpanderFrom,
  maturityDiscriminator,
  max,
  shuffle,
  since,
} from "@ickb/lumos-utils";
import {
  addWithdrawalRequestGroups,
  ickbDelta,
  ickbLogicScript,
  ickbPoolSifter,
  ickbSifter,
  limitOrderScript,
  orderSifter,
  ownedOwnerScript,
} from "@ickb/v1-core";
import {
  maxWaitTime,
  txInfoFrom,
  type RootConfig,
  type WalletConfig,
} from "./utils.ts";
import { addChange, base, convert } from "./transaction.ts";
import type { Cell, Header, HexNumber, Transaction } from "@ckb-lumos/base";
import { parseAbsoluteEpochSince } from "@ckb-lumos/base/lib/since";

export function l1StateOptions(walletConfig: WalletConfig, isFrozen: boolean) {
  return queryOptions({
    retry: true,
    refetchInterval: ({ state }) => 60000 * (state.data?.hasMatchable ? 1 : 10),
    staleTime: 10000,
    queryKey: [walletConfig.chain, walletConfig.address, "l1State"],
    queryFn: async () => {
      try {
        return await getL1State(walletConfig);
      } catch (e) {
        console.log(e);
        throw e;
      }
    },
    placeholderData: {
      ckbBalance: -1n,
      ickbUdtBalance: -1n,
      ckbAvailable: 6n * CKB * CKB,
      ickbUdtAvailable: 3n * CKB * CKB,
      tipHeader: headerPlaceholder,
      txBuilder: () => txInfoFrom({}),
      hasMatchable: false,
    },
    enabled: !isFrozen,
  });
}

async function getL1State(walletConfig: WalletConfig) {
  const { rpc, config, expander } = walletConfig;

  const mixedCells = await getMixedCells(walletConfig);

  // Prefetch feeRate and tipHeader
  const feeRatePromise = rpc.getFeeRate(61n);
  const tipHeaderPromise = rpc.getTipHeader();

  // Prefetch headers
  const wanted = new Set<HexNumber>();
  const deferredGetHeader = (blockNumber: string) => {
    wanted.add(blockNumber);
    return headerPlaceholder;
  };
  ickbSifter(mixedCells, expander, deferredGetHeader, config);
  const headersPromise = getHeadersByNumber(wanted, walletConfig);

  // Prefetch txs outputs
  const wantedTxsOutputs = new Set<string>();
  const deferredGetTxsOutputs = (txHash: string) => {
    wantedTxsOutputs.add(txHash);
    return [];
  };
  orderSifter(mixedCells, expander, deferredGetTxsOutputs, config);
  const txsOutputsPromise = getTxsOutputs(wantedTxsOutputs, walletConfig);

  // Do potentially costly operations
  const { capacities, notCapacities } = capacitySifter(mixedCells, expander);

  // Await for headers
  const headers = await headersPromise;

  // Sift through iCKB related cells
  const {
    udts,
    receipts,
    withdrawalRequestGroups,
    ickbPool: pool,
    notIckbs,
  } = ickbSifter(
    notCapacities,
    expander,
    (blockNumber) => headers.get(blockNumber)!,
    config,
  );

  const tipHeader = I8Header.from(await tipHeaderPromise);
  // Partition between ripe and non ripe withdrawal requests
  const { mature, notMature } = maturityDiscriminator(
    withdrawalRequestGroups,
    (g) => g.ownedWithdrawalRequest.cellOutput.type![since],
    tipHeader,
  );

  // min lock: 1/4 epoch (~ 1 hour)
  const minLock = { length: 4, index: 1, number: 0 };
  // Sort the ickbPool based on the tip header
  let ickbPool = ickbPoolSifter(pool, tipHeader, minLock);
  // Take a random convenient subset of max 40 deposits
  if (ickbPool.length > 40) {
    const n = max(Math.round(ickbPool.length / 180), 40);
    ickbPool = shuffle(ickbPool.slice(0, n).map((d, i) => ({ d, i })))
      .slice(0, 40)
      .sort((a, b) => a.i - b.i)
      .map((a) => a.d);
  }

  // Await for txsOutputs
  const txsOutputs = await txsOutputsPromise;

  // Sift through Orders
  const { myOrders } = orderSifter(
    notIckbs,
    expander,
    (txHash) => txsOutputs.get(txHash) ?? [],
    config,
  );

  const hasMatchable = myOrders.some((o) => o.info.isMatchable);

  const txConsumesIntermediate =
    mature.length > 0 || receipts.length > 0 || myOrders.length > 0;

  // Calculate balances and baseTx
  const { tx: baseTx, info: baseInfo } = base({
    capacities,
    udts,
    myOrders,
    receipts,
    wrGroups: mature,
  });

  const ickbUdtBalance = ickbDelta(baseTx, config);
  const ickbUdtAvailable = ickbUdtBalance;

  let ckbBalance = ckbDelta(baseTx, config);
  const ckbAvailable = max((ckbBalance / CKB - 1000n) * CKB, 0n);
  let info = baseInfo;
  if (notMature.length > 0) {
    ckbBalance += ckbDelta(
      addWithdrawalRequestGroups(TransactionSkeleton(), notMature),
      config,
    );

    const wrWaitTime = maxWaitTime(
      notMature.map((g) =>
        parseAbsoluteEpochSince(
          g.ownedWithdrawalRequest.cellOutput.type![since],
        ),
      ),
      tipHeader,
    );

    info = Object.freeze(
      [
        `Excluding ${notMature.length} Withdrawal Request${notMature.length > 1 ? "s" : ""}` +
          ` with maturity in ${wrWaitTime}`,
      ].concat(info),
    );
  }

  const feeRate = await feeRatePromise;

  const txBuilder = (isCkb2Udt: boolean, amount: bigint) => {
    const txInfo = txInfoFrom({ tx: baseTx, info });

    if (amount > 0n) {
      return convert(
        txInfo,
        isCkb2Udt,
        amount,
        ickbPool,
        tipHeader,
        feeRate,
        walletConfig,
      );
    }

    if (txConsumesIntermediate) {
      return addChange(txInfo, feeRate, walletConfig);
    }

    return txInfoFrom({ info, error: "Nothing to convert" });
  };

  return {
    ckbBalance,
    ickbUdtBalance,
    ckbAvailable,
    ickbUdtAvailable,
    tipHeader,
    txBuilder,
    hasMatchable,
  };
}

export async function prefetchData(rootConfig: RootConfig) {
  const { queryClient } = rootConfig;
  const dummy: WalletConfig = {
    ...rootConfig,
    accountLock: i8ScriptPadding,
    address: encodeToAddress(i8ScriptPadding, rootConfig),
    expander: lockExpanderFrom(i8ScriptPadding),
    addPlaceholders: (tx: TransactionSkeletonType) => tx,
    signer: (tx: TransactionSkeletonType) =>
      Promise.resolve(createTransactionFromSkeleton(tx)),
  };

  return queryClient.prefetchQuery(l1StateOptions(dummy, false));
}

async function getMixedCells(walletConfig: WalletConfig) {
  const { accountLock, config, rpc } = walletConfig;

  return Object.freeze(
    (
      await Promise.all(
        [
          accountLock,
          ickbLogicScript(config),
          ownedOwnerScript(config),
          limitOrderScript(config),
        ].map((lock) => rpc.getCellsByLock(lock, "desc", "max")),
      )
    ).flat(),
  );
}

async function getTxsOutputs(
  txHashes: Set<string>,
  walletConfig: WalletConfig,
) {
  const { chain, rpc, queryClient } = walletConfig;

  const known: Readonly<Map<HexNumber, Readonly<Cell[]>>> =
    queryClient.getQueryData([chain, "txsOutputs"]) ?? Object.freeze(new Map());

  const result = new Map<string, Readonly<Cell[]>>();
  const batch = rpc.createBatchRequest();
  for (const txHash of txHashes) {
    const outputs = known.get(txHash);
    if (outputs !== undefined) {
      result.set(txHash, outputs);
      continue;
    }
    batch.add("getTransaction", txHash);
  }

  if (batch.length === 0) {
    return known;
  }

  for (const tx of (await batch.exec()).map(
    ({ transaction: tx }: { transaction: Transaction }) => tx,
  )) {
    result.set(
      tx.hash!,
      Object.freeze(
        tx.outputs.map(({ lock, type, capacity }, index) =>
          Object.freeze(<Cell>{
            cellOutput: Object.freeze({
              lock: Object.freeze(lock),
              type: Object.freeze(type),
              capacity: Object.freeze(capacity),
            }),
            data: Object.freeze(tx.outputsData[index] ?? "0x"),
            outPoint: Object.freeze({
              txHash: tx.hash!,
              index: hex(index),
            }),
          }),
        ),
      ),
    );
  }

  const frozenResult = Object.freeze(result);
  queryClient.setQueryData([chain, "txsOutputs"], frozenResult);
  return frozenResult;
}

async function getHeadersByNumber(
  wanted: Set<HexNumber>,
  walletConfig: WalletConfig,
) {
  const { chain, rpc, queryClient } = walletConfig;

  const known: Readonly<Map<HexNumber, Readonly<I8Header>>> =
    queryClient.getQueryData([chain, "headers"]) ?? Object.freeze(new Map());

  const result = new Map<HexNumber, Readonly<I8Header>>();
  const batch = rpc.createBatchRequest();
  for (const blockNum of wanted) {
    const h = known.get(blockNum);
    if (h !== undefined) {
      result.set(blockNum, h);
      continue;
    }
    batch.add("getHeaderByNumber", blockNum);
  }

  if (batch.length === 0) {
    return known;
  }

  for (const h of (await batch.exec()) as Header[]) {
    result.set(h.number, I8Header.from(h));
  }

  const frozenResult = Object.freeze(result);
  queryClient.setQueryData([chain, "headers"], frozenResult);

  return frozenResult;
}

export const headerPlaceholder = I8Header.from({
  compactTarget: "0x1a08a97e",
  parentHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  transactionsRoot:
    "0x31bf3fdf4bc16d6ea195dbae808e2b9a8eca6941d589f6959b1d070d51ac28f7",
  proposalsHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  extraHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  dao: "0x8874337e541ea12e0000c16ff286230029bfa3320800000000710b00c0fefe06",
  epoch: "0x0",
  hash: "0x92b197aa1fba0f63633922c61c92375c9c074a93e85963554f5499fe1450d0e5",
  nonce: "0x0",
  number: "0x0",
  timestamp: "0x16e70e6985c",
  version: "0x0",
});
