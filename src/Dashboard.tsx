import { encodeToAddress } from "@ckb-lumos/helpers";
import type { WalletConfig } from "./utils.ts";
import { Button } from "react-aria-components";
import { CKB } from "@ickb/lumos-utils";

export function EmptyDashboard() {
  return (
    <>
      <h1 className="flex flex-row items-center justify-center pb-4 text-5xl font-medium text-slate-200">
        <span className="mr-2 text-5xl text-amber-400">{"{"}</span>
        <span>iCKB DApp</span>
        <span className="ml-2 text-5xl text-amber-400">{"}"}</span>
      </h1>
    </>
  );
}

export function Dashboard({
  isFrozen,
  ckbBalance,
  ickbUdtBalance,
  formSetMax,
  walletConfig,
}: {
  isFrozen: boolean;
  ckbBalance: bigint;
  ickbUdtBalance: bigint;
  formSetMax: (direction: boolean) => void;
  walletConfig: WalletConfig;
}) {
  const { chain, config, accountLock } = walletConfig;
  const address = encodeToAddress(accountLock, { config });
  const hl = Math.floor(address.length / 2);
  const href = `https://${chain !== "mainnet" ? "pudge." : ""}explorer.nervos.org/address/${address}`;
  return (
    <h1>
      <Button
        isDisabled={isFrozen}
        className="mb-2 flex w-full flex-row items-center justify-center rounded-2xl text-3xl font-medium text-slate-200"
        onPress={() => window.open(href, "_blank")}
      >
        <span className="mr-2 text-5xl text-amber-400">{"{"}</span>
        <span className="w-full overflow-hidden whitespace-nowrap">
          {address.slice(0, hl)}
        </span>
        <span>...</span>
        <span
          style={{ direction: "rtl" }}
          className="w-full overflow-hidden whitespace-nowrap"
        >
          {address.slice(address.length - hl)}
        </span>
        <span className="ml-2 text-5xl text-amber-400">{"}"}</span>
      </Button>
      {ckbBalance >= 0n && ickbUdtBalance >= 0n ? (
        <div className="-mt-4 flex w-full flex-auto items-center justify-center space-x-4 px-8 text-center align-middle font-medium text-slate-300">
          <Button
            isDisabled={isFrozen}
            className="text-s h-min-12 w-full rounded px-8 font-bold uppercase leading-relaxed tracking-wider"
            onPress={() => formSetMax(true)}
          >
            {display(ckbBalance)} CKB
          </Button>
          <span className="px-4">&</span>
          <Button
            isDisabled={isFrozen}
            className="text-s h-min-12 w-full rounded px-8 font-bold uppercase leading-relaxed tracking-wider"
            onPress={() => formSetMax(false)}
          >
            {display(ickbUdtBalance)} iCKB
          </Button>
        </div>
      ) : undefined}
    </h1>
  );
}

function display(shannons: bigint) {
  return String(shannons / CKB);
}
