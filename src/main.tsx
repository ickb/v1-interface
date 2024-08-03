import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Metamask from "./Metamask.tsx";
import { getIckbScriptConfigs } from "@ickb/v1-core";
import { chainConfigFrom } from "@ickb/lumos-utils";
import { prefetchData } from "./queries.ts";

const queryClient = new QueryClient();
const chainConfig = await chainConfigFrom(
  "testnet",
  undefined,
  true,
  getIckbScriptConfigs,
);
const rootConfig = { ...chainConfig, queryClient };
prefetchData(rootConfig);
const rootElement = document.getElementById("app")!;
const root = createRoot(rootElement);

export async function startApp() {
  rootElement.textContent = "";
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <Metamask {...{ rootConfig }} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
