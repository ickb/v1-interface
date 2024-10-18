import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Metamask from "./Metamask.tsx";
import { getIckbScriptConfigs } from "@ickb/v1-core";
import { chainConfigFrom } from "@ickb/lumos-utils";
import { prefetchData } from "./queries.ts";

const testnetRootConfigPromise = chainConfigFrom(
  "testnet",
  undefined,
  true,
  getIckbScriptConfigs,
).then((chainConfig) => {
  const rootConfig = { ...chainConfig, queryClient: new QueryClient() };
  prefetchData(rootConfig);
  return rootConfig;
});

const mainnetRootConfigPromise = chainConfigFrom(
  "mainnet",
  undefined,
  true,
  getIckbScriptConfigs,
).then((chainConfig) => {
  const rootConfig = { ...chainConfig, queryClient: new QueryClient() };
  prefetchData(rootConfig);
  return rootConfig;
});

export async function startApp(chain: "testnet" | "mainnet") {
  const rootConfig = await (chain === "mainnet"
    ? mainnetRootConfigPromise
    : testnetRootConfigPromise);
  const rootElement = document.getElementById("app")!;
  const root = createRoot(rootElement);
  rootElement.textContent = "";
  root.render(
    <StrictMode>
      <QueryClientProvider client={rootConfig.queryClient}>
        <Metamask {...{ rootConfig }} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
