import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { FreighterModule } from "@creit-tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit-tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit-tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit-tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit-tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit-tech/stellar-wallets-kit/modules/hana";
import { MetaMaskModule } from "@creit-tech/stellar-wallets-kit/modules/metamask";
import {
  WalletConnectModule,
  WalletConnectTargetChain,
} from "@creit-tech/stellar-wallets-kit/modules/wallet-connect";
import {
  Networks,
  SwkAppDarkTheme,
} from "@creit-tech/stellar-wallets-kit/types";
// MetaMask's Stellar connector only exposes the public network.
export const MAINNET_ONLY_WALLETS = ["metamask"];
let initialized = false;
let walletConnect: WalletConnectModule | undefined;
function createWalletConnect() {
  const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
  if (!projectId) return undefined;
  const origin = window.location.origin;
  return new WalletConnectModule({
    projectId,
    metadata: {
      name: "Hacks",
      description: "Hackathons en Stellar",
      url: origin,
      icons: [`${origin}/favicon.svg`],
    },
    allowedChains: [WalletConnectTargetChain.TESTNET],
  });
}
// Freighter was renamed Varial (Oct 2026); its extension API is unchanged, so
// only the label and install link shown in the wallet picker differ.
function createVarial() {
  const varial = new FreighterModule();
  varial.productName = "Varial";
  varial.productUrl = "https://varialwallet.com";
  return varial;
}
export function getWalletKit() {
  if (!initialized) {
    walletConnect = createWalletConnect();
    StellarWalletsKit.init({
      modules: [
        createVarial(),
        new MetaMaskModule(),
        new xBullModule(),
        new AlbedoModule(),
        new LobstrModule(),
        new RabetModule(),
        new HanaModule(),
        ...(walletConnect ? [walletConnect] : []),
      ],
      network: Networks.TESTNET,
      theme: {
        ...SwkAppDarkTheme,
        "font-family": "Inter, sans-serif",
        "border-radius": "8px",
      },
      authModal: { showInstallLabel: true, hideUnsupportedWallets: false },
    });
    initialized = true;
  }
  return StellarWalletsKit;
}
// WalletConnect proposes its session for the chain chosen at sign-in, so a
// wallet that only supports one network is not asked to approve both.
export function setWalletNetwork(network: "testnet" | "mainnet") {
  const kit = getWalletKit();
  kit.setNetwork(network === "testnet" ? Networks.TESTNET : Networks.PUBLIC);
  if (walletConnect)
    walletConnect.wcParams.allowedChains = [
      network === "testnet"
        ? WalletConnectTargetChain.TESTNET
        : WalletConnectTargetChain.PUBLIC,
    ];
  return kit;
}
export { KitEventType, Networks } from "@creit-tech/stellar-wallets-kit/types";
