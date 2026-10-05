import { registerTestWallet } from "./fixture-cleanup";
import { Keypair, Transaction, Networks } from "@stellar/stellar-sdk";
const base = "http://127.0.0.1:5173";
export async function mockFreighter(
  page: import("@playwright/test").Page,
  wallet: Keypair | { publicKey: () => string },
  reject = false,
) {
  if (wallet instanceof Keypair) await registerTestWallet(wallet.publicKey());
  await page.exposeFunction(
    "testSignStellarChallenge",
    async (xdr: string, network: string) => {
      if (!(wallet instanceof Keypair))
        throw new Error(
          "The local admin fixture cannot sign wallet challenges.",
        );
      const tx = new Transaction(xdr, network);
      tx.sign(wallet);
      return tx.toXDR();
    },
  );
  await page.addInitScript(
    ({ address, network, reject }) => {
      const win = window as typeof window & {
        freighter: boolean;
        testSignStellarChallenge: (
          xdr: string,
          network: string,
        ) => Promise<string>;
        testWalletAddress: string;
      };
      win.freighter = true;
      win.testWalletAddress = address;
      window.addEventListener("message", async (event) => {
        const request = event.data;
        if (
          event.source !== window ||
          request?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST"
        )
          return;
        let response: Record<string, unknown> = {};
        switch (request.type) {
          case "REQUEST_CONNECTION_STATUS":
            response = { isConnected: true };
            break;
          case "REQUEST_ACCESS":
          case "REQUEST_PUBLIC_KEY":
            response = { publicKey: win.testWalletAddress };
            break;
          case "REQUEST_ALLOWED_STATUS":
            response = { isAllowed: true };
            break;
          case "REQUEST_NETWORK":
            response = { network: "TESTNET", networkPassphrase: network };
            break;
          case "REQUEST_USER_INFO":
            response = {
              publicKey: win.testWalletAddress,
              network: "TESTNET",
              networkPassphrase: network,
            };
            break;
          case "SUBMIT_TRANSACTION":
            response = reject
              ? { apiError: { code: -1, message: "User rejected signature" } }
              : {
                  signedTransaction: await win.testSignStellarChallenge(
                    request.transactionXdr,
                    request.networkPassphrase,
                  ),
                  signerAddress: win.testWalletAddress,
                };
            break;
        }
        window.postMessage(
          {
            ...response,
            source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
            messagedId: request.messageId,
          },
          window.location.origin,
        );
      });
    },
    { address: wallet.publicKey(), network: Networks.TESTNET, reject },
  );
}
export async function startLogin(page: import("@playwright/test").Page) {
  await page.goto(base);
  await page
    .getByRole("button", { name: "Conectar wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Elegir wallet e iniciar sesión" })
    .click();
  await page.getByText("Freighter", { exact: true }).click();
}
