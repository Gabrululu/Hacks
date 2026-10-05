import { StellarWalletsKit } from "@creit-tech/stellar-wallets-kit/sdk";
import { FreighterModule } from "@creit-tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit-tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule } from "@creit-tech/stellar-wallets-kit/modules/albedo";
import { LobstrModule } from "@creit-tech/stellar-wallets-kit/modules/lobstr";
import { RabetModule } from "@creit-tech/stellar-wallets-kit/modules/rabet";
import { HanaModule } from "@creit-tech/stellar-wallets-kit/modules/hana";
import {
  Networks,
  SwkAppDarkTheme,
} from "@creit-tech/stellar-wallets-kit/types";
let initialized = false;
export function getWalletKit() {
  if (!initialized) {
    StellarWalletsKit.init({
      modules: [
        new FreighterModule(),
        new xBullModule(),
        new AlbedoModule(),
        new LobstrModule(),
        new RabetModule(),
        new HanaModule(),
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
export { KitEventType, Networks } from "@creit-tech/stellar-wallets-kit/types";
