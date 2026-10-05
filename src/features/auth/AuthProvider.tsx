import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
type Session = FunctionReturnType<typeof api.auth.verifyChallenge>;
const STORAGE_KEY = "hacks.wallet-session.v1";
type AuthState = {
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  busy: boolean;
  error: string | null;
  stage: string;
  connect: (network: "testnet" | "mainnet") => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  fetchAccessToken: (args: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
};
const AuthContext = createContext<AuthState | null>(null);
export function useWalletAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s: unknown = JSON.parse(raw);
    if (typeof s !== "object" || s === null) return null;
    const v = s as Record<string, unknown>;
    if (
      typeof v.token !== "string" ||
      typeof v.refreshToken !== "string" ||
      typeof v.wallet !== "string" ||
      (v.network !== "testnet" && v.network !== "mainnet") ||
      typeof v.expiresAt !== "number" ||
      typeof v.sessionExpiresAt !== "number" ||
      v.sessionExpiresAt <= Date.now()
    )
      return null;
    return v as Session;
  } catch {
    return null;
  }
}
function messageFor(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
  if (/RATE_LIMITED/.test(message))
    return "Demasiados intentos. Espera un minuto y vuelve a intentar.";
  if (/SUSPENDED|FORBIDDEN/.test(message))
    return "Esta cuenta no tiene acceso a la plataforma.";
  if (/AUTH_NOT_CONFIGURED/.test(message))
    return "La autenticación no está configurada en el servidor.";
  if (/INVALID_CHALLENGE|INVALID_SIGNATURE/.test(message))
    return "No pudimos verificar la firma. Inicia la conexión otra vez.";
  if (/SESSION_EXPIRED/.test(message))
    return "La sesión expiró. Vuelve a conectar tu wallet.";
  if (/cancel|reject|declin|closed|denied/i.test(message))
    return "Conexión cancelada. Puedes volver a intentarlo.";
  if (/fetch|network|connection|unavailable/i.test(message))
    return "No pudimos conectar con el servidor. Inténtalo nuevamente.";
  return "No pudimos iniciar sesión. Revisa tu wallet y vuelve a intentar.";
}
export function AuthProvider({
  client,
  children,
}: {
  client: ConvexReactClient | null;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [isLoading, setIsLoading] = useState(!!session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const sessionRef = useRef(session);
  const generation = useRef(0);
  const connecting = useRef(false);
  const refreshPromise = useRef<Promise<string | null> | null>(null);
  const save = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* In restricted storage the session lasts only for this tab. */
    }
  }, []);
  const logout = useCallback(async () => {
    const old = sessionRef.current;
    generation.current++;
    save(null);
    setIsLoading(false);
    setError(null);
    if (old && client) {
      try {
        await client.action(api.auth.logout, {
          refreshToken: old.refreshToken,
        });
      } catch {
        setError(
          "Sesión cerrada en este dispositivo. No se pudo confirmar la revocación en el servidor.",
        );
      }
    }
    try {
      const { getWalletKit } = await import("./kit");
      await getWalletKit().disconnect();
    } catch {
      /* Wallet may already be disconnected. */
    }
  }, [client, save]);
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const current = sessionRef.current;
      if (!current || !client) return null;
      if (!forceRefreshToken && current.expiresAt > Date.now() + 60_000)
        return current.token;
      if (refreshPromise.current) return refreshPromise.current;
      const currentGeneration = generation.current;
      const request = (async () => {
        try {
          const next = await client.action(api.auth.refresh, {
            refreshToken: current.refreshToken,
          });
          if (generation.current !== currentGeneration) return null;
          save(next);
          return next.token;
        } catch (e) {
          if (generation.current === currentGeneration) {
            setError(messageFor(e));
            if (/SESSION_EXPIRED|SUSPENDED/.test(String(e))) {
              generation.current++;
              save(null);
            }
          }
          return null;
        } finally {
          setIsLoading(false);
        }
      })();
      refreshPromise.current = request;
      try {
        return await request;
      } finally {
        if (refreshPromise.current === request) refreshPromise.current = null;
      }
    },
    [client, save],
  );
  useEffect(() => {
    if (!sessionRef.current) {
      setIsLoading(false);
      return;
    }
    void fetchAccessToken({ forceRefreshToken: true });
  }, [fetchAccessToken]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      generation.current++;
      const next = loadSession();
      sessionRef.current = next;
      setSession(next);
      setIsLoading(false);
      if (next) void fetchAccessToken({ forceRefreshToken: false });
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [save, fetchAccessToken]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => {
        if (session.sessionExpiresAt <= Date.now()) void logout();
        else void fetchAccessToken({ forceRefreshToken: true });
      },
      Math.max(
        1_000,
        Math.min(session.expiresAt - Date.now() - 60_000, 2_147_483_647),
      ),
    );
    return () => clearTimeout(timer);
  }, [session, logout, fetchAccessToken]);
  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let subscriptions: (() => void)[] = [];
    let poll: ReturnType<typeof setInterval> | undefined;
    void import("./kit").then(({ getWalletKit, KitEventType }) => {
      if (disposed) return;
      const kit = getWalletKit();
      subscriptions = [
        kit.on(KitEventType.STATE_UPDATED, (event) => {
          if (
            event.payload.address &&
            event.payload.address !== sessionRef.current?.wallet
          )
            void logout();
        }),
        kit.on(KitEventType.DISCONNECT, () => {
          if (sessionRef.current) void logout();
        }),
      ];
      const check = async () => {
        try {
          if (!["freighter", "rabet"].includes(kit.selectedModule.productId))
            return;
          const address = (
            await kit.selectedModule.getAddress({ skipRequestAccess: true })
          ).address;
          if (
            address &&
            sessionRef.current &&
            address !== sessionRef.current.wallet
          )
            void logout();
        } catch {
          /* A locked wallet does not invalidate its signed server session. */
        }
      };
      poll = setInterval(() => {
        if (document.visibilityState === "visible") void check();
      }, 15_000);
    });
    return () => {
      disposed = true;
      subscriptions.forEach((unsubscribe) => unsubscribe());
      if (poll) clearInterval(poll);
    };
  }, [session?.wallet, logout]);
  const connect = useCallback(
    async (network: "testnet" | "mainnet") => {
      if (connecting.current) return false;
      connecting.current = true;
      setBusy(true);
      setError(null);
      const currentGeneration = ++generation.current;
      try {
        if (!client) throw new Error("AUTH_NOT_CONFIGURED");
        setStage("Elige tu wallet");
        const { getWalletKit, Networks } = await import("./kit");
        const kit = getWalletKit();
        kit.setNetwork(
          network === "testnet" ? Networks.TESTNET : Networks.PUBLIC,
        );
        const { address } = await kit.authModal();
        setStage("Preparando la firma");
        const challenge = await client.action(api.auth.createChallenge, {
          wallet: address,
          network,
        });
        setStage("Confirma la firma en tu wallet");
        const signed = await kit.signTransaction(challenge.xdr, {
          address,
          networkPassphrase: challenge.networkPassphrase,
        });
        if (signed.signerAddress && signed.signerAddress !== address)
          throw new Error("INVALID_SIGNATURE");
        if ((await kit.fetchAddress()).address !== address)
          throw new Error("INVALID_SIGNATURE");
        if (generation.current !== currentGeneration) return false;
        setStage("Verificando tu identidad");
        const next = await client.action(api.auth.verifyChallenge, {
          nonce: challenge.nonce,
          signedXdr: signed.signedTxXdr,
        });
        if (generation.current !== currentGeneration) {
          await client.action(api.auth.logout, {
            refreshToken: next.refreshToken,
          });
          return false;
        }
        save(next);
        setIsLoading(false);
        return true;
      } catch (e) {
        setError(messageFor(e));
        return false;
      } finally {
        connecting.current = false;
        setBusy(false);
        setStage("");
      }
    },
    [client, save],
  );
  const value: AuthState = {
    session,
    isLoading,
    isAuthenticated: !!session,
    busy,
    error,
    stage,
    connect,
    logout,
    clearError: () => setError(null),
    fetchAccessToken,
  };
  return (
    <AuthContext.Provider value={value}>
      {client ? (
        <ConvexProviderWithAuth client={client} useAuth={useWalletAuth}>
          {children}
        </ConvexProviderWithAuth>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}
