import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { PHASES, PHASE_LABELS } from "../../../convex/lib/presentation";
import { Button } from "../../components/ui/button";
import {
  ContentNotice,
  MediaPicker,
  useContentOperation,
} from "./DesignEditor";
export function TracksEditor({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.content.tracksList, { eventId }),
    save = useMutation(api.content.saveTrack),
    remove = useMutation(api.content.removeTrack),
    op = useContentOperation();
  const empty = { name: "", description: "", prize: "", order: 0 };
  const [form, setForm] = useState(empty),
    [id, setId] = useState<Id<"tracks">>();
  return (
    <div className="content-columns">
      <div className="profile-panel">
        <h2>{tr("Tracks del evento")}</h2>
        <p>
          {tr(
            "Las categorías y sus premios alimentan los bloques Tracks y Premios.",
          )}
        </p>
        {rows?.map((r) => (
          <article className="content-list-item" key={r._id}>
            <h3>{r.name}</h3>
            <p>{r.prize}</p>
            <div className="manage-actions">
              <Button
                className="manage-outline"
                onClick={() => {
                  setId(r._id);
                  setForm({
                    name: r.name,
                    description: r.description ?? "",
                    prize: r.prize ?? "",
                    order: r.order,
                  });
                }}
              >
                {tr("Editar track")}
              </Button>
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () => remove({ eventId, id: r._id }),
                    "Track eliminado.",
                  )
                }
              >
                {tr("Eliminar track")}
              </Button>
            </div>
          </article>
        ))}
        {!rows?.length && <p>{tr("Todavía no hay tracks.")}</p>}
      </div>
      <form
        className="profile-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await save({ eventId, id, ...form });
            setId(undefined);
            setForm(empty);
          });
        }}
      >
        <h2>{id ? tr("Editar track") : tr("Nuevo track")}</h2>
        <label>
          {tr("Nombre del track")}
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {tr("Descripción del track")}
          <textarea
            rows={4}
            maxLength={5000}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label>
          {tr("Premio")}
          <input
            maxLength={300}
            value={form.prize}
            onChange={(e) => setForm({ ...form, prize: e.target.value })}
          />
        </label>
        <label>
          {tr("Orden")}
          <input
            type="number"
            min={0}
            max={10000}
            value={form.order}
            onChange={(e) =>
              setForm({ ...form, order: Number(e.target.value) })
            }
          />
        </label>
        <div className="manage-actions">
          <Button disabled={op.busy}>{tr("Guardar track")}</Button>
          {id && (
            <Button
              type="button"
              className="manage-outline"
              onClick={() => {
                setId(undefined);
                setForm(empty);
              }}
            >
              {tr("Cancelar edición")}
            </Button>
          )}
        </div>
        <ContentNotice message={op.message} />
      </form>
    </div>
  );
}
type ResourceForm = {
  title: string;
  kind: Doc<"resources">["kind"];
  url: string;
  fileId?: Id<"_storage">;
  body: string;
  visibility: Doc<"resources">["visibility"];
  order: number;
  featuredFrom: string;
};
const RESOURCE_VISIBILITY = {
  public: "Público",
  registered: "Registrados",
  approved: "Aprobados",
  staff: "Solo staff",
};
export function ResourcesEditor({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.content.resourcesList, { eventId }),
    save = useMutation(api.content.saveResource),
    remove = useMutation(api.content.removeResource),
    op = useContentOperation();
  const empty: ResourceForm = {
    title: "",
    kind: "link",
    url: "",
    body: "",
    visibility: "public",
    order: 0,
    featuredFrom: "",
  };
  const [form, setForm] = useState(empty),
    [id, setId] = useState<Id<"resources">>();
  return (
    <div className="content-columns">
      <div className="profile-panel">
        <h2>{tr("Recursos del evento")}</h2>
        <p>
          {tr(
            "Solo los públicos aparecen sin iniciar sesión. Las descargas comprueban el acceso en cada petición.",
          )}
        </p>
        {rows?.map((r) => (
          <article className="content-list-item" key={r._id}>
            <h3>{r.title}</h3>
            <span className="manage-badge">
              {tr(RESOURCE_VISIBILITY[r.visibility])} · {r.kind}
            </span>
            <div className="manage-actions">
              <Button
                className="manage-outline"
                onClick={() => {
                  setId(r._id);
                  setForm({
                    title: r.title,
                    kind: r.kind,
                    url: r.url ?? "",
                    fileId: r.fileId,
                    body: r.body ?? "",
                    visibility: r.visibility,
                    order: r.order,
                    featuredFrom: r.featuredFrom ?? "",
                  });
                }}
              >
                {tr("Editar recurso")}
              </Button>
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () => remove({ eventId, id: r._id }),
                    "Recurso eliminado.",
                  )
                }
              >
                {tr("Eliminar recurso")}
              </Button>
            </div>
          </article>
        ))}
        {!rows?.length && <p>{tr("Todavía no hay recursos.")}</p>}
      </div>
      <form
        className="profile-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await save({
              eventId,
              id,
              ...form,
              url: form.kind === "link" ? form.url : undefined,
              body: form.kind === "markdown" ? form.body : undefined,
              fileId: form.kind === "file" ? form.fileId : undefined,
              featuredFrom: form.featuredFrom || undefined,
            });
            setId(undefined);
            setForm(empty);
          });
        }}
      >
        <h2>{id ? tr("Editar recurso") : tr("Nuevo recurso")}</h2>
        <label>
          {tr("Título del recurso")}
          <input
            required
            minLength={2}
            maxLength={160}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label>
          {tr("Tipo de recurso")}
          <select
            aria-label={tr("Tipo de recurso")}
            value={form.kind}
            onChange={(e) =>
              setForm({ ...form, kind: e.target.value as typeof form.kind })
            }
          >
            <option value="link">{tr("Enlace HTTPS")}</option>
            <option value="file">{tr("Archivo")}</option>
            <option value="markdown">{tr("Guía Markdown")}</option>
          </select>
        </label>
        {form.kind === "link" && (
          <label>
            {tr("URL del recurso")}
            <input
              type="url"
              required
              maxLength={2000}
              placeholder={tr("https://")}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </label>
        )}
        {form.kind === "markdown" && (
          <label>
            {tr("Contenido Markdown")}
            <textarea
              required
              rows={8}
              maxLength={10000}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
        )}
        {form.kind === "file" && (
          <MediaPicker
            eventId={eventId}
            kind="resource"
            label={tr("Archivo del recurso")}
            value={form.fileId}
            onChange={(fileId) => setForm((f) => ({ ...f, fileId }))}
          />
        )}
        <label>
          {tr("Visibilidad")}
          <select
            aria-label={tr("Visibilidad")}
            value={form.visibility}
            onChange={(e) =>
              setForm({
                ...form,
                visibility: e.target.value as typeof form.visibility,
              })
            }
          >
            {Object.entries(RESOURCE_VISIBILITY).map(([key, label]) => (
              <option key={key} value={key}>
                {tr(String(label))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Destacar durante")}
          <select
            aria-label={tr("Destacar durante")}
            value={form.featuredFrom}
            onChange={(e) => setForm({ ...form, featuredFrom: e.target.value })}
          >
            <option value="">{tr("Sin destacar")}</option>
            {PHASES.map((p, i) => (
              <option key={p} value={p}>
                {tr(PHASE_LABELS[i])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Orden")}
          <input
            type="number"
            min={0}
            max={10000}
            value={form.order}
            onChange={(e) =>
              setForm({ ...form, order: Number(e.target.value) })
            }
          />
        </label>
        <div className="manage-actions">
          <Button disabled={op.busy || (form.kind === "file" && !form.fileId)}>
            {tr("Guardar recurso")}
          </Button>
          {id && (
            <Button
              type="button"
              className="manage-outline"
              onClick={() => {
                setId(undefined);
                setForm(empty);
              }}
            >
              {tr("Cancelar edición")}
            </Button>
          )}
        </div>
        <ContentNotice message={op.message} />
      </form>
    </div>
  );
}
export function MentorsEditor({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const rows = useQuery(api.content.mentorsList, { eventId }),
    save = useMutation(api.content.saveMentor),
    remove = useMutation(api.content.removeMentor),
    op = useContentOperation();
  const empty = {
    name: "",
    expertise: "",
    contact: "",
    availability: "",
    publicContact: false,
    photoId: undefined as Id<"_storage"> | undefined,
  };
  const [form, setForm] = useState(empty),
    [id, setId] = useState<Id<"mentors">>();
  return (
    <div className="content-columns">
      <div className="profile-panel">
        <h2>{tr("Mentores del evento")}</h2>
        <p>{tr("El contacto es privado salvo que marques su publicación.")}</p>
        {rows?.map((r) => (
          <article className="content-list-item" key={r._id}>
            <h3>{r.name}</h3>
            <p>{r.expertise.join(" · ")}</p>
            <p>{r.availability}</p>
            <div className="manage-actions">
              <Button
                className="manage-outline"
                onClick={() => {
                  setId(r._id);
                  setForm({
                    name: r.name,
                    expertise: r.expertise.join("\n"),
                    contact: r.contact ?? "",
                    availability: r.availability ?? "",
                    publicContact: r.publicContact ?? false,
                    photoId: r.photoId,
                  });
                }}
              >
                {tr("Editar mentor")}
              </Button>
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () => remove({ eventId, id: r._id }),
                    "Mentor eliminado.",
                  )
                }
              >
                {tr("Eliminar mentor")}
              </Button>
            </div>
          </article>
        ))}
        {!rows?.length && <p>{tr("Todavía no hay mentores.")}</p>}
      </div>
      <form
        className="profile-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await save({
              eventId,
              id,
              ...form,
              expertise: form.expertise
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            });
            setId(undefined);
            setForm(empty);
          });
        }}
      >
        <h2>{id ? tr("Editar mentor") : tr("Nuevo mentor")}</h2>
        <label>
          {tr("Nombre del mentor")}
          <input
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          {tr("Áreas (una por línea, hasta ocho)")}
          <textarea
            rows={3}
            value={form.expertise}
            onChange={(e) => setForm({ ...form, expertise: e.target.value })}
          />
        </label>
        <label>
          {tr("Contacto")}
          <input
            maxLength={200}
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={form.publicContact}
            onChange={(e) =>
              setForm({ ...form, publicContact: e.target.checked })
            }
          />
          {tr("Publicar contacto del mentor")}
        </label>
        <label>
          {tr("Disponibilidad")}
          <textarea
            rows={3}
            maxLength={500}
            value={form.availability}
            onChange={(e) => setForm({ ...form, availability: e.target.value })}
          />
        </label>
        <MediaPicker
          eventId={eventId}
          kind="image"
          label={tr("Foto del mentor")}
          value={form.photoId}
          onChange={(photoId) => setForm((f) => ({ ...f, photoId }))}
        />
        <div className="manage-actions">
          <Button disabled={op.busy}>{tr("Guardar mentor")}</Button>
          {id && (
            <Button
              type="button"
              className="manage-outline"
              onClick={() => {
                setId(undefined);
                setForm(empty);
              }}
            >
              {tr("Cancelar edición")}
            </Button>
          )}
        </div>
        <ContentNotice message={op.message} />
      </form>
    </div>
  );
}
