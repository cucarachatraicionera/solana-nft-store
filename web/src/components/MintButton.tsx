import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  mplCandyMachine,
  fetchCandyMachine,
  safeFetchCandyGuard,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";
import {
  publicKey,
  generateSigner,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

const RPC = import.meta.env.VITE_RPC_ENDPOINT as string;
const CM_ID = import.meta.env.VITE_CANDY_MACHINE_ID as string;

export default function MintButton() {
  const { connected, wallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const disabled = !connected || !wallet || loading;

  const handleMint = async () => {
    try {
      setLoading(true);
      if (!wallet) throw new Error("Conecta una wallet primero");

      // Umi + identidad firmada por la wallet del navegador
      const umi = createUmi(RPC)
        .use(mplCandyMachine())
        .use(walletAdapterIdentity(wallet.adapter));

      // Traer Candy Machine y su Guard on-chain
      const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
      const guard = await safeFetchCandyGuard(umi, cm.mintAuthority);
      if (!guard) throw new Error("Candy Guard no encontrado");

      // Mint keypair
      const nftMint = generateSigner(umi);

      // Construir mintV2 (el pago va al solPayment del Guard)
      const builder = await mintV2(umi, {
        candyMachine: cm.publicKey,
        candyGuard: guard.publicKey,
        nftMint,
        collectionMint: cm.collectionMint,
        collectionUpdateAuthority: cm.authority,
        // mintArgs vacío porque usamos el grupo 'default' del guard
        mintArgs: {},
      });

      const res = await builder.sendAndConfirm(umi);
      // La firma suele venir como string en res.signature
      // Si no, lo mostramos completo.
      const sig =
        typeof (res as any)?.signature === "string"
          ? (res as any).signature
          : null;

      console.log("Mint tx result:", res);
      if (sig) {
        setLastSig(sig);
      } else {
        setLastSig("(ver consola)");
      }
      alert("✅ Mint enviado");
    } catch (e: any) {
      console.error(e);
      alert(`❌ Error mint: ${e?.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 items-start">
      <WalletMultiButton />
      <button
        onClick={handleMint}
        disabled={disabled}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {loading ? "Minting..." : "Mint 0.1 SOL"}
      </button>
      {lastSig && (
        <a
          className="underline text-blue-600"
          href={`https://explorer.solana.com/tx/${lastSig}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          Ver transacción en Explorer
        </a>
      )}
    </div>
  );
}
