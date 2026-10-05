"use node";
import { Keypair, Networks, WebAuth, Transaction } from "@stellar/stellar-sdk";
export const passphrase = (network: "testnet" | "mainnet") =>
  network === "testnet" ? Networks.TESTNET : Networks.PUBLIC;
export function verifyWalletProof(input: {
  storedXdr: string;
  signedXdr: string;
  wallet: string;
  network: "testnet" | "mainnet";
  serverPublicKey: string;
  homeDomain: string;
  webAuthDomain: string;
}) {
  const network = passphrase(input.network);
  const stored = new Transaction(input.storedXdr, network);
  const signed = new Transaction(input.signedXdr, network);
  if (!stored.hash().every((byte,i)=>byte===signed.hash()[i]))
    throw new Error("CHALLENGE_CHANGED");
  const signers = WebAuth.verifyChallengeTxSigners(
    input.signedXdr,
    input.serverPublicKey,
    network,
    [input.wallet],
    input.homeDomain,
    input.webAuthDomain,
  );
  if (!signers.includes(input.wallet)) throw new Error("INVALID_SIGNATURE");
  // Explicit verification against the exact requested account (single-key accounts).
  if (
    !signed.signatures.some((signature) =>
      Keypair.fromPublicKey(input.wallet).verify(
        signed.hash(),
        signature.signature,
      ),
    )
  )
    throw new Error("INVALID_SIGNATURE");
}
