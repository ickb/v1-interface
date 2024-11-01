import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Connector from "./Connector.tsx";
import { getIckbScriptConfigs } from "@ickb/v1-core";
import { chainConfigFrom } from "@ickb/lumos-utils";
import { prefetchData } from "./queries.ts";
import { ccc, JoyId } from "@ckb-ccc/ccc";
import appIcon from "/favicon.png?url";
const appName = "iCKB DApp";

const testnetRootConfigPromise = chainConfigFrom(
  "testnet",
  undefined,
  true,
  getIckbScriptConfigs,
).then((chainConfig) => {
  const rootConfig = {
    ...chainConfig,
    queryClient: new QueryClient(),
    cccClient: new ccc.ClientPublicTestnet(),
  };
  prefetchData(rootConfig);
  return rootConfig;
});

const mainnetRootConfigPromise = chainConfigFrom(
  "mainnet",
  undefined,
  true,
  getIckbScriptConfigs,
).then((chainConfig) => {
  const rootConfig = {
    ...chainConfig,
    queryClient: new QueryClient(),
    cccClient: new ccc.ClientPublicMainnet(),
  };
  prefetchData(rootConfig);
  return rootConfig;
});

export async function startApp(wallet_chain: string) {
  const [walletName, chain] = wallet_chain.split("_");
  const rootConfig = await (chain === "mainnet"
    ? mainnetRootConfigPromise
    : testnetRootConfigPromise);

  const signer = JoyId.getJoyIdSigners(
    rootConfig.cccClient,
    appName,
    "https://ickb.org" + appIcon,
  ).filter((i) => i.name === "CKB")[0].signer;

  const rootElement = document.getElementById("app")!;
  const root = createRoot(rootElement);
  rootElement.textContent = "";
  root.render(
    <StrictMode>
      <QueryClientProvider client={rootConfig.queryClient}>
        <Connector {...{ rootConfig, signer, walletName }} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
