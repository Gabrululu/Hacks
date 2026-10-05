import { useI18n } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import { useWalletAuth } from "../auth/AuthProvider";
import { convexSiteUrl } from "../../lib/backend";
import { useRegistrationOperation } from "../registration/shared";
import type { Field, Answers } from "../../../convex/lib/formEngine";
export { useRegistrationOperation as useProjectOperation };
export const PROJECT_STATUS = {
  draft: "Borrador",
  submitted: "Entregado",
  admitted: "Admitido",
  disqualified: "Descalificado",
};
export const CHECKPOINT_STATUS = {
  submitted: "En revisión",
  accepted: "Aceptado",
  rejected: "Rechazado",
};
export function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function useProjectUpload() {
  const auth = useWalletAuth();
  return async (query: Record<string, string>, file: File) => {
    const token = await auth.fetchAccessToken({ forceRefreshToken: false });
    if (!token) throw Error("FORBIDDEN");
    const response = await fetch(
      `${convexSiteUrl}/project-upload?${new URLSearchParams(query)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
        body: file,
      },
    );
    if (!response.ok) throw Error("INVALID_FILE");
    const data = await response.json();
    return data.fileId as string;
  };
}
export function ProjectAnswers({
  fields,
  answers,
  source,
}: {
  fields: Field[];
  answers: Answers;
  source: Record<string, string>;
}) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth(),
    op = useRegistrationOperation();
  return (
    <>
      <dl className="registration-answers">
        {fields
          .filter((f) => Object.hasOwn(answers, f.id))
          .map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>
                {f.type === "file" ? (
                  <button
                    className="text-link"
                    disabled={op.busy}
                    onClick={() =>
                      void op.run(async () => {
                        const token = await auth.fetchAccessToken({
                          forceRefreshToken: false,
                        });
                        if (!token) throw Error("FORBIDDEN");
                        const response = await fetch(
                          `${convexSiteUrl}/project-file?${new URLSearchParams({ ...source, fieldId: f.id })}`,
                          { headers: { Authorization: `Bearer ${token}` } },
                        );
                        if (!response.ok) throw Error("FORBIDDEN");
                        const url = URL.createObjectURL(await response.blob()),
                          link = document.createElement("a");
                        link.href = url;
                        const encoded = /filename\*=UTF-8''([^;]+)/i.exec(
                          response.headers.get("Content-Disposition") ?? "",
                        )?.[1];
                        link.download = encoded
                          ? decodeURIComponent(encoded)
                          : "archivo-proyecto";
                        link.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }, "Archivo descargado.")
                    }
                  >
                    {tr("Descargar archivo privado")}
                  </button>
                ) : Array.isArray(answers[f.id]) ? (
                  (answers[f.id] as string[]).join(", ")
                ) : typeof answers[f.id] === "boolean" ? (
                  answers[f.id] ? (
                    "Sí"
                  ) : (
                    "No"
                  )
                ) : (
                  String(answers[f.id] ?? "—")
                )}
              </dd>
            </div>
          ))}
      </dl>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </>
  );
}
export function PrivateImage({
  id,
  source,
}: {
  id: string;
  source: Record<string, string>;
}) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth(),
    [url, setUrl] = useState("");
  const scope = new URLSearchParams({ ...source, imageId: id }).toString();
  useEffect(() => {
    let cancelled = false,
      objectUrl = "";
    void (async () => {
      try {
        const token = await auth.fetchAccessToken({ forceRefreshToken: false });
        if (!token) return;
        const response = await fetch(`${convexSiteUrl}/project-file?${scope}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) URL.revokeObjectURL(objectUrl);
        else setUrl(objectUrl);
      } catch {
        /* Keep the private image unavailable. */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scope, auth.fetchAccessToken]);
  return url ? (
    <img className="project-image" src={url} alt={tr("Imagen del proyecto")} />
  ) : (
    <span>{tr("Preparando imagen privada…")}</span>
  );
}
