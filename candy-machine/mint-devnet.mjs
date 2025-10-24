import fs from "fs";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  publicKey,
  keypairIdentity,
  generateSigner,
  transactionBuilder,
  some,
} from "@metaplex-foundation/umi";
import {
  setComputeUnitLimit,
  setComputeUnitPrice,
} from "@metaplex-foundation/mpl-toolbox";
import {
  mplCandyMachine,
  fetchCandyMachine,
  safeFetchCandyGuard,
  mintV2,
} from "@metaplex-foundation/mpl-candy-machine";

// --- CONFIG (devnet) ---
const RPC = process.env.RPC || "https://api.devnet.solana.com";
const CM_ID = "8mvgPzLUWbfQTKfkEW9RT9v1EnMMvPKQXz1gqVAbW3U8";          // Candy Machine ID
const COLLECTION_UPDATE_AUTH = "5G1gjvthaxUZgxEDSnP9mfFP7TUAMcaAh7Sde4D7ai2f"; // Update authority de la colección (tu deployer)
const TREASURY_DEST = "7V75SBLuASmeqW24hSEYpxTkGHhMQK7UTGCJ1jVwqyyE";          // Tesorería que recibe el SOL del mint

function loadBuyerKeypair(umi) {
  const raw = fs.readFileSync("./buyer.json", "utf8");  // generado con `solana-keygen new --outfile ./buyer.json`
  const parsed = JSON.parse(raw);
  const secret = Array.isArray(parsed) ? parsed : parsed?.secretKey || parsed;
  if (!Array.isArray(secret) || secret.length < 64) {
    throw new Error("buyer.json no parece un keypair válido (array de 64 números).");
  }
  return umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(secret));
}

async function main() {
  console.log("RPC:", RPC);
  console.log("CM_ID:", CM_ID);

  // 1) Umi + identidad del comprador
  const umi = createUmi(RPC).use(mplCandyMachine());
  const kp = loadBuyerKeypair(umi);
  umi.use(keypairIdentity(kp));

  // 2) Cargar Candy Machine y Candy Guard desde cadena
  const cm = await fetchCandyMachine(umi, publicKey(CM_ID));
  const guard = await safeFetchCandyGuard(umi, cm.mintAuthority);
  if (!guard) throw new Error("Candy Guard no encontrado (¿envolviste el CM?)");

  // 3) Crear el mint del NFT (obligatorio en mintV2)
  const nftMint = generateSigner(umi);
  console.log("Minted NFT address:", nftMint.publicKey.toString());

  // 4) Construir y enviar la transacción (más CU + pequeña priority fee)
  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 1_000_000 }))     // sube el límite de compute units
    .add(setComputeUnitPrice(umi, { microLamports: 500 }))   // propina mínima
    .add(
      mintV2(umi, {
        candyMachine: cm.publicKey,
        candyGuard: guard.publicKey,
        nftMint,                                            // <- NUEVO mint del NFT
        collectionMint: cm.collectionMint,
        collectionUpdateAuthority: publicKey(COLLECTION_UPDATE_AUTH),
        // Args del guard: solPayment necesita el destino explícito
        mintArgs: {
          solPayment: some({
            destination: publicKey(TREASURY_DEST),
          }),
        },
      })
    );

  const res = await builder.sendAndConfirm(umi);

  // Imprime firma si está disponible; si no, muestra el objeto completo
  let sig = null;
  if (typeof res?.signature === "string") sig = res.signature;
  console.log("Mint tx sig:", sig ?? "(ver objeto res abajo)");

  const replacer = (_, v) => (v instanceof Uint8Array ? Array.from(v) : v);
  console.log("Full response:", JSON.stringify(res, replacer, 2));
}

main().catch((e) => {
  console.error("❌ Error:", e?.stack || e?.message || e);
  process.exit(1);
});
