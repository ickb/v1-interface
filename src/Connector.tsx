import { useQuery } from "@tanstack/react-query";
import { I8Script, i8ScriptPadding, scriptEq } from "@ickb/lumos-utils";
import type { Cell } from "@ckb-lumos/base";
import type { RootConfig } from "./utils.ts";
import { EmptyDashboard } from "./Dashboard.tsx";
import App from "./App.tsx";
import Progress from "./Progress.tsx";
import { Transaction, type Signer } from "@ckb-ccc/ccc";
import type { TransactionSkeletonType } from "@ckb-lumos/helpers";

export default function Connector({
  rootConfig,
  signer,
  walletName,
}: {
  rootConfig: RootConfig;
  signer: Signer;
  walletName: string;
}) {
  const {
    isPending,
    error,
    data: walletConfig,
  } = useQuery({
    queryKey: ["walletConfig"],
    queryFn: async () => {
      if (!(await signer.isConnected())) {
        await signer.connect();
      }

      const [address, recommendedAddressObj, addressObjs] = await Promise.all([
        signer.getRecommendedAddress(),
        signer.getRecommendedAddressObj(),
        signer.getAddressObjs(),
      ]);

      let accountLocks = [recommendedAddressObj, ...addressObjs].map((s) =>
        I8Script.from({
          ...i8ScriptPadding,
          ...s.script,
        }),
      );
      // Keep unique account locks, preferred one is the first one
      accountLocks = [
        ...new Map(
          accountLocks.map((s) => [`${s.args}-${s.hashType}-${s.codeHash}`, s]),
        ).values(),
      ];

      const expander = (c: Cell) => {
        const lock = c.cellOutput.lock;
        for (const s of accountLocks) {
          if (scriptEq(lock, s)) {
            return s;
          }
        }
      };

      const getTxSizeOverhead = async (tx: TransactionSkeletonType) => {
        const t0 = Transaction.fromLumosSkeleton(tx);
        const size0 = t0.toBytes().length; // +4
        const t1 = await signer.prepareTransaction(t0);
        const size1 = t1.toBytes().length; // +4
        return size1 - size0;
      };

      const sendSigned = async (tx: TransactionSkeletonType) =>
        signer.sendTransaction(Transaction.fromLumosSkeleton(tx));

      return {
        ...rootConfig,
        address,
        accountLocks,
        expander,
        getTxSizeOverhead,
        sendSigned,
      };
    },
  });

  if (isPending)
    return (
      <>
        <EmptyDashboard />
        <p>Waiting for {walletName} authorization...</p>
        <Progress />
      </>
    );

  if (error) {
    setTimeout(function () {
      console.log(error);
      location.reload();
    }, 10000);
    return <p>Unable to connect to {walletName} ⚠️</p>;
  }

  return <App {...{ walletConfig }} />;
}
