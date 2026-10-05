import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { useI18n } from "../../i18n/I18n";
import { Button } from "../../components/ui/button";
import { useRegistrationOperation } from "../registration/shared";

type Settings = NonNullable<Doc<"events">["socialCards"]>;
const defaults: Settings = {
  enabled: false,
  personalGalleryEnabled: false,
  projectCardsEnabled: false,
  templateId: "editorial",
  copyText: "Estoy participando en {event} construyendo ideas con impacto.",
  socialHandles: {},
  projectLinks: { repo: true, demo: true, video: false },
};

export function OrganizerSocialCards({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();
  const [settings, setSettings] = useState<Settings>(
    event.socialCards ?? defaults,
  );
  const configure = useMutation(api.socialCards.configure);
  const op = useRegistrationOperation();
  useEffect(
    () => setSettings(event.socialCards ?? defaults),
    [event.socialCards],
  );
  const update = (partial: Partial<Settings>) =>
    setSettings((current) => ({ ...current, ...partial }));
  return (
    <form
      className="profile-panel social-card-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(
          () => configure({ eventId: event._id, settings }),
          "Configuración de cards guardada.",
        );
      }}
    >
      <h2>{tr("Cards sociales del evento")}</h2>
      <p>
        {tr(
          "Define la identidad de las cards. Las cards personales solo aparecen en la galería si la persona las publica. Las cards de proyectos siguen la publicación de resultados y la galería pública del evento.",
        )}
      </p>
      <p className="manage-caption">
        {tr(
          "Las cards heredan los colores, tipografías y logo de la identidad visual del evento.",
        )}
      </p>
      <label className="manage-checkbox">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update({ enabled: e.target.checked })}
        />
        {tr("Habilitar cards sociales")}
      </label>
      <label>
        {tr("Plantilla visual")}
        <select
          value={settings.templateId}
          onChange={(e) => update({ templateId: e.target.value })}
        >
          <option value="editorial">{tr("Editorial")}</option>
          <option value="signal">{tr("Señal")}</option>
          <option value="orbit">{tr("Órbita")}</option>
        </select>
      </label>
      <label>
        {tr("Nombre oficial en las cards")}
        <input
          maxLength={100}
          value={settings.officialName ?? ""}
          onChange={(e) =>
            update({ officialName: e.target.value || undefined })
          }
          placeholder={event.name}
        />
      </label>
      <label>
        {tr("Copy base para compartir")}
        <textarea
          rows={3}
          maxLength={500}
          value={settings.copyText}
          onChange={(e) => update({ copyText: e.target.value })}
        />
      </label>
      <div className="manage-fields">
        <label>
          {tr("Cuenta de X para etiquetar")}
          <input
            maxLength={80}
            value={settings.socialHandles?.x ?? ""}
            onChange={(e) =>
              update({
                socialHandles: {
                  ...settings.socialHandles,
                  x: e.target.value || undefined,
                },
              })
            }
            placeholder="@mintedinpe"
          />
        </label>
        <label>
          {tr("Cuenta o página de LinkedIn")}
          <input
            maxLength={80}
            value={settings.socialHandles?.linkedin ?? ""}
            onChange={(e) =>
              update({
                socialHandles: {
                  ...settings.socialHandles,
                  linkedin: e.target.value || undefined,
                },
              })
            }
            placeholder="Minted in Perú"
          />
        </label>
      </div>
      <label className="manage-checkbox">
        <input
          type="checkbox"
          checked={settings.personalGalleryEnabled}
          onChange={(e) => update({ personalGalleryEnabled: e.target.checked })}
        />
        {tr("Permitir galería de cards personales (opt-in por persona)")}
      </label>
      <label className="manage-checkbox">
        <input
          type="checkbox"
          checked={settings.projectCardsEnabled}
          onChange={(e) => update({ projectCardsEnabled: e.target.checked })}
        />
        {tr("Mostrar cards para proyectos publicados")}
      </label>
      <h3>{tr("Enlaces visibles en cards de proyectos")}</h3>
      <div className="manage-fields">
        {(
          [
            ["repo", "Repositorio"],
            ["demo", "Demo"],
            ["video", "Video"],
          ] as const
        ).map(([key, label]) => (
          <label className="manage-checkbox" key={key}>
            <input
              type="checkbox"
              checked={settings.projectLinks[key]}
              onChange={(e) =>
                update({
                  projectLinks: {
                    ...settings.projectLinks,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {tr(label)}
          </label>
        ))}
      </div>
      <Button type="submit" disabled={op.busy}>
        {op.busy ? tr("Guardando…") : tr("Guardar configuración de cards")}
      </Button>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </form>
  );
}
