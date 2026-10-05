import { useI18n } from "../../i18n/I18n";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { Field, Answers } from "../../../convex/lib/formEngine";
import { shown } from "../../../convex/lib/formEngine";
import type { Id } from "../../../convex/_generated/dataModel";
import { useWalletAuth } from "../auth/AuthProvider";
import { convexSiteUrl } from "../../lib/backend";
export function FormFields({
  fields,
  answers,
  onChange,
  eventId,
  formId,
  preview = false,
  onUploading,
  upload,
}: {
  fields: Field[];
  answers: Answers;
  onChange: Dispatch<SetStateAction<Answers>>;
  eventId: Id<"events">;
  formId?: Id<"forms">;
  preview?: boolean;
  onUploading?: (fieldId: string, busy: boolean) => void;
  upload?: (file: File, field: Field) => Promise<string>;
}) {
  const { t: tr } = useI18n();

  const visible = new Set<string>();
  return (
    <div className="registration-fields">
      {fields.map((f) => {
        if (!shown(f, answers, visible)) return null;
        visible.add(f.id);
        if (f.type === "section_header")
          return (
            <div className="form-section" key={f.id}>
              <h3>{f.label}</h3>
              {f.help && <p>{f.help}</p>}
            </div>
          );
        const value = answers[f.id],
          set = (value: Answers[string]) =>
            onChange((previous) => ({ ...previous, [f.id]: value }));
        const label = `${f.label}${f.required ? " *" : ""}`,
          helpId = `help-${f.id}`;
        const inputProps = {
          "aria-label": f.label,
          "aria-describedby": f.help ? helpId : undefined,
          required: f.required,
          placeholder: f.placeholder,
        };
        return (
          <div className="form-field" key={f.id}>
            <label htmlFor={`field-${f.id}`}>{label}</label>
            {f.type === "long_text" ? (
              <textarea
                id={`field-${f.id}`}
                {...inputProps}
                rows={5}
                maxLength={f.validation?.max ?? 10000}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(e.target.value)}
              />
            ) : f.type === "checkbox" ? (
              <label className="checkbox-row">
                <input
                  id={`field-${f.id}`}
                  type="checkbox"
                  {...inputProps}
                  checked={value === true}
                  onChange={(e) => set(e.target.checked)}
                />
                {f.placeholder || tr("Sí")}
              </label>
            ) : f.type === "select" ? (
              <select
                id={`field-${f.id}`}
                {...inputProps}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">{tr("Selecciona una opción")}</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "multi_select" ? (
              <div role="group" aria-label={f.label}>
                {f.options?.map((o) => (
                  <label className="checkbox-row" key={o.value}>
                    <input
                      type="checkbox"
                      checked={Array.isArray(value) && value.includes(o.value)}
                      onChange={(e) =>
                        set(
                          e.target.checked
                            ? [...(Array.isArray(value) ? value : []), o.value]
                            : (Array.isArray(value) ? value : []).filter(
                                (v) => v !== o.value,
                              ),
                        )
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            ) : f.type === "file" ? (
              <RegistrationFile
                eventId={eventId}
                formId={formId}
                field={f}
                value={typeof value === "string" ? value : undefined}
                onChange={set}
                preview={preview}
                upload={upload ? (file) => upload(file, f) : undefined}
                onUploading={(busy) => onUploading?.(f.id, busy)}
              />
            ) : (
              <input
                id={`field-${f.id}`}
                {...inputProps}
                type={
                  f.type === "number"
                    ? "number"
                    : f.type === "date"
                      ? "date"
                      : f.type === "email"
                        ? "email"
                        : ["url", "github_url"].includes(f.type)
                          ? "url"
                          : f.type === "phone"
                            ? "tel"
                            : "text"
                }
                step={f.type === "number" ? "any" : undefined}
                min={f.type === "number" ? f.validation?.min : undefined}
                max={f.type === "number" ? f.validation?.max : undefined}
                maxLength={
                  f.type === "number" ? undefined : (f.validation?.max ?? 2000)
                }
                value={
                  typeof value === "number" || typeof value === "string"
                    ? value
                    : ""
                }
                onChange={(e) =>
                  set(
                    f.type === "number"
                      ? e.target.value === ""
                        ? null
                        : Number(e.target.value)
                      : f.type === "country"
                        ? e.target.value.toUpperCase()
                        : e.target.value,
                  )
                }
              />
            )}
            {f.type === "country" && (
              <small>
                {tr("Usa el código del país de dos letras: PE, CO, MX…")}
              </small>
            )}
            {f.help && <small id={helpId}>{f.help}</small>}
          </div>
        );
      })}
    </div>
  );
}
function RegistrationFile({
  eventId,
  formId,
  field,
  value,
  onChange,
  preview,
  onUploading,
  upload,
}: {
  eventId: Id<"events">;
  formId?: Id<"forms">;
  field: Field;
  value?: string;
  onChange: (id: string) => void;
  preview: boolean;
  onUploading?: (busy: boolean) => void;
  upload?: (file: File) => Promise<string>;
}) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <div>
      <input
        aria-label={field.label}
        type="file"
        disabled={preview || busy || (!formId && !upload)}
        accept={
          field.validation?.accept ??
          "application/pdf,text/plain,application/zip,image/png,image/jpeg,image/webp"
        }
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || (!formId && !upload)) return;
          onChange("");
          setBusy(true);
          onUploading?.(true);
          setMessage("");
          try {
            if (file.size > (field.validation?.maxFileMB ?? 5) * 1024 * 1024)
              throw new Error("El archivo supera el tamaño permitido.");
            if (upload) {
              onChange(await upload(file));
              setMessage(`Archivo preparado: ${file.name}`);
              return;
            }
            const token = await auth.fetchAccessToken({
              forceRefreshToken: false,
            });
            if (!token) throw new Error("Vuelve a conectar tu wallet.");
            const response = await fetch(
              `${convexSiteUrl}/registration-upload?eventId=${eventId}&formId=${formId}&fieldId=${encodeURIComponent(field.id)}`,
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
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            onChange(data.fileId);
            setMessage(`Archivo preparado: ${file.name}`);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "No se pudo cargar.");
          } finally {
            setBusy(false);
            onUploading?.(false);
          }
        }}
      />
      {value && !busy && (
        <button
          type="button"
          className="text-link"
          onClick={() => {
            onChange("");
            setMessage("");
          }}
        >
          {tr("Quitar archivo")}
        </button>
      )}
      <small>
        {tr("Hasta ")}
        {field.validation?.maxFileMB ?? 5}{" "}
        {tr(" MB. Los archivos son privados.")}
      </small>
      {busy && <p role="status">{tr("Subiendo archivo…")}</p>}
      {(message || value) && (
        <p role="status">
          {message.startsWith("Archivo preparado: ")
            ? tr("Archivo preparado: {0}", {
                "0": message.slice("Archivo preparado: ".length),
              })
            : tr(message || "Archivo preparado.")}
        </p>
      )}
    </div>
  );
}
