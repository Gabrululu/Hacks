import { useI18n } from "../../i18n/I18n";
import { registrationError } from "../registration/shared";
import { eventPath } from "../../lib/eventUrls";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  FONTS,
  BLOCKS,
  ARRAY_FIELDS,
  PHASES,
  PHASE_LABELS,
  contrast,
  THEME_PRESETS,
} from "../../../convex/lib/presentation";
import { EventPage, type PageData } from "../events/EventPage";
import { useWalletAuth } from "../auth/AuthProvider";
import { uploadFile } from "./files";
import { Button } from "../../components/ui/button";
export function useContentOperation() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return {
    busy,
    message,
    run: async (
      task: () => Promise<unknown>,
      success = "Cambios guardados.",
    ) => {
      setBusy(true);
      setMessage("");
      try {
        await task();
        setMessage(success);
      } catch (e) {
        const m = String(e);
        setMessage(
          /FORM_|RETIRED_FIELD|UNSAFE_PATTERN/.test(m)
            ? registrationError(e)
            : /PRESENTATION_CONFLICT/.test(m)
              ? "Otro editor guardó cambios. Copia tu contenido pendiente y pulsa Recargar para cargar la última versión."
            : /FORBIDDEN/.test(m)
                ? "No tienes permiso para esta acción."
                : /SLOT_FULL/.test(m)
                  ? "Ese horario ya alcanzó su cupo de equipos."
                  : /SLOT_UNAVAILABLE/.test(m)
                    ? "Ese horario ya no está disponible."
                    : /MENTOR_SLOT_OVERLAP/.test(m)
                      ? "Ese mentor ya tiene otro horario que se cruza."
                      : /INVALID_MEETING_URL/.test(m)
                        ? "El enlace de reunión debe ser una URL HTTPS válida."
                        : /MENTOR_HAS_SCHEDULE/.test(m)
                          ? "No se puede eliminar un mentor que ya tiene horarios o reservas asociados."
                          : /EVENT_CLOSED/.test(m)
                            ? "El evento está cerrado y no admite nuevas mentorías."
                        : /CANCELLATION_CLOSED/.test(m)
                          ? "Ya no se puede cancelar: la sesión comenzó."
                          : /SESSION_NOT_FINISHED/.test(m)
                            ? "La asistencia se marca después de finalizar la sesión."
                            : /BOOKING_NOT_ACTIVE/.test(m)
                              ? "La reserva ya fue cancelada o cerrada."
                : /EVENT_QUOTA_REACHED/.test(m)
                  ? "Has alcanzado tu cuota de eventos activos."
                  : /VISIBLE_HERO_REQUIRED/.test(m)
                    ? "Incluye una portada visible desde el inicio para publicar."
                    : /INVALID|MISMATCH|REQUIRED/.test(m)
                      ? "Revisa los campos, enlaces y filas: el contenido no es válido."
                      : e instanceof Error
                        ? e.message
                        : "No se pudo guardar.",
        );
      } finally {
        setBusy(false);
      }
    },
  };
}
export function ContentNotice({ message }: { message: string }) {
  const { t: tr } = useI18n();

  return message ? (
    <p className="profile-notice" role="status">
      {tr(message)}
    </p>
  ) : null;
}
export function MediaPicker({
  eventId,
  kind,
  value,
  onChange,
  label,
}: {
  eventId: Id<"events">;
  kind: "image" | "resource";
  value?: Id<"_storage">;
  onChange: (id: Id<"_storage"> | undefined, url?: string) => void;
  label: string;
}) {
  const { t: tr } = useI18n();

  const assets = useQuery(api.media.list, { eventId, kind }),
    auth = useWalletAuth(),
    op = useContentOperation();
  return (
    <div className="media-picker">
      <label>
        {tr(String(label))}
        <select
          aria-label={tr(String(label))}
          value={value ?? ""}
          onChange={(e) => {
            const a = assets?.find((a) => a.fileId === e.target.value);
            onChange(a?.fileId, a?.url ?? undefined);
          }}
        >
          <option value="">{tr("Sin archivo")}</option>
          {assets?.map((a) => (
            <option key={a.fileId} value={a.fileId}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="upload-label">
        {tr("Subir ")}
        {kind === "image" ? tr("imagen") : tr("archivo")}
        <input
          aria-label={tr("Subir {0}", { "0": label })}
          type="file"
          accept={
            kind === "image"
              ? "image/png,image/jpeg,image/webp"
              : ".pdf,.txt,.zip"
          }
          disabled={op.busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file)
              void op.run(async () => {
                const id = await uploadFile(
                  eventId,
                  kind,
                  file,
                  await auth.fetchAccessToken({ forceRefreshToken: false }),
                );
                onChange(id);
              }, "Archivo subido. Guarda el contenido para utilizarlo.");
            e.target.value = "";
          }}
        />
      </label>
      <small>
        {kind === "image"
          ? tr("PNG, JPEG o WebP · hasta 5 MB")
          : tr("PDF, TXT o ZIP · hasta 10 MB")}
      </small>
      <ContentNotice message={op.message} />
    </div>
  );
}
function Preview({
  data,
  children,
}: {
  data: PageData | undefined;
  children?: ReactNode;
}) {
  const { t: tr } = useI18n();

  const [phase, setPhase] = useState("registration");
  return (
    <aside className="design-preview">
      <div className="design-preview-heading">
        <strong>{tr("Vista previa en vivo")}</strong>
        <label>
          {tr("Fase")}
          <select value={phase} onChange={(e) => setPhase(e.target.value)}>
            {PHASES.map((p, i) => (
              <option key={p} value={p}>
                {tr(PHASE_LABELS[i])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
      {data ? (
        <EventPage data={data} preview phase={phase} />
      ) : (
        <p>{tr("Cargando vista previa…")}</p>
      )}
    </aside>
  );
}
export function ThemeEditor({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();

  const [value, setValue] = useState(event.theme),
    [version, setVersion] = useState(event.presentationVersion ?? 0),
    [images, setImages] = useState<Record<string, string>>({});
  const preview = useQuery(api.content.preview, { eventId: event._id }),
    assets = useQuery(api.media.list, { eventId: event._id, kind: "image" }),
    save = useMutation(api.content.saveTheme),
    op = useContentOperation();
  const ratio = contrast(value.colors.text, value.colors.background),
    surfaceRatio = contrast(value.colors.text, value.colors.surface);
  const updateCustomTheme = (patch: Partial<typeof value>) =>
    setValue((old) => ({ ...old, ...patch, preset: "custom" }));
  const imageUrls = {
    ...preview?.images,
    ...images,
    ...Object.fromEntries(
      (assets ?? []).filter((a) => a.url).map((a) => [a.fileId, a.url!]),
    ),
  };
  return (
    <div className="design-workspace">
      <form
        className="profile-panel content-editor"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await save({
              eventId: event._id,
              theme: value,
              expectedVersion: version,
            });
            setVersion((v) => v + 1);
          });
        }}
      >
        <h2>{tr("Tema del evento")}</h2>
        <p>
          {tr(
            "Los cambios aparecen en la vista previa. Guarda para aplicarlos al evento.",
          )}
        </p>
        <fieldset className="theme-presets">
          <legend>{tr("1. Elige una dirección visual")}</legend>
          <p>{tr("Empieza con un tema y ajusta luego cada detalle.")}</p>
          <div className="theme-preset-grid">
            {Object.entries(THEME_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                className="theme-preset-card"
                aria-pressed={value.preset === id}
                onClick={() => setValue((old) => ({
                  ...old,
                  mode: preset.mode,
                  colors: preset.colors,
                  fonts: preset.fonts,
                  radius: preset.radius,
                  preset: id as typeof old.preset,
                }))}
              >
                <span className="theme-preset-swatches">
                  {[
                    preset.colors.background,
                    preset.colors.primary,
                    preset.colors.accent,
                  ].map((color) => <i key={color} style={{ backgroundColor: color }} />)}
                </span>
                <strong>{tr(preset.label)}</strong>
                <small>{preset.fonts.heading} · {preset.radius}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <h3>{tr("Personalización avanzada del tema")}</h3>
        <label>
          {tr("Modo")}
          <select
            value={value.mode}
            onChange={(e) =>
              updateCustomTheme({ mode: e.target.value as typeof value.mode })
            }
          >
            <option value="dark">{tr("Oscuro")}</option>
            <option value="light">{tr("Claro")}</option>
          </select>
        </label>
        <div className="color-grid">
          {Object.entries(value.colors).map(([key, color]) => (
            <label key={key}>
              {tr(
                (
                  {
                    primary: "Primario",
                    secondary: "Secundario",
                    accent: "Acento",
                    background: "Fondo",
                    surface: "Superficie",
                    text: "Texto",
                  } as Record<string, string>
                )[key],
              )}
              <div className="color-control">
                <input
                  aria-label={tr("Color {0}", { "0": key })}
                  type="color"
                  value={color}
                  onChange={(e) =>
                    updateCustomTheme({
                      colors: { ...value.colors, [key]: e.target.value },
                    })
                  }
                />
                <code>{color}</code>
              </div>
            </label>
          ))}
        </div>
        {(["heading", "body"] as const).map((key) => (
          <label key={key}>
            {key === "heading"
              ? tr("Fuente de títulos")
              : tr("Fuente del cuerpo")}
            <select
              aria-label={
                key === "heading"
                  ? tr("Fuente de títulos")
                  : tr("Fuente del cuerpo")
              }
              value={value.fonts[key]}
              onChange={(e) =>
                updateCustomTheme({
                  fonts: { ...value.fonts, [key]: e.target.value },
                })
              }
            >
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          {tr("Bordes")}
          <select
            value={value.radius}
            onChange={(e) =>
              updateCustomTheme({
                radius: e.target.value as typeof value.radius,
              })
            }
          >
            {["none", "sm", "md", "lg", "full"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <fieldset className="theme-motion-controls">
          <legend>{tr("Fondo interactivo")}</legend>
          <label className="theme-motion-toggle">
            <input
              type="checkbox"
              disabled={!value.bannerId}
              checked={value.cursorEffect?.enabled ?? false}
              onChange={(event) =>
                updateCustomTheme({
                  cursorEffect: {
                    enabled: event.target.checked,
                    intensity: value.cursorEffect?.intensity ?? 0.45,
                  },
                })
              }
            />
            {tr("Distorsión de agua al mover el cursor")}
          </label>
          {!value.bannerId && (
            <small>{tr("Sube un banner para habilitar el efecto.")}</small>
          )}
          <label>
            {tr("Intensidad del efecto")}
            <input
              type="range"
              min="0.15"
              max="0.8"
              step="0.05"
              disabled={!value.bannerId || !value.cursorEffect?.enabled}
              value={value.cursorEffect?.intensity ?? 0.45}
              onChange={(event) =>
                updateCustomTheme({
                  cursorEffect: {
                    enabled: value.cursorEffect?.enabled ?? false,
                    intensity: Number(event.target.value),
                  },
                })
              }
            />
            <small>{tr("Suave")}{" · "}{tr("Actual")}: {Math.round((value.cursorEffect?.intensity ?? 0.45) * 100)}%</small>
          </label>
        </fieldset>
        <p
          className={
            Math.min(ratio, surfaceRatio) < 4.5
              ? "contrast-warning"
              : "manage-caption"
          }
        >
          {tr("Contraste texto/fondo: ")}
          {ratio.toFixed(2)}
          {tr(":1 · texto/superficie:")} {surfaceRatio.toFixed(2)}:1.{" "}
          {Math.min(ratio, surfaceRatio) < 4.5
            ? tr(
                "Advertencia: inferior a AA (4.5:1). Puedes guardar, pero recomendamos ajustar los colores.",
              )
            : tr("Cumple AA para texto normal.")}
        </p>
        {(["logoId", "bannerId", "faviconId", "ogImageId"] as const).map(
          (key) => (
            <MediaPicker
              key={key}
              eventId={event._id}
              kind="image"
              label={
                {
                  logoId: "Logo",
                  bannerId: "Banner",
                  faviconId: "Favicon",
                  ogImageId: "Imagen para compartir",
                }[key]
              }
              value={value[key]}
              onChange={(id, url) => {
                setValue((v) => ({ ...v, [key]: id }));
                if (id && url) setImages((v) => ({ ...v, [id]: url }));
              }}
            />
          ),
        )}
        <div className="manage-actions">
          <Button disabled={op.busy}>{tr("Guardar tema")}</Button>
          <Button
            type="button"
            className="manage-outline"
            onClick={() => {
              setValue(event.theme);
              setVersion(event.presentationVersion ?? 0);
            }}
          >
            {tr("Recargar tema")}
          </Button>
        </div>
        <ContentNotice message={op.message} />
      </form>
      <Preview
        data={
          preview ? { ...preview, theme: value, images: imageUrls } : undefined
        }
      />
    </div>
  );
}
function SortableBlock({ id, children }: { id: string; children: ReactNode }) {
  const { t: tr } = useI18n();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <article
      ref={setNodeRef}
      className={`block-editor-row ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="block-handle"
        aria-label={tr("Arrastrar bloque")}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      {children}
    </article>
  );
}
export function BlockEditor({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();

  const [blocks, setBlocks] = useState(event.blocks),
    [version, setVersion] = useState(event.presentationVersion ?? 0),
    [type, setType] = useState("about");
  const preview = useQuery(api.content.preview, { eventId: event._id }),
    assets = useQuery(api.media.list, { eventId: event._id, kind: "image" }),
    save = useMutation(api.content.saveBlocks),
    op = useContentOperation();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const update = (id: string, patch: Partial<(typeof blocks)[number]>) =>
    setBlocks((old) => old.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const updateStyle = (
    id: string,
    patch: Partial<NonNullable<(typeof blocks)[number]["style"]>>,
  ) =>
    setBlocks((old) =>
      old.map((b) =>
        b.id === id
          ? {
              ...b,
              style: {
                width: "contained",
                align: "left",
                spacing: "normal",
                surface: "none",
                ...b.style,
                ...patch,
              },
            }
          : b,
      ),
    );
  const move = (index: number, offset: number) =>
    setBlocks((old) => arrayMove(old, index, index + offset));
  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      setBlocks((old) =>
        arrayMove(
          old,
          old.findIndex((b) => b.id === active.id),
          old.findIndex((b) => b.id === over.id),
        ),
      );
  };
  const urls = Object.fromEntries(
    (assets ?? []).filter((a) => a.url).map((a) => [a.fileId, a.url!]),
  );
  return (
    <div className="design-workspace">
      <div className="profile-panel content-editor">
        <h2>{tr("2. Compón la landing")}</h2>
        <p>
          {tr(
            "Añade, elimina y ordena secciones. Ajusta su ancho y alineación; el registro y el panel de participantes mantienen el diseño de Hacks.",
          )}
        </p>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={dragEnd}
          accessibility={{
            screenReaderInstructions: {
              draggable: tr(
                "Pulsa Espacio para seleccionar el bloque, usa las flechas para moverlo y pulsa Espacio de nuevo para colocarlo. Escape cancela.",
              ),
            },
            announcements: {
              onDragStart: ({ active }) =>
                tr("Bloque {0} seleccionado.", {
                  "0": tr(
                    BLOCKS[blocks.find((b) => b.id === active.id)!.type].label,
                  ),
                }),
              onDragOver: ({ over }) =>
                over
                  ? tr("Sobre {0}.", {
                      "0": tr(
                        BLOCKS[blocks.find((b) => b.id === over.id)!.type]
                          .label,
                      ),
                    })
                  : tr("Fuera de la lista."),
              onDragEnd: () => tr("Bloque colocado."),
              onDragCancel: () => tr("Movimiento cancelado."),
            },
          }}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((b, index) => (
              <SortableBlock key={b.id} id={b.id}>
                <div className="block-fields">
                  <div className="block-row-heading">
                    <h3>{tr(BLOCKS[b.type].label)}</h3>
                    <div className="block-row-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={tr("Subir bloque {0}", {
                          "0": tr(BLOCKS[b.type].label),
                        })}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === blocks.length - 1}
                        aria-label={tr("Bajar {0}", {
                          "0": tr(BLOCKS[b.type].label),
                        })}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={tr("Eliminar {0}", {
                          "0": tr(BLOCKS[b.type].label),
                        })}
                        onClick={() =>
                          setBlocks((old) =>
                            old.filter((row) => row.id !== b.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <div className="block-layout-controls">
                    <label>
                      {tr("Ancho de sección")}
                      <select
                        value={b.style?.width ?? "contained"}
                        onChange={(e) => updateStyle(b.id, { width: e.target.value as "contained" | "wide" | "full" })}
                      >
                        <option value="contained">{tr("Contenido")}</option>
                        <option value="wide">{tr("Amplio")}</option>
                        <option value="full">{tr("Ancho completo")}</option>
                      </select>
                    </label>
                    <label>
                      {tr("Alineación")}
                      <select
                        value={b.style?.align ?? "left"}
                        onChange={(e) => updateStyle(b.id, { align: e.target.value as "left" | "center" | "right" })}
                      >
                        <option value="left">{tr("Izquierda")}</option>
                        <option value="center">{tr("Centro")}</option>
                        <option value="right">{tr("Derecha")}</option>
                      </select>
                    </label>
                  </div>
                  <details className="block-advanced-controls">
                    <summary>{tr("3. Ajustes avanzados de esta sección")}</summary>
                    <div className="block-layout-controls">
                      <label>
                        {tr("Espaciado vertical")}
                        <select
                          value={b.style?.spacing ?? "normal"}
                          onChange={(e) => updateStyle(b.id, { spacing: e.target.value as "compact" | "normal" | "spacious" })}
                        >
                          <option value="compact">{tr("Compacto")}</option>
                          <option value="normal">{tr("Normal")}</option>
                          <option value="spacious">{tr("Espacioso")}</option>
                        </select>
                      </label>
                      <label>
                        {tr("Fondo de sección")}
                        <select
                          value={b.style?.surface ?? "none"}
                          onChange={(e) => updateStyle(b.id, { surface: e.target.value as "none" | "surface" })}
                        >
                          <option value="none">{tr("Transparente")}</option>
                          <option value="surface">{tr("Superficie del tema")}</option>
                        </select>
                      </label>
                      <label className="section-color-control">
                        {tr("Color de fondo personalizado")}
                        <input
                          type="color"
                          value={b.style?.backgroundColor ?? "#111111"}
                          onChange={(e) => updateStyle(b.id, { backgroundColor: e.target.value })}
                        />
                        <button type="button" className="manage-outline" onClick={() => updateStyle(b.id, { backgroundColor: undefined })}>{tr("Quitar color")}</button>
                      </label>
                      <label className="section-color-control">
                        {tr("Color de texto personalizado")}
                        <input
                          type="color"
                          value={b.style?.textColor ?? "#ffffff"}
                          onChange={(e) => updateStyle(b.id, { textColor: e.target.value })}
                        />
                        <button type="button" className="manage-outline" onClick={() => updateStyle(b.id, { textColor: undefined })}>{tr("Restablecer")}</button>
                      </label>
                    </div>
                    {contrast(
                      b.style?.textColor ?? event.theme.colors.text,
                      b.style?.backgroundColor ?? (
                        b.style?.surface === "surface"
                          ? event.theme.colors.surface
                          : event.theme.colors.background
                      ),
                    ) < 4.5 ? (
                      <p className="contrast-warning">{tr("El contraste de esta sección es inferior a AA (4.5:1).")}</p>
                    ) : (
                      <p className="manage-caption">{tr("Comprueba también la vista móvil después de ajustar los colores.")}</p>
                    )}
                  </details>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={b.visible}
                      onChange={(e) =>
                        update(b.id, { visible: e.target.checked })
                      }
                    />
                    {tr("Visible")}
                  </label>
                  <label>
                    {tr("Mostrar desde")}
                    <select
                      aria-label={tr("Mostrar desde")}
                      value={b.visibleFrom ?? ""}
                      onChange={(e) =>
                        update(b.id, {
                          visibleFrom: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">{tr("Desde el inicio")}</option>
                      {PHASES.map((p, i) => (
                        <option key={p} value={p}>
                          {tr(PHASE_LABELS[i])}
                        </option>
                      ))}
                    </select>
                  </label>
                  {Object.entries(BLOCKS[b.type].fields).map(([key, label]) =>
                    key === "imageIds" ? (
                      <div key={key}>
                        <strong>{tr(String(label))}</strong>
                        <div className="gallery-picker">
                          {assets?.map((a) => (
                            <label className="checkbox-row" key={a.fileId}>
                              <input
                                type="checkbox"
                                checked={
                                  Array.isArray(b.content.imageIds) &&
                                  b.content.imageIds.includes(a.fileId)
                                }
                                onChange={(e) => {
                                  const ids = Array.isArray(b.content.imageIds)
                                    ? b.content.imageIds
                                    : [];
                                  update(b.id, {
                                    content: {
                                      ...b.content,
                                      imageIds: e.target.checked
                                        ? [...ids, a.fileId]
                                        : ids.filter((id) => id !== a.fileId),
                                    },
                                  });
                                }}
                              />
                              {a.url && <img src={a.url} alt="" />}
                              {a.name}
                            </label>
                          ))}
                        </div>
                        <MediaPicker
                          eventId={event._id}
                          kind="image"
                          label={tr("Nueva imagen de galería")}
                          onChange={(id) => {
                            if (id)
                              update(b.id, {
                                content: {
                                  ...b.content,
                                  imageIds: [
                                    ...(Array.isArray(b.content.imageIds)
                                      ? b.content.imageIds
                                      : []),
                                    id,
                                  ],
                                },
                              });
                          }}
                        />
                      </div>
                    ) : (
                      <label key={key}>
                        {tr(String(label))}
                        <textarea
                          aria-label={tr(String(label))}
                          rows={
                            key === "markdown"
                              ? 5
                              : ARRAY_FIELDS.includes(key)
                                ? 3
                                : 1
                          }
                          maxLength={
                            key === "markdown"
                              ? 10000
                              : ARRAY_FIELDS.includes(key)
                                ? 24000
                                : 500
                          }
                          value={
                            Array.isArray(b.content[key])
                              ? (b.content[key] as string[]).join("\n")
                              : typeof b.content[key] === "string"
                                ? (b.content[key] as string)
                                : ""
                          }
                          onChange={(e) =>
                            update(b.id, {
                              content: {
                                ...b.content,
                                [key]: ARRAY_FIELDS.includes(key)
                                  ? e.target.value
                                    ? e.target.value.split("\n")
                                    : []
                                  : e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                </div>
              </SortableBlock>
            ))}
          </SortableContext>
        </DndContext>
        <div className="manage-actions">
          <label>
            {tr("Nuevo bloque")}
            <select
              aria-label={tr("Nuevo bloque")}
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(BLOCKS).map(([key, def]) => (
                <option key={key} value={key}>
                  {tr(def.label)}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={blocks.length >= 40}
            onClick={() =>
              setBlocks((old) => [
                ...old,
                { id: crypto.randomUUID(), type, visible: true, content: {} },
              ])
            }
          >
            {tr("Añadir bloque")}
          </Button>
        </div>
        <div className="manage-actions">
          <Button
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                await save({
                  eventId: event._id,
                  blocks,
                  expectedVersion: version,
                });
                setVersion((v) => v + 1);
              })
            }
          >
            {tr("Guardar página")}
          </Button>
          <Button
            className="manage-outline"
            onClick={() => {
              setBlocks(event.blocks);
              setVersion(event.presentationVersion ?? 0);
            }}
          >
            {tr("Recargar página")}
          </Button>
        </div>
        <ContentNotice message={op.message} />
      </div>
      <Preview
        data={
          preview
            ? { ...preview, blocks, images: { ...preview.images, ...urls } }
            : undefined
        }
      />
    </div>
  );
}
export function PublicationControls({
  event,
  allowed,
}: {
  event: Doc<"events">;
  allowed: boolean;
}) {
  const { t: tr } = useI18n();

  const save = useMutation(api.content.status),
    op = useContentOperation();
  return (
    <div className="profile-panel publication-controls">
      <h2>{tr("Publicación")}</h2>
      <p>
        {event.status === "draft"
          ? tr(
              "El borrador solo es visible para el staff. Revisa la página antes de publicarla en el catálogo.",
            )
          : event.status === "published"
            ? tr(
                "Tu evento está publicado. Los cambios que guardes se reflejan en su página pública.",
              )
            : tr(
                "Este evento está archivado y no aparece en el catálogo. Restáuralo como borrador para editarlo.",
              )}
      </p>
      <div className="manage-actions">
        <Button asChild className="manage-outline">
          <Link to={eventPath(event.slug, "preview")}>{tr("Ver vista previa")}</Link>
        </Button>
        {event.status === "published" && (
          <Button asChild className="manage-outline">
          <Link to={eventPath(event.slug)}>{tr("Ver página pública")}</Link>
          </Button>
        )}
        {allowed &&
          (event.status === "archived" ? (
            <Button
              disabled={op.busy}
              onClick={() =>
                void op.run(
                  () => save({ eventId: event._id, status: "draft" }),
                  "Evento restaurado como borrador.",
                )
              }
            >
              {tr("Restaurar borrador")}
            </Button>
          ) : (
            <>
              <Button
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () =>
                      save({
                        eventId: event._id,
                        status:
                          event.status === "published" ? "draft" : "published",
                      }),
                    event.status === "published"
                      ? "Evento retirado del catálogo."
                      : "Evento publicado.",
                  )
                }
              >
                {event.status === "published"
                  ? tr("Volver a borrador")
                  : tr("Publicar evento")}
              </Button>
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(
                    () => save({ eventId: event._id, status: "archived" }),
                    "Evento archivado.",
                  )
                }
              >
                {tr("Archivar evento")}
              </Button>
            </>
          ))}
      </div>
      <ContentNotice message={op.message} />
    </div>
  );
}
