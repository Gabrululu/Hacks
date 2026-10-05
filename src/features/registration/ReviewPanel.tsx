import { useI18n, formatLocale } from "../../i18n/I18n";
import type { FunctionReturnType } from "convex/server";
import { useState, useRef, useEffect } from "react";
import {
  usePaginatedQuery,
  useMutation,
  useAction,
  useConvex,
} from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "../../components/ui/button";
import {
  STATUS,
  Responses,
  useRegistrationOperation,
  type Registration,
} from "./shared";
import { registrationsCsv } from "./csv";
export function ReviewPanel({
  eventId,
  permissions,
}: {
  eventId: Id<"events">;
  permissions: string[];
}) {
  const { t: tr } = useI18n();

  const [filter, setFilter] = useState<Registration["status"] | "">(""),
    [selected, setSelected] = useState<Id<"registrations">[]>([]),
    { results, status, loadMore } = usePaginatedQuery(
      api.registrations.list,
      { eventId, ...(filter ? { status: filter } : {}) },
      { initialNumItems: 20 },
    ),
    review = useMutation(api.registrations.review),
    client = useConvex(),
    op = useRegistrationOperation();
  const canReview = permissions.includes("registrations.review"),
    canExport = permissions.includes("registrations.export");
  return (
    <div className="profile-panel">
      <div className="manage-title">
        <div>
          <h2>{tr("Participantes")}</h2>
          <p>
            {tr("Revisa solicitudes y confirma la asistencia de tu comunidad.")}
          </p>
        </div>
        {canExport && (
          <Button
            className="manage-outline"
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                const rows: Registration[] = [];
                let cursor: string | null = null;
                do {
                  const page: FunctionReturnType<
                    typeof api.registrations.exportPage
                  > = await client.query(api.registrations.exportPage, {
                    eventId,
                    ...(filter ? { status: filter } : {}),
                    paginationOpts: { numItems: 100, cursor },
                  });
                  rows.push(...page.page);
                  cursor = page.isDone ? null : page.continueCursor;
                } while (cursor);
                const url = URL.createObjectURL(
                    new Blob([registrationsCsv(rows)], {
                      type: "text/csv;charset=utf-8",
                    }),
                  ),
                  a = document.createElement("a");
                a.href = url;
                a.download = `participantes-${filter || "todos"}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }, "CSV exportado con los campos que puedes consultar.")
            }
          >
            {tr("Exportar CSV")}
          </Button>
        )}
      </div>
      <label>
        {tr("Estado de inscripción")}
        <select
          aria-label={tr("Estado de inscripción")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as typeof filter);
            setSelected([]);
          }}
        >
          <option value="">{tr("Todos los estados")}</option>
          {Object.entries(STATUS).map(([key, label]) => (
            <option key={key} value={key}>
              {tr(String(label))}
            </option>
          ))}
        </select>
      </label>
      {canReview && (
        <div className="review-actions">
          <span>
            {selected.length} {tr(" seleccionados · máximo 50")}
          </span>
          {(["approved", "rejected", "waitlisted"] as const).map((state) => (
            <Button
              key={state}
              className="manage-outline"
              disabled={!selected.length || op.busy}
              onClick={() =>
                void op.run(async () => {
                  await review({ eventId, ids: selected, status: state });
                  setSelected([]);
                }, "Selección actualizada. Los participantes recibirán el aviso de su nuevo estado.")
              }
            >
              {state === "approved"
                ? tr("Aprobar selección")
                : state === "rejected"
                  ? tr("Rechazar selección")
                  : tr("Pasar a lista de espera")}
            </Button>
          ))}
        </div>
      )}
      {op.message && <p role="status">{tr(op.message)}</p>}
      <div className="registration-list">
        {results.map((r) => (
          <article className="registration-row" key={r.id}>
            <div className="registration-row-header">
              {canReview && !["checked_in", "withdrawn"].includes(r.status) && (
                <input
                  type="checkbox"
                  aria-label={tr("Seleccionar {0}", { "0": r.name })}
                  checked={selected.includes(r.id)}
                  disabled={!selected.includes(r.id) && selected.length >= 50}
                  onChange={(e) =>
                    setSelected((old) =>
                      e.target.checked
                        ? [...old, r.id]
                        : old.filter((id) => id !== r.id),
                    )
                  }
                />
              )}
              <div>
                <h3>{r.name}</h3>
                <p>{r.email}</p>
              </div>
              <span className={`manage-badge status-${r.status}`}>
                {tr(STATUS[r.status])}
              </span>
            </div>
            <details>
              <summary>
                {tr("Ver inscripción · formulario v")}
                {r.formVersion}
              </summary>
              <p className="wallet-address">{r.wallet}</p>
              <Responses registration={r} />
              <p>
                {tr("Consentimiento: ")}
                {new Date(r.consentAt).toLocaleString(formatLocale())}
              </p>
              {r.checkedInAt && (
                <p>
                  {tr("Check-in: ")}
                  {new Date(r.checkedInAt).toLocaleString(formatLocale())}
                </p>
              )}
            </details>
          </article>
        ))}
      </div>
      {!results.length && status !== "LoadingFirstPage" && (
        <p>{tr("No hay inscripciones con este estado.")}</p>
      )}
      {status === "LoadingFirstPage" && <p>{tr("Cargando participantes…")}</p>}
      {status !== "Exhausted" && status !== "LoadingFirstPage" && (
        <Button
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {tr("Cargar más participantes")}
        </Button>
      )}
      {canReview && <CheckIn eventId={eventId} />}
    </div>
  );
}
function CheckIn({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const [token, setToken] = useState(""),
    [camera, setCamera] = useState(false),
    checkIn = useAction(api.hackerPass.checkIn),
    op = useRegistrationOperation();
  const submit = async (value: string) => {
    setToken(value);
    setCamera(false);
    await op.run(async () => {
      const result = await checkIn({ eventId, token: value.trim() });
      if (result === "already_checked_in") return;
    }, "Pase válido. Check-in confirmado; si ya estaba registrado, se conserva el check-in original.");
  };
  return (
    <section className="check-in-panel">
      <div className="eyebrow">{tr("ASISTENCIA")}</div>
      <h2>{tr("Check-in con Hacker Pass")}</h2>
      <p>
        {tr(
          "El pase debe corresponder a este evento y a una inscripción aprobada. El check-in abre al inicio del evento.",
        )}
      </p>
      <div className="manage-actions">
        <Button disabled={op.busy} onClick={() => setCamera((v) => !v)}>
          {camera ? tr("Cerrar cámara") : tr("Escanear QR con cámara")}
        </Button>
        <label className="qr-upload">
          {tr("Leer imagen de un QR")}
          <input
            type="file"
            aria-label={tr("Imagen del QR")}
            accept="image/*"
            disabled={op.busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await op.run(async () => {
                const [{ BrowserQRCodeReader }, { DecodeHintType }] =
                  await Promise.all([
                    import("@zxing/browser"),
                    import("@zxing/library"),
                  ]);
                const url = URL.createObjectURL(file);
                try {
                  let token: string;
                  try {
                    token = (
                      await new BrowserQRCodeReader(
                        new Map([[DecodeHintType.TRY_HARDER, true]]),
                      ).decodeFromImageUrl(url)
                    ).getText();
                  } catch {
                    try {
                      token = (
                        await new BrowserQRCodeReader(
                          new Map([[DecodeHintType.PURE_BARCODE, true]]),
                        ).decodeFromImageUrl(url)
                      ).getText();
                    } catch {
                      throw Error("QR_IMAGE_UNREADABLE");
                    }
                  }
                  await checkIn({ eventId, token: token.trim() });
                } finally {
                  URL.revokeObjectURL(url);
                }
              }, "QR válido. Check-in confirmado.");
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {camera && <Camera onResult={(value) => void submit(value)} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(token);
        }}
      >
        <label>
          {tr("Código del pase")}
          <textarea
            aria-label={tr("Código para check-in")}
            rows={3}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={tr("Pega el código firmado del Hacker Pass")}
            maxLength={4096}
            required
          />
        </label>
        <Button disabled={op.busy || !token.trim()} type="submit">
          {tr("Confirmar check-in")}
        </Button>
      </form>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </section>
  );
}
function Camera({ onResult }: { onResult: (value: string) => void }) {
  const { t: tr } = useI18n();

  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onResult),
    [error, setError] = useState("");
  callback.current = onResult;
  useEffect(() => {
    let cancelled = false,
      done = false;
    let controls: { stop: () => void } | undefined;
    void (async () => {
      try {
        const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all(
          [import("@zxing/browser"), import("@zxing/library")],
        );
        if (cancelled || !video.current) return;
        controls = await new BrowserQRCodeReader(
          new Map([[DecodeHintType.TRY_HARDER, true]]),
        ).decodeFromVideoDevice(
          undefined,
          video.current,
          (result, _error, control) => {
            if (result && !done && !cancelled) {
              done = true;
              control.stop();
              callback.current(result.getText());
            }
          },
        );
        if (cancelled) controls.stop();
      } catch {
        if (!cancelled)
          setError(
            "No se pudo abrir la cámara. Permite su acceso o carga una imagen del QR.",
          );
      }
    })();
    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);
  return (
    <div className="qr-camera">
      <video ref={video} muted playsInline />
      {error && <p role="status">{tr(error)}</p>}
    </div>
  );
}
