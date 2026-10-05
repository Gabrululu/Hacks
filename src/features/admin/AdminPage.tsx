import { useI18n, formatLocale } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { SessionGate, ApplicationsPanel } from "../manage/ManagePage";
import { Button } from "../../components/ui/button";
import type { Id } from "../../../convex/_generated/dataModel";
export function AdminPage({ onConnect }: { onConnect: () => void }) {
  const { t: tr } = useI18n();

  return (
    <SessionGate onConnect={onConnect}>
      {(me) =>
        me.platformRole === "superadmin" ? (
          <Dashboard />
        ) : (
          <section className="simple-page">
            <h1>{tr("Acceso restringido")}</h1>
            <Link to="/manage">{tr("Volver a mi panel")}</Link>
          </section>
        )
      }
    </SessionGate>
  );
}
function Dashboard() {
  const { t: tr } = useI18n();

  const [tab, setTab] = useState("Resumen");
  return (
    <section className="simple-page manage-page">
      <Link to="/manage">{tr("← Mi panel")}</Link>
      <div className="eyebrow">{tr("ADMINISTRACIÓN GLOBAL")}</div>
      <h1>{tr("La comunidad, en perspectiva.")}</h1>
      <div className="tabs">
        {["Resumen", "Eventos", "Usuarios", "Solicitudes", "Auditoría"].map(
          (t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {tr(t)}
            </button>
          ),
        )}
      </div>
      {tab === "Resumen" ? (
        <Metrics />
      ) : tab === "Eventos" ? (
        <Events />
      ) : tab === "Usuarios" ? (
        <Users />
      ) : tab === "Solicitudes" ? (
        <ApplicationsPanel />
      ) : (
        <Audit />
      )}
    </section>
  );
}
function Metrics() {
  const { t: tr } = useI18n();

  const totals = useQuery(api.adminMetrics.totals, {});
  const backfill = useMutation(api.adminMetrics.backfill);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        for (const table of [
          "events",
          "registrations",
          "submissions",
          "emailDeliveries",
        ] as const) {
          let cursor: string | null = null;
          do {
            if (!active) return;
            const page: { cursor: string; done: boolean } = await backfill({
              table,
              cursor,
            });
            if (page.done) break;
            cursor = page.cursor;
          } while (active);
        }
        if (active) setReady(true);
      } catch {
        if (active)
          setError(
            "No se pudieron actualizar las métricas. Vuelve a abrir el resumen.",
          );
      }
    })();
    return () => {
      active = false;
    };
  }, [backfill]);
  return (
    <>
      <p>
        {tr(
          "Totales actuales de la plataforma. Los correos de desarrollo no cuentan como enviados.",
        )}
      </p>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="admin-metrics">
        {[
          ["Eventos", totals?.events],
          ["Inscripciones", totals?.registrations],
          ["Proyectos", totals?.projects],
          ["Correos enviados", totals?.emails],
        ].map(([label, value]) => (
          <article key={tr(String(label))}>
            <span>{tr(String(label))}</span>
            <strong>{ready ? (value ?? "…") : "…"}</strong>
          </article>
        ))}
      </div>
      {!ready && !error && <p>{tr("Inicializando métricas…")}</p>}
    </>
  );
}
function More({ status, load }: { status: string; load: (n: number) => void }) {
  const { t: tr } = useI18n();

  return status === "CanLoadMore" ? (
    <Button onClick={() => load(20)}>{tr("Cargar más")}</Button>
  ) : status === "LoadingFirstPage" || status === "LoadingMore" ? (
    <p>{tr("Cargando…")}</p>
  ) : null;
}
function Events() {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.manage.all,
    {},
    { initialNumItems: 20 },
  );
  const enter = useMutation(api.admin.enterEvent);
  const suspend = useMutation(api.admin.suspendEvent);
  const [target, setTarget] = useState<Id<"events"> | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      <p>
        {tr(
          "Entrar a un evento registra tu acceso como superadmin en la auditoría.",
        )}
      </p>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="admin-list">
        {results.map((e) => (
          <article key={e.id}>
            <div>
              <h3>{e.name}</h3>
              <span>
                {e.status === "suspended"
                  ? tr("Suspendido")
                  : e.status === "published"
                    ? tr("Publicado")
                    : e.status === "archived"
                      ? tr("Archivado")
                      : tr("Borrador")}
              </span>
            </div>
            <div className="admin-actions">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    navigate(`/e/${await enter({ eventId: e.id })}/manage`);
                  } catch {
                    setError("No se pudo abrir el evento.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {tr("Entrar al evento")}
              </Button>
              <Button
                className="button-secondary"
                onClick={() => {
                  setTarget(e.id);
                  setReason("");
                }}
              >
                {e.status === "suspended" ? tr("Restaurar") : tr("Suspender")}
              </Button>
            </div>
            {target === e.id && (
              <form
                onSubmit={async (ev) => {
                  ev.preventDefault();
                  setBusy(true);
                  try {
                    await suspend({
                      eventId: e.id,
                      suspended: e.status !== "suspended",
                      reason,
                    });
                    setTarget(null);
                  } catch {
                    setError("No se pudo cambiar la suspensión.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {tr("Motivo")}
                  <textarea
                    required
                    minLength={3}
                    maxLength={1000}
                    value={reason}
                    onChange={(ev) => setReason(ev.target.value)}
                  />
                </label>
                <Button disabled={busy}>
                  {tr("Confirmar")}{" "}
                  {e.status === "suspended"
                    ? tr("restauración")
                    : tr("suspensión")}
                </Button>
                <Button
                  type="button"
                  className="button-secondary"
                  onClick={() => setTarget(null)}
                >
                  {tr("Cancelar")}
                </Button>
              </form>
            )}
          </article>
        ))}
      </div>
      <More status={status} load={loadMore} />
    </>
  );
}
function Users() {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.users,
    {},
    { initialNumItems: 20 },
  );
  const suspend = useMutation(api.admin.suspendUser);
  const quota = useMutation(api.admin.setEventLimit);
  const [target, setTarget] = useState<Id<"users"> | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      {error && <p role="alert">{tr(error)}</p>}
      <div className="admin-list">
        {results.map((u) => (
          <article key={u.id}>
            <h3>{u.name}</h3>
            <p className="admin-wallet">{u.wallet}</p>
            <p>
              {tr(
                {
                  user: "Usuario",
                  organizer: "Organizador",
                  superadmin: "Superadmin",
                }[u.role] ?? u.role,
              )}{" "}
              · {u.suspended ? tr("Suspendido") : tr("Activo")}
            </p>
            {u.role === "organizer" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    const data = new FormData(e.currentTarget);
                    await quota({
                      userId: u.id,
                      limit: Number(data.get("limit")),
                    });
                  } catch {
                    setError("No se pudo actualizar la cuota.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {tr("Eventos activos permitidos")}
                  <input
                    name="limit"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={u.eventLimit}
                    required
                  />
                </label>
                <Button disabled={busy}>{tr("Guardar cuota")}</Button>
              </form>
            )}
            {u.role !== "superadmin" && (
              <Button
                className="button-secondary"
                onClick={() => {
                  setTarget(u.id);
                  setReason("");
                }}
              >
                {u.suspended
                  ? tr("Restaurar usuario")
                  : tr("Suspender usuario")}
              </Button>
            )}
            {target === u.id && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await suspend({
                      userId: u.id,
                      suspended: !u.suspended,
                      reason,
                    });
                    setTarget(null);
                  } catch {
                    setError("No se pudo cambiar la suspensión.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  {tr("Motivo")}
                  <textarea
                    minLength={3}
                    maxLength={1000}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <Button disabled={busy}>{tr("Confirmar cambio")}</Button>
                <Button
                  type="button"
                  className="button-secondary"
                  onClick={() => setTarget(null)}
                >
                  {tr("Cancelar")}
                </Button>
              </form>
            )}
          </article>
        ))}
      </div>
      <More status={status} load={loadMore} />
    </>
  );
}
const AUDIT_LABELS: Record<string, string> = {
  "admin.user.suspend": "Usuario suspendido",
  "admin.user.restore": "Usuario restaurado",
  "admin.user.quota": "Cuota de eventos actualizada",
  "admin.event.suspend": "Evento suspendido",
  "admin.event.restore": "Evento restaurado",
  "admin.event.enter": "Acceso del superadmin al evento",
  "admin.event.emailQuota": "Cuota mensual de correo actualizada",
  "organizer.approved": "Organizador aprobado",
  "organizer.rejected": "Solicitud de organizador rechazada",
  "event.create": "Evento creado",
  "event.update": "Configuración del evento actualizada",
  "event.status": "Estado del evento actualizado",
};
function Audit() {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.audit,
    {},
    { initialNumItems: 20 },
  );
  return (
    <>
      <div className="admin-list">
        {results.map((row) => (
          <article key={row.id}>
            <strong>{tr(AUDIT_LABELS[row.action] ?? row.action)}</strong>
            <p>
              {row.actor} · {new Date(row.at).toLocaleString(formatLocale())}
            </p>
            {row.targetUser && (
              <p>
                {tr("Usuario: ")}
                {row.targetUser}
              </p>
            )}
            {row.event && <p>{row.event}</p>}
            {row.reason && (
              <p>
                {tr("Motivo: ")}
                {row.reason}
              </p>
            )}
          </article>
        ))}
      </div>
      {!results.length && status === "Exhausted" && (
        <p>{tr("Aún no hay actividad registrada.")}</p>
      )}
      <More status={status} load={loadMore} />
    </>
  );
}
