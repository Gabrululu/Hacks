import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useWalletAuth } from "../auth/AuthProvider";
import { convexSiteUrl } from "../../lib/backend";
import { eventPath } from "../../lib/eventUrls";
import { useI18n } from "../../i18n/I18n";
import { Button } from "../../components/ui/button";
import { SocialCardCanvas, socialCardPng } from "./SocialCardCanvas";

const roleNames = {
  participant: "Hacker",
  mentor: "Mentor",
  judge: "Jurado",
} as const;

export function PersonalCardStudio({ slug }: { slug: string }) {
  const { t: tr } = useI18n();
  const card = useQuery(api.socialCards.my, { slug });
  const event = useQuery(api.events.get, { slug });
  const saveMine = useMutation(api.socialCards.saveMine);
  const publishMine = useMutation(api.socialCards.publishMine);
  const { fetchAccessToken } = useWalletAuth();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [savedPhotoPreview, setSavedPhotoPreview] = useState<string | null>(
    null,
  );
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setName(card?.displayName ?? ""), [card?.displayName]);
  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    const baseUrl = convexSiteUrl;
    if (!card?.photoUrl || !baseUrl || photo || removePhoto) {
      setSavedPhotoPreview(null);
      return;
    }
    void fetchAccessToken({ forceRefreshToken: false })
      .then(async (token) => {
        const url = `${baseUrl.replace(/\/$/, "")}/${card.photoUrl!.replace(/^\//, "")}`;
        const response = await fetch(
          url,
          token ? { headers: { Authorization: `Bearer ${token}` } } : {},
        );
        if (!response.ok) return;
        objectUrl = URL.createObjectURL(await response.blob());
        if (active) setSavedPhotoPreview(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => setSavedPhotoPreview(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [card?.photoUrl, photo, removePhoto, fetchAccessToken]);

  const palette = event?.theme?.colors;
  const data = useMemo(() => {
    if (!card || !event) return null;
    return {
      eventName: card.settings?.officialName?.trim() || event.name,
      eventTagline: event.tagline,
      roleLabel: tr(roleNames[card.role]),
      participatingLabel: tr("PARTICIPANDO EN"),
      readyLabel: tr("LISTO PARA CONSTRUIR"),
      displayName: name,
      photoUrl: photoPreview ?? (removePhoto ? null : savedPhotoPreview),
      eventLogoUrl: convexSiteUrl
        ? `${convexSiteUrl.replace(/\/$/, "")}/event-card-logo?slug=${encodeURIComponent(slug)}`
        : null,
      templateId: card.settings?.templateId,
      palette: {
        background: palette!.background,
        surface: palette!.surface,
        text: palette!.text,
        primary: palette!.primary,
        accent: palette!.accent,
      },
      brandLabel: card.settings?.officialName || "HACKS",
      footerLabel: tr("IDEA  →  BUILD  →  IMPACT"),
    };
  }, [
    card,
    event,
    palette,
    name,
    photoPreview,
    removePhoto,
    savedPhotoPreview,
    tr,
    slug,
  ]);

  if (card === undefined || event === undefined)
    return <p>{tr("Cargando tu card…")}</p>;
  if (!card || !event || !card.settings?.enabled) return null;
  const currentCard = card;

  async function persist(publish: boolean) {
    setBusy(true);
    setMessage("");
    try {
      let photoId = removePhoto ? null : currentCard.photoId;
      if (!publish && currentCard.published)
        await publishMine({ slug, publish: false });
      if (photo) {
        if (!convexSiteUrl) throw new Error("BACKEND_UNAVAILABLE");
        const token = await fetchAccessToken({ forceRefreshToken: false });
        if (!token) throw new Error("FORBIDDEN");
        const response = await fetch(
          `${convexSiteUrl}/social-card-photo-upload?${new URLSearchParams({ slug })}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": photo.type,
            },
            body: photo,
          },
        );
        if (!response.ok) throw new Error("INVALID_FILE");
        photoId = (await response.json()).fileId;
      }
      await saveMine({ slug, displayName: name.trim(), photoId });
      if (publish) await publishMine({ slug, publish: true });
      setPhoto(null);
      setRemovePhoto(false);
      setMessage(
        publish
          ? tr("Card publicada en la galería del evento.")
          : tr("Card guardada en privado."),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      const message: Record<string, string> = {
        BACKEND_UNAVAILABLE: "El servicio de archivos no está disponible.",
        FORBIDDEN: "Vuelve a conectar tu wallet para subir la foto.",
        INVALID_FILE: "Usa una imagen PNG, JPG o WebP de hasta 5 MB.",
        INVALID_CARD_NAME: "Escribe un nombre de al menos 2 caracteres.",
        CARD_PHOTO_NOT_OWNED: "No se pudo validar la foto seleccionada.",
        PERSONAL_GALLERY_DISABLED:
          "La organización no habilitó la galería personal.",
      };
      setMessage(tr(message[code] ?? "No se pudo guardar la card."));
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!canvas.current) return;
    try {
      const file = await socialCardPng(canvas.current, `card-${slug}.png`);
      const href = URL.createObjectURL(file),
        anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setMessage(tr("No se pudo descargar la imagen."));
    }
  }

  async function shareImage() {
    if (!canvas.current || !card || !event) return;
    const file = await socialCardPng(canvas.current, `card-${slug}.png`);
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: event.name,
          text: shareCopy,
          ...(card.published
            ? {
                url: new URL(
                  eventPath(slug, "projects"),
                  window.location.origin,
                ).toString(),
              }
            : {}),
        });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(tr("No se pudo compartir la imagen."));
      }
    } else {
      await download();
    }
  }

  const shareCopy = (
    card.settings.copyText ||
    tr("Estoy participando en {0}", { "0": event.name })
  )
    .replaceAll("{event}", event.name)
    .replaceAll("{name}", name);
  const xHandle = card.settings.socialHandles?.x;
  const linkedinHandle = card.settings.socialHandles?.linkedin;
  const linkedinCopy = [
    shareCopy,
    linkedinHandle ? `@${linkedinHandle.replace(/^@/, "")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const shareX = new URL("https://twitter.com/intent/tweet");
  shareX.searchParams.set(
    "text",
    [shareCopy, xHandle ? `@${xHandle.replace(/^@/, "")}` : ""]
      .filter(Boolean)
      .join(" "),
  );
  if (card.published)
    shareX.searchParams.set(
      "url",
      new URL(eventPath(slug, "projects"), window.location.origin).toString(),
    );

  return (
    <section className="profile-panel personal-card-studio">
      <div className="eyebrow">{tr("TU CARD SOCIAL")}</div>
      <h2>{tr("Comparte que formas parte de {0}", { "0": event.name })}</h2>
      <p>
        {tr(
          "Esta card es privada por defecto. Puedes descargarla sin publicarla; aparecerá en la galería solo si eliges compartirla y el organizador habilitó esa opción.",
        )}
      </p>
      <div className="manage-fields">
        <label>
          {tr("Nombre para mostrar")}
          <input
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {tr("Foto opcional")}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setPhoto(e.target.files?.[0] ?? null);
              setRemovePhoto(false);
            }}
          />
        </label>
        {card.photoId && (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setPhoto(null);
              setRemovePhoto(true);
            }}
          >
            {tr("Quitar foto guardada")}
          </button>
        )}
      </div>
      {data && (
        <SocialCardCanvas
          data={data}
          canvasRef={canvas}
          className="social-card-preview"
        />
      )}
      <div className="manage-actions">
        <Button
          disabled={busy || name.trim().length < 2}
          onClick={() => void persist(false)}
        >
          {busy ? tr("Guardando…") : tr("Guardar en privado")}
        </Button>
        <Button className="button-secondary" onClick={() => void download()}>
          {tr("Descargar PNG")}
        </Button>
        <Button className="button-secondary" onClick={() => void shareImage()}>
          {tr("Compartir imagen")}
        </Button>
        {card.settings.personalGalleryEnabled && (
          <Button
            disabled={busy || name.trim().length < 2}
            onClick={() => void persist(true)}
          >
            {tr(
              card.published
                ? "Actualizar card pública"
                : "Publicar en galería",
            )}
          </Button>
        )}
        {card.published && (
          <Button
            className="button-secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await publishMine({ slug, publish: false });
                setMessage(tr("La card ya no aparece en la galería pública."));
              } finally {
                setBusy(false);
              }
            }}
          >
            {tr("Retirar de la galería")}
          </Button>
        )}
        <a href={shareX.toString()} target="_blank" rel="noreferrer">
          {tr("Compartir en X")}
        </a>
        {card.published && (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              void navigator.clipboard.writeText(linkedinCopy).then(
                () =>
                  setMessage(
                    tr("Copy de LinkedIn copiado; pégalo al publicar."),
                  ),
                () => setMessage(tr("No se pudo copiar el copy de LinkedIn.")),
              );
              window.open(
                `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(new URL(eventPath(slug, "projects"), window.location.origin).toString())}`,
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            {tr("Compartir en LinkedIn")}
          </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      {card.published && (
        <p className="manage-caption">
          {tr("Tu card está visible en la galería de participantes.")}
        </p>
      )}
    </section>
  );
}
