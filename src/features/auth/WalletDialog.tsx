import { useI18n } from "../../i18n/I18n";
import { Link } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import {
  Wallet,
  X,
  ArrowUpRight,
  LogOut,
  Check,
  Copy,
  LoaderCircle,
  ShieldCheck,
  LayoutDashboard,
  UserRound,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useWalletAuth } from "./AuthProvider";
export function WalletDialog({ onClose }: { onClose: () => void }) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth();
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !auth.busy) onClose();
      if (e.key === "Tab") {
        const elements = root.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select:not(:disabled),a[href]",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose, auth.busy]);
  return (
    <div
      className="modal-backdrop"
      onClick={() => {
        if (!auth.busy) onClose();
      }}
    >
      <section
        ref={root}
        className={`modal ${auth.session ? "session-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close"
          aria-label={tr("Cerrar")}
          disabled={auth.busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className={auth.session ? "session-icon" : undefined}>
          <Wallet size={30} />
        </div>
        <h2 id="wallet-title">
          {auth.session
            ? tr("Tu sesión de builder.")
            : tr("Tu wallet, tu identidad.")}
        </h2>
        {auth.session ? (
          <>
            <div className="session-status">
              <span className="session-status-dot" aria-hidden="true" />
              {tr("Sesión iniciada ·")}{" "}
              {auth.session.network === "testnet"
                ? tr("Testnet")
                : tr("Mainnet")}
            </div>
            <div className="session-wallet-card">
              <div className="session-wallet-heading">
                <span>{tr("DIRECCIÓN STELLAR")}</span>
                <Wallet size={15} aria-hidden="true" />
              </div>
              <p className="wallet-address">{auth.session.wallet}</p>
              <button
                className="session-copy"
                onClick={async () => {
                  setCopyError("");
                  try {
                    await navigator.clipboard.writeText(auth.session!.wallet);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                    setCopyError(
                      "No se pudo copiar. Selecciona la dirección para copiarla manualmente.",
                    );
                  }
                }}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                <span aria-live="polite">
                  {copied ? tr("Dirección copiada") : tr("Copiar dirección")}
                </span>
              </button>
              {copyError && (
                <p className="auth-error" role="alert">
                  {tr(copyError)}
                </p>
              )}
            </div>
            <div className="session-duration">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                {tr(
                  "Tu sesión se renueva automáticamente y dura hasta siete días.",
                )}
              </p>
            </div>
            <div className="session-actions">
              <Button asChild className="session-panel-link">
                <Link to="/manage" onClick={onClose}>
                  <LayoutDashboard size={18} />
                  <span>{tr("Ir a mi panel")}</span>
                  <ArrowUpRight size={17} />
                </Link>
              </Button>
              <Button asChild className="session-profile-link">
                <Link to="/perfil" onClick={onClose}>
                  <UserRound size={18} />
                  <span>{tr("Completar mi perfil")}</span>
                  <ArrowUpRight size={17} />
                </Link>
              </Button>
            </div>
            <div className="session-footer">
              <button
                className="session-logout"
                disabled={auth.busy}
                onClick={() => void auth.logout()}
              >
                <LogOut size={16} />
                {tr("Cerrar sesión")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>
              {tr(
                "Elige tu wallet Stellar y firma para iniciar sesión. La firma confirma que esta dirección te pertenece.",
              )}
            </p>
            <label className="network-label">
              {tr("Red de la wallet")}
              <select
                value={network}
                disabled={auth.busy}
                onChange={(e) =>
                  setNetwork(e.target.value as "testnet" | "mainnet")
                }
              >
                <option value="testnet">{tr("Stellar Testnet")}</option>
                <option value="mainnet">{tr("Stellar Mainnet")}</option>
              </select>
            </label>
            <div className="notice">
              {tr(
                "Firmar este acceso no envía transacciones a la red ni mueve fondos.",
              )}
            </div>
            <Button
              disabled={auth.busy}
              onClick={() => void auth.connect(network)}
            >
              {auth.busy ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  {tr(auth.stage)}
                </>
              ) : (
                <>
                  {tr("Elegir wallet e iniciar sesión")}
                  <ArrowUpRight size={16} />
                </>
              )}
            </Button>
            <small className="wallet-supported">
              {tr("Freighter · xBull · Albedo · LOBSTR · Rabet · Hana")}
            </small>
          </>
        )}
        {auth.error && (
          <p className="auth-error" role="alert">
            {tr(auth.error)}
          </p>
        )}
      </section>
    </div>
  );
}
