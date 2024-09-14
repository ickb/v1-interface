import { useQuery } from "@tanstack/react-query";
import {
  createTransactionFromSkeleton,
  encodeToAddress,
  type TransactionSkeletonType,
} from "@ckb-lumos/helpers";
import {
  OmnilockWitnessLock,
  createOmnilockScript,
  prepareSigningEntries,
} from "@ckb-lumos/common-scripts/lib/omnilock";
import {
  I8Script,
  addWitnessPlaceholder,
  lockExpanderFrom,
} from "@ickb/lumos-utils";
import { bytify, hexify } from "@ckb-lumos/codec/lib/bytes";
import type { Hexadecimal } from "@ckb-lumos/base";
import type { RootConfig, WalletConfig } from "./utils.ts";
import { EmptyDashboard } from "./Dashboard.tsx";
import App from "./App.tsx";
import Progress from "./Progress.tsx";

export default function Metamask({ rootConfig }: { rootConfig: RootConfig }) {
  const {
    isPending,
    error,
    data: walletConfig,
  } = useQuery({
    refetchInterval: 5 * 1000,
    initialData: () => {
      const ethereumAddress = getEthereum()?.selectedAddress || undefined;
      return ethereumAddress ? { ethereumAddress, rootConfig } : undefined;
    },
    queryKey: ["walletConfig"],
    queryFn: async () => {
      const ethereum = getEthereum()!;
      await ethereum.enable();
      const ethereumAddress = ethereum.selectedAddress;
      if (!ethereumAddress) {
        throw Error("Invalid Ethereum address");
      }
      return { ethereumAddress, rootConfig };
    },
    select: omnilockFrom,
  });

  if (isPending)
    return (
      <>
        <EmptyDashboard />
        <p>Waiting for Metamask authorization...</p>
        <Progress />
      </>
    );

  if (error) {
    setTimeout(function () {
      console.log(error);
      location.reload();
    }, 10000);
    return <p>Unable to connect to MetaMask ⚠️</p>;
  }

  return <App {...{ walletConfig }} />;
}

function omnilockFrom({
  ethereumAddress,
  rootConfig,
}: {
  ethereumAddress: Hexadecimal;
  rootConfig: RootConfig;
}): WalletConfig {
  const { config } = rootConfig;
  const accountLock = I8Script.from({
    ...config.defaultScript("OMNILOCK"),
    args: createOmnilockScript(
      {
        auth: {
          flag: "ETHEREUM",
          content: ethereumAddress,
        },
      },
      { config },
    ).args,
  });

  const expander = lockExpanderFrom(accountLock);

  const PLACEHOLDER = hexify(
    new Uint8Array(
      OmnilockWitnessLock.pack({
        signature: new Uint8Array(65).buffer,
      }).byteLength,
    ),
  );

  function addPlaceholders(tx: TransactionSkeletonType) {
    return addWitnessPlaceholder(tx, accountLock, PLACEHOLDER);
  }

  async function signer(tx: TransactionSkeletonType) {
    tx = addPlaceholders(tx);
    tx = prepareSigningEntries(tx, { config });

    const ethereum = getEthereum()!;

    let signedMessage = (await ethereum.request({
      method: "personal_sign",
      params: [ethereum.selectedAddress, tx.signingEntries!.get(0)!.message],
    })) as string;

    let v = Number.parseInt(signedMessage.slice(-2), 16);
    if (v >= 27) v -= 27;
    signedMessage =
      "0x" + signedMessage.slice(2, -2) + v.toString(16).padStart(2, "0");

    const signedWitness = hexify(
      OmnilockWitnessLock.pack({
        signature: bytify(signedMessage).buffer,
      }),
    );
    tx = addWitnessPlaceholder(tx, accountLock, signedWitness);

    return createTransactionFromSkeleton(tx);
  }

  const address = encodeToAddress(accountLock, { config });

  return {
    ...rootConfig,
    address,
    accountLock,
    addPlaceholders,
    signer,
    expander,
  };
}

function getEthereum() {
  if ("ethereum" in window) {
    return window.ethereum as EthereumProvider;
  }
  return undefined;
}

interface EthereumProvider {
  selectedAddress: string;
  isMetaMask?: boolean;
  enable: () => Promise<string[]>;
  addListener: (
    event: "accountsChanged",
    listener: (addresses: string[]) => void,
  ) => void;
  removeEventListener: (
    event: "accountsChanged",
    listener: (addresses: string[]) => void,
  ) => void;
  request: EthereumRpc;
}

interface EthereumRpc {
  (payload: {
    method: "personal_sign";
    params: [string /*from*/, string /*message*/];
  }): Promise<string>;
}
