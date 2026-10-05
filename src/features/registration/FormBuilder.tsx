import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { Field, Answers } from "../../../convex/lib/formEngine";
import {
  FIELD_TYPES,
  DEFAULT_CONSENT,
  DEFAULT_RULES,
  FILE_TYPES,
} from "../../../convex/lib/formEngine";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
import { ContentNotice, useContentOperation } from "../content/DesignEditor";
import { FormFields } from "./FormFields";
export function FormBuilder({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const [kind, setKind] = useState<Doc<"forms">["kind"]>("registration");
  const versions = useQuery(api.forms.editor, { eventId, kind });
  return (
    <div>
      <label>
        {tr("Tipo de formulario")}
        <select
          aria-label={tr("Tipo de formulario")}
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
        >
          {Object.entries({
            registration: "Registro",
            submission: "Entrega de proyecto",
            checkpoint: "Checkpoint",
            feedback: "Feedback",
          }).map(([k, l]) => (
            <option key={k} value={k}>
              {tr(l)}
            </option>
          ))}
        </select>
      </label>
      {versions ? (
        <Builder
          key={kind}
          eventId={eventId}
          kind={kind}
          current={versions[0]}
          versions={versions}
        />
      ) : (
        <p>{tr("Cargando formulario…")}</p>
      )}
    </div>
  );
}
function Builder({
  eventId,
  kind,
  current,
  versions,
}: {
  eventId: Id<"events">;
  kind: Doc<"forms">["kind"];
  current?: Doc<"forms">;
  versions: Doc<"forms">[];
}) {
  const { t: tr } = useI18n();

  const [fields, setFields] = useState<Field[]>(current?.fields ?? []),
    [revision, setRevision] = useState(current?.revision ?? 0),
    [consent, setConsent] = useState(current?.consentText ?? DEFAULT_CONSENT),
    [rules, setRules] = useState(current?.rulesText ?? DEFAULT_RULES),
    [type, setType] = useState("short_text"),
    [answers, setAnswers] = useState<Answers>({});
  const save = useMutation(api.forms.save),
    publish = useMutation(api.forms.publish),
    op = useContentOperation();
  const dirty =
    canonical(fields) !== canonical(current?.fields ?? []) ||
    consent !== (current?.consentText ?? DEFAULT_CONSENT) ||
    rules !== (current?.rulesText ?? DEFAULT_RULES);
  const change = (id: string, patch: Partial<Field>) =>
    setFields((old) => old.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  return (
    <div className="design-workspace">
      <div className="profile-panel content-editor">
        <h2>
          {tr("Formulario de ")}
          {kind === "registration" ? tr("registro") : kind}
        </h2>
        <p>
          {current
            ? tr("Versión {0} · {1}", {
                "0": current.version,
                "1": current.publishedAt
                  ? "Publicada. Guardar cambios creará un nuevo borrador."
                  : "Borrador",
              })
            : tr("Nuevo formulario")}
        </p>
        <p className="manage-caption">
          {tr(
            "Wallet, nombre y correo verificado provienen del perfil. La aceptación de reglas y el consentimiento son obligatorios y no se pueden eliminar.",
          )}
        </p>
        {fields.map((f, index) => (
          <article className="form-editor-field" key={f.id}>
            <div className="block-row-heading">
              <h3>{tr(FIELD_TYPES[f.type])}</h3>
              <div className="block-row-actions">
                <button
                  aria-label={tr("Subir campo {0}", { "0": f.label })}
                  disabled={index === 0}
                  onClick={() =>
                    setFields((old) => {
                      const a = [...old];
                      [a[index - 1], a[index]] = [a[index], a[index - 1]];
                      return a;
                    })
                  }
                >
                  ↑
                </button>
                <button
                  aria-label={tr("Bajar {0}", { "0": f.label })}
                  disabled={index === fields.length - 1}
                  onClick={() =>
                    setFields((old) => {
                      const a = [...old];
                      [a[index + 1], a[index]] = [a[index], a[index + 1]];
                      return a;
                    })
                  }
                >
                  ↓
                </button>
                <button
                  aria-label={tr("Eliminar {0}", { "0": f.label })}
                  onClick={() =>
                    setFields((old) => old.filter((x) => x.id !== f.id))
                  }
                >
                  ×
                </button>
              </div>
            </div>
            <label>
              {tr("Etiqueta")}
              <input
                aria-label={tr("Etiqueta del campo")}
                maxLength={160}
                value={f.label}
                onChange={(e) => change(f.id, { label: e.target.value })}
              />
            </label>
            <label>
              {tr("Ayuda")}
              <textarea
                aria-label={tr("Ayuda del campo")}
                maxLength={1000}
                rows={2}
                value={f.help ?? ""}
                onChange={(e) => change(f.id, { help: e.target.value })}
              />
            </label>
            <label>
              {tr("Ejemplo")}
              <input
                aria-label={tr("Ejemplo del campo")}
                value={f.placeholder ?? ""}
                maxLength={200}
                onChange={(e) => change(f.id, { placeholder: e.target.value })}
              />
            </label>
            {f.type !== "section_header" && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => change(f.id, { required: e.target.checked })}
                />
                {tr("Obligatorio")}
              </label>
            )}
            <label>
              {tr("Acceso del staff")}
              <select
                aria-label={tr("Acceso del staff")}
                value={f.staffVisibility ?? "reviewers"}
                onChange={(e) =>
                  change(f.id, {
                    staffVisibility: e.target.value as Field["staffVisibility"],
                  })
                }
              >
                <option value="reviewers">
                  {tr("Reviewers y organizadores")}
                </option>
                <option value="organizers">{tr("Solo organizadores")}</option>
              </select>
            </label>
            {["select", "multi_select"].includes(f.type) && (
              <label>
                {tr("Opciones (valor | etiqueta, una por línea)")}
                <textarea
                  aria-label={tr("Opciones del campo")}
                  rows={4}
                  value={
                    f.options
                      ?.map((o) => `${o.value} | ${o.label}`)
                      .join("\n") ?? ""
                  }
                  onChange={(e) =>
                    change(f.id, {
                      options: e.target.value
                        .split("\n")
                        .filter(Boolean)
                        .map((line) => {
                          const [v, ...label] = line.split("|");
                          return {
                            value: v.trim(),
                            label: label.join("|").trim() || v.trim(),
                          };
                        }),
                    })
                  }
                />
              </label>
            )}
            {![
              "section_header",
              "file",
              "checkbox",
              "select",
              "multi_select",
            ].includes(f.type) && (
              <div className="form-limit-grid">
                {(["min", "max"] as const).map((key) => (
                  <label key={key}>
                    {key === "min" ? tr("Mínimo") : tr("Máximo")}
                    <input
                      type="number"
                      aria-label={tr("{0} del campo", {
                        "0": tr(key === "min" ? "Mínimo" : "Máximo"),
                      })}
                      value={f.validation?.[key] ?? ""}
                      onChange={(e) =>
                        change(f.id, {
                          validation: {
                            ...f.validation,
                            [key]: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          },
                        })
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            {f.type === "file" && (
              <>
                <label>
                  {tr("Tamaño máximo (MB)")}
                  <input
                    aria-label={tr("Tamaño máximo del archivo")}
                    type="number"
                    min={1}
                    max={10}
                    value={f.validation?.maxFileMB ?? 5}
                    onChange={(e) =>
                      change(f.id, {
                        validation: {
                          ...f.validation,
                          maxFileMB: Number(e.target.value),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  {tr("Formatos permitidos")}
                  <textarea
                    aria-label={tr("Formatos permitidos")}
                    rows={2}
                    value={f.validation?.accept ?? FILE_TYPES.join(",")}
                    onChange={(e) =>
                      change(f.id, {
                        validation: { ...f.validation, accept: e.target.value },
                      })
                    }
                  />
                </label>
              </>
            )}
            {["short_text", "long_text", "phone"].includes(f.type) && (
              <label>
                {tr("Patrón de validación opcional")}
                <input
                  aria-label={tr("Patrón del campo")}
                  value={f.validation?.pattern ?? ""}
                  onChange={(e) =>
                    change(f.id, {
                      validation: {
                        ...f.validation,
                        pattern: e.target.value || undefined,
                      },
                    })
                  }
                />
                <small>
                  {tr(
                    "Usa una clase de caracteres anclada, por ejemplo ^[A-Z]+$.",
                  )}
                </small>
              </label>
            )}
            <label>
              {tr("Mostrar si")}
              <select
                aria-label={tr("Campo condicional")}
                value={f.showIf?.fieldId ?? ""}
                onChange={(e) => {
                  const source = fields.find((x) => x.id === e.target.value);
                  change(f.id, {
                    showIf: source
                      ? {
                          fieldId: source.id,
                          equals:
                            source.type === "checkbox"
                              ? true
                              : source.type === "number"
                                ? 0
                                : source.type === "multi_select"
                                  ? []
                                  : "",
                        }
                      : undefined,
                  });
                }}
              >
                <option value="">{tr("Siempre visible")}</option>
                {fields
                  .slice(0, index)
                  .filter((x) => !["file", "section_header"].includes(x.type))
                  .map((x) => (
                    <option value={x.id} key={x.id}>
                      {x.label}
                    </option>
                  ))}
              </select>
            </label>
            {f.showIf && (
              <label>
                {tr("Valor esperado")}
                <input
                  aria-label={tr("Valor de la condición")}
                  value={
                    Array.isArray(f.showIf.equals)
                      ? f.showIf.equals.join(",")
                      : String(f.showIf.equals ?? "")
                  }
                  onChange={(e) => {
                    const source = fields.find(
                      (x) => x.id === f.showIf!.fieldId,
                    );
                    change(f.id, {
                      showIf: {
                        ...f.showIf!,
                        equals:
                          source?.type === "checkbox"
                            ? e.target.value === "true"
                            : source?.type === "number"
                              ? Number(e.target.value)
                              : source?.type === "multi_select"
                                ? e.target.value
                                    .split(",")
                                    .map((v) => v.trim())
                                    .filter(Boolean)
                                : e.target.value,
                      },
                    });
                  }}
                />
                <small>
                  {tr(
                    "Casilla: true/false. Selección múltiple: valores separados por comas.",
                  )}
                </small>
              </label>
            )}
          </article>
        ))}
        <div className="manage-actions">
          <label>
            {tr("Nuevo campo")}
            <select
              aria-label={tr("Nuevo campo")}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(FIELD_TYPES).map(([key, label]) => (
                <option value={key} key={key}>
                  {tr(String(label))}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={fields.length >= 50}
            onClick={() =>
              setFields((old) => [
                ...old,
                {
                  id: crypto.randomUUID(),
                  type,
                  label: FIELD_TYPES[type],
                  required: false,
                  ...(["select", "multi_select"].includes(type)
                    ? { options: [{ value: "opcion_1", label: "Opción 1" }] }
                    : {}),
                },
              ])
            }
          >
            {tr("Añadir campo")}
          </Button>
        </div>
        <label>
          {tr("Texto de aceptación de reglas")}
          <textarea
            aria-label={tr("Texto de reglas")}
            rows={3}
            maxLength={5000}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
        </label>
        <label>
          {tr("Consentimiento de datos personales")}
          <textarea
            aria-label={tr("Texto de consentimiento")}
            rows={4}
            maxLength={5000}
            value={consent}
            onChange={(e) => setConsent(e.target.value)}
          />
        </label>
        <div className="manage-actions">
          <Button
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                await save({
                  eventId,
                  kind,
                  expectedRevision: revision,
                  fields,
                  consentText: consent,
                  rulesText: rules,
                });
                setRevision((v) => v + 1);
              }, "Borrador guardado.")
            }
          >
            {tr("Guardar formulario")}
          </Button>
          {current && current.publishedAt === undefined && (
            <Button
              className="manage-outline"
              disabled={op.busy || dirty}
              onClick={() =>
                void op.run(async () => {
                  await publish({
                    eventId,
                    id: current._id,
                    expectedRevision: revision,
                  });
                  setRevision((v) => v + 1);
                }, "Formulario publicado.")
              }
            >
              {tr("Publicar formulario")}
            </Button>
          )}
          <Button
            className="manage-outline"
            disabled={op.busy}
            onClick={() => {
              setFields(current?.fields ?? []);
              setRevision(current?.revision ?? 0);
              setConsent(current?.consentText ?? DEFAULT_CONSENT);
              setRules(current?.rulesText ?? DEFAULT_RULES);
            }}
          >
            {tr("Recargar formulario")}
          </Button>
        </div>
        {dirty && (
          <p className="manage-caption">
            {tr("Guarda los cambios antes de publicar.")}
          </p>
        )}
        <ContentNotice message={op.message} />
        <details>
          <summary>
            {tr("Historial de versiones (")}
            {versions.length})
          </summary>
          {versions.map((v) => (
            <p key={v._id}>
              {tr("Versión ")}
              {v.version} · {v.fields.length} {tr(" campos ·")}{" "}
              {v.publishedAt ? tr("Publicada") : tr("Borrador")}
            </p>
          ))}
        </details>
      </div>
      <aside className="profile-panel form-preview">
        <h2>{tr("Vista previa del formulario")}</h2>
        <p>
          {tr(
            "Los campos condicionales responden a los valores de esta vista. No se envía ninguna inscripción.",
          )}
        </p>
        <div className="registration-fixed">
          <span>{tr("Wallet Stellar · del perfil")}</span>
          <span>{tr("Nombre · del perfil")}</span>
          <span>{tr("Correo verificado · del perfil")}</span>
        </div>
        <FormFields
          fields={fields}
          answers={answers}
          onChange={setAnswers}
          eventId={eventId}
          preview
        />
        <div className="consent-preview">
          <p>{rules}</p>
          <p>{consent}</p>
        </div>
      </aside>
    </div>
  );
}

function canonical(value: unknown) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
