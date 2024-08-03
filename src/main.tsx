import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Metamask from "./Metamask.tsx";
import { getIckbScriptConfigs } from "@ickb/v1-core";
import { chainConfigFrom } from "@ickb/lumos-utils";
import { prefetchData } from "./queries.ts";

const rootConfigPromise = chainConfigFrom(
  "testnet",
  undefined,
  true,
  getIckbScriptConfigs,
).then((chainConfig) => {
  const rootConfig = { ...chainConfig, queryClient: new QueryClient() };
  prefetchData(rootConfig);
  return rootConfig;
});

export async function startApp() {
  const rootConfig = await rootConfigPromise;
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
