import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { useAction, useMutation, useQuery, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import type { FunctionReturnType } from "convex/server";
function errorMessage(error: unknown) {
  const text = String(error);
  if (text.includes("RATE_LIMITED"))
    return "Espera un minuto entre códigos. Puedes solicitar hasta tres por hora.";
  if (text.includes("NOT_CONFIGURED"))
    return "El envío de correos todavía no está disponible.";
  if (text.includes("EMAIL_SUPPRESSED"))
    return "Este correo está bloqueado por un rebote permanente o una queja. Usa otra dirección.";
  if (text.includes("INVALID_EMAIL")) return "Introduce un correo válido.";
  if (text.includes("INVALID_LINK"))
    return "Usa enlaces HTTPS de GitHub, X o LinkedIn.";
  if (text.includes("INVALID_PROFILE"))
    return "El nombre debe tener entre 2 y 80 caracteres y la biografía hasta 500.";
  return "No pudimos guardar los cambios. Inténtalo nuevamente.";
}
export function ProfilePage({ onConnect }: { onConnect: () => void }) {
  const { t: tr } = useI18n();

  if (!import.meta.env.VITE_CONVEX_URL)
    return (
      <section className="simple-page">
        <h1>{tr("Perfil")}</h1>
        <p>{tr("Conecta el servidor para completar tu perfil.")}</p>
      </section>
    );
  return <ConnectedProfile onConnect={onConnect} />;
}
function ConnectedProfile({ onConnect }: { onConnect: () => void }) {
  const { t: tr } = useI18n();

  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && !me))
    return (
      <section className="simple-page">
        <p>{tr("Cargando tu perfil…")}</p>
      </section>
    );
  if (!me)
    return (
      <section className="simple-page">
        <div className="eyebrow">{tr("TU IDENTIDAD")}</div>
        <h1>{tr("Conecta y construye.")}</h1>
        <p>{tr("Inicia sesión con tu wallet para completar tu perfil.")}</p>
        <Button onClick={onConnect}>{tr("Conectar wallet")}</Button>
      </section>
    );
  return <Editor key={me.id} me={me} />;
}
function Editor({ me }: { me: FunctionReturnType<typeof api.users.me> }) {
  const { t: tr } = useI18n();

  const [name, setName] = useState(me.name ?? "");
  const [bio, setBio] = useState(me.bio);
  const [links, setLinks] = useState(me.links);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const save = useMutation(api.users.updateProfile);
  return (
    <section className="simple-page profile-page">
      <div className="eyebrow">{tr("TU IDENTIDAD")}</div>
      <h1>
        {tr("Tu próximo proyecto")}
        <br />
        {tr("empieza contigo.")}
      </h1>
      <p>
        {me.name && me.emailVerifiedAt
          ? tr("Perfil completo. Ya estás listo para participar.")
          : tr(
              "Completa tu nombre y verifica tu correo para preparar tu cuenta.",
            )}
      </p>
      <div className="profile-grid">
        <form
          className="profile-panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              await save({ name, bio, links });
              setMessage("Perfil guardado.");
            } catch (error) {
              setMessage(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{tr("Perfil público")}</h2>
          <label>
            {tr("Nombre")}
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            {tr("Biografía")}
            <textarea
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
            />
          </label>
          {(["github", "x", "linkedin"] as const).map((key) => (
            <label key={key}>
              {key === "github"
                ? tr("GitHub")
                : key === "x"
                  ? tr("X")
                  : tr("LinkedIn")}
              <input
                type="url"
                value={links[key] ?? ""}
                placeholder={tr("https://{0}.com/tu-perfil", {
                  "0": key === "x" ? "x" : key,
                })}
                onChange={(e) => setLinks({ ...links, [key]: e.target.value })}
              />
            </label>
          ))}
          <Button disabled={busy} type="submit">
            {busy ? tr("Guardando…") : tr("Guardar perfil")}
          </Button>
          <p role="status">{tr(message)}</p>
        </form>
        <EmailPanel me={me} />
      </div>
      <p className="profile-wallet">
        {tr("Wallet · ")}
        {me.wallet}
      </p>
    </section>
  );
}
function EmailPanel({ me }: { me: FunctionReturnType<typeof api.users.me> }) {
  const { t: tr } = useI18n();

  const status = useQuery(api.emailData.status, {});
  const request = useAction(api.emails.request);
  const verify = useAction(api.emails.verify);
  const [email, setEmail] = useState(me.email ?? "");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await operation();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="profile-panel">
      <h2>{tr("Correo de contacto")}</h2>
      <p>
        {me.emailVerifiedAt
          ? tr("✓ Verificado: {0}", { "0": me.email })
          : tr(
              "Tu correo es privado. Lo usaremos para novedades de los eventos en los que participes.",
            )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await request({ email });
            setMessage(
              status?.mode === "development"
                ? "Código disponible en el buzón local."
                : "Código solicitado. Revisa tu correo y spam.",
            );
          });
        }}
      >
        <label>
          {tr("Correo")}
          <input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Button
          disabled={busy || status?.mode === "unconfigured"}
          type="submit"
        >
          {tr("Solicitar código")}
        </Button>
        {status?.mode === "unconfigured" && (
          <p>{tr("La verificación por correo estará disponible pronto.")}</p>
        )}
      </form>
      {status?.pending && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const result = await verify({ code });
              setMessage(
                {
                  verified: "Correo verificado.",
                  invalid: "Código incorrecto. Revisa los seis dígitos.",
                  locked:
                    "Llegaste al límite de intentos. Solicita un nuevo código.",
                  expired: "El código expiró. Solicita uno nuevo.",
                }[result] ?? "Inténtalo nuevamente.",
              );
              if (result === "verified") setCode("");
            });
          }}
        >
          <p>
            {tr("Código para ")}
            {status.pending.email} {tr(" · válido por 10 minutos.")}
          </p>
          {status.mode === "resend" && status.pending.deliveryStatus && (
            <p role="status">
              {tr("Estado del correo:")}{" "}
              {tr(
                {
                  queued: "En cola",
                  skipped: "Omitido",
                  cancelled: "Cancelado",
                  sent: "Enviado",
                  delivered: "Entregado",
                  delivery_delayed: "Entrega demorada",
                  bounced: "No se pudo entregar",
                  complained: "Bloqueado por queja",
                  suppressed: "Correo bloqueado",
                  failed: "Falló el envío",
                  development: "Buzón de desarrollo",
                }[status.pending.deliveryStatus],
              )}
              .
            </p>
          )}
          <label>
            {tr("Código de 6 dígitos")}
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <Button disabled={busy || status.pending.attempts >= 5} type="submit">
            {tr("Verificar correo")}
          </Button>
          {status.pending.delivery === "failed" && (
            <p role="alert">
              {tr(
                "No pudimos enviar el correo. Solicita otro código en un minuto.",
              )}
            </p>
          )}
          {status.mode === "development" && (
            <details className="development-mailbox">
              <summary>{tr("Buzón local de desarrollo")}</summary>
              <p>{tr("En este entorno no se envían correos reales.")}</p>
              <output>
                {status.pending.developmentCode ?? tr("Preparando código…")}
              </output>
            </details>
          )}
        </form>
      )}
      <p role="status">{tr(message)}</p>
    </div>
  );
}
