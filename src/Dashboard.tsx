import type { WalletConfig } from "./utils.ts";

export function EmptyDashboard() {
  return (
    <>
      <h1 className="flex flex-row items-center justify-center py-4 text-5xl font-medium">
        <span className="mr-2 text-5xl text-amber-400">{"{"}</span>
        <span>iCKB DApp</span>
        <span className="ml-2 text-5xl text-amber-400">{"}"}</span>
      </h1>
    </>
  );
}

export function Dashboard({ walletConfig }: { walletConfig: WalletConfig }) {
  const { chain, address } = walletConfig;
  const href = `https://${chain !== "mainnet" ? "testnet." : ""}explorer.nervos.org/address/${address}`;
  return (
    <a
      href={href}
      target="_blank"
      className="flex flex-row items-center justify-center rounded-2xl py-4 font-medium"
    >
      <span className="mr-2 text-5xl text-amber-400">{"{"}</span>
      <h1 style={{ direction: "rtl" }} className="-ml-3 truncate text-3xl">
        {address}
      </h1>
      <span className="ml-2 text-5xl text-amber-400">{"}"}</span>
    </a>
  );
}
