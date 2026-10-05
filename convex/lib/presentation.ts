import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
export const FONTS = [
  "Inter",
  "Space Grotesk",
  "DM Sans",
  "Poppins",
  "Manrope",
];
export const THEME_PRESETS = {
  nocturnal: {
    label: "Nocturno",
    mode: "dark",
    colors: {
      primary: "#ffffff",
      secondary: "#aaaaaa",
      accent: "#b8e8cd",
      background: "#050505",
      surface: "#111111",
      text: "#ffffff",
    },
    fonts: { heading: "Inter", body: "Inter" },
    radius: "md",
  },
  editorial: {
    label: "Editorial",
    mode: "light",
    colors: {
      primary: "#1c1c1b",
      secondary: "#67655e",
      accent: "#b5482d",
      background: "#f4f0e7",
      surface: "#fffdf8",
      text: "#24231f",
    },
    fonts: { heading: "DM Sans", body: "Manrope" },
    radius: "sm",
  },
  electric: {
    label: "Eléctrico",
    mode: "dark",
    colors: {
      primary: "#f2eeff",
      secondary: "#b8b1d8",
      accent: "#80f5e6",
      background: "#0c0b20",
      surface: "#1b1938",
      text: "#f5f2ff",
    },
    fonts: { heading: "Space Grotesk", body: "DM Sans" },
    radius: "lg",
  },
  botanical: {
    label: "Botánico",
    mode: "light",
    colors: {
      primary: "#183d2b",
      secondary: "#68796b",
      accent: "#557d31",
      background: "#f0f3e9",
      surface: "#fbfcf7",
      text: "#203328",
    },
    fonts: { heading: "Manrope", body: "Inter" },
    radius: "full",
  },
} as const;
export const PHASES = [
  "upcoming",
  "registration",
  "building",
  "submission",
  "judging",
  "results",
  "closed",
];
export const PHASE_LABELS = [
  "Próximamente",
  "Registro",
  "Construcción",
  "Entregas",
  "Evaluación",
  "Resultados",
  "Cerrado",
];
export const BLOCKS: Record<
  string,
  { label: string; fields: Record<string, string> }
> = {
  hero: {
    label: "Portada",
    fields: { title: "Título", subtitle: "Subtítulo", eyebrow: "Etiqueta" },
  },
  about: {
    label: "Acerca del evento",
    fields: { title: "Título", markdown: "Markdown" },
  },
  tracks: { label: "Tracks", fields: { title: "Título" } },
  prizes: {
    label: "Premios",
    fields: { title: "Título", markdown: "Markdown" },
  },
  timeline: { label: "Fechas", fields: { title: "Título" } },
  schedule: {
    label: "Agenda",
    fields: {
      title: "Título",
      labels: "Actividades (una por línea)",
      times: "Horarios (uno por línea)",
      descriptions: "Descripciones (una por línea)",
    },
  },
  sponsors: {
    label: "Sponsors",
    fields: {
      title: "Título",
      names: "Nombres (uno por línea)",
      urls: "Enlaces HTTPS (uno por línea)",
    },
  },
  judges: { label: "Jurado", fields: { title: "Título" } },
  mentors: { label: "Mentores", fields: { title: "Título" } },
  faq: {
    label: "Preguntas frecuentes",
    fields: {
      title: "Título",
      questions: "Preguntas (una por línea)",
      answers: "Respuestas (una por línea)",
    },
  },
  resources: { label: "Recursos", fields: { title: "Título" } },
  rules: { label: "Reglas", fields: { title: "Título", markdown: "Markdown" } },
  cta_register: {
    label: "Invitación a participar",
    fields: {
      title: "Título",
      markdown: "Markdown",
      buttonLabel: "Texto del botón",
    },
  },
  gallery: {
    label: "Galería",
    fields: {
      title: "Título",
      imageIds: "Imágenes",
      captions: "Descripciones (una por línea)",
    },
  },
  custom_markdown: {
    label: "Markdown libre",
    fields: { title: "Título", markdown: "Markdown" },
  },
};
export const ARRAY_FIELDS = [
  "labels",
  "times",
  "descriptions",
  "names",
  "urls",
  "questions",
  "answers",
  "imageIds",
  "captions",
];
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function validateTheme(value: Doc<"events">["theme"]) {
  if (
    Object.values(value.colors).some((c) => !/^#[0-9a-f]{6}$/i.test(c)) ||
    !FONTS.includes(value.fonts.body) ||
    !FONTS.includes(value.fonts.heading) ||
    (value.preset !== undefined &&
      value.preset !== "custom" &&
      !Object.hasOwn(THEME_PRESETS, value.preset))
  )
    throw new ConvexError("INVALID_THEME");
}
export function contrast(a: string, b: string) {
  const luminance = (c: string) => {
    const channels = [1, 3, 5]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function validateBlocks(blocks: Doc<"events">["blocks"]) {
  if (
    blocks.length > 40 ||
    new Set(blocks.map((b) => b.id)).size !== blocks.length
  )
    throw new ConvexError("INVALID_BLOCKS");
  let total = 0;
  for (const b of blocks) {
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(b.id) ||
      !BLOCKS[b.type] ||
      (b.visibleFrom && !PHASES.includes(b.visibleFrom))
    )
      throw new ConvexError("INVALID_BLOCK");
    if (
      b.style &&
      [b.style.backgroundColor, b.style.textColor].some(
        (color) => color !== undefined && !/^#[0-9a-f]{6}$/i.test(color),
      )
    )
      throw new ConvexError("INVALID_BLOCK_STYLE");
    for (const [key, value] of Object.entries(b.content)) {
      if (!Object.hasOwn(BLOCKS[b.type].fields, key))
        throw new ConvexError("INVALID_BLOCK_FIELD");
      if (ARRAY_FIELDS.includes(key)) {
        if (
          !Array.isArray(value) ||
          value.length > 24 ||
          value.some(
            (v) =>
              v.length > 1000 || (key === "urls" && v !== "" && !safeUrl(v)),
          )
        )
          throw new ConvexError("INVALID_BLOCK_CONTENT");
      } else if (
        typeof value !== "string" ||
        value.length > (key === "markdown" ? 10000 : 500)
      )
        throw new ConvexError("INVALID_BLOCK_CONTENT");
      total += JSON.stringify(value).length;
    }
    for (const [a, bkey] of [
      ["questions", "answers"],
      ["names", "urls"],
      ["labels", "times"],
      ["imageIds", "captions"],
    ]) {
      const av = b.content[a],
        bv = b.content[bkey];
      if (
        Array.isArray(av) &&
        Array.isArray(bv) &&
        bv.length &&
        av.length !== bv.length
      )
        throw new ConvexError("BLOCK_ROWS_MISMATCH");
    }
  }
  if (total > 100000) throw new ConvexError("PAGE_TOO_LARGE");
}
export function phaseAt(
  event: Pick<Doc<"events">, "timeline" | "status">,
  now: number,
) {
  const t = event.timeline;
  if ((event.status === "archived" || event.status === "suspended")) return "closed";
  if (now < t.registrationOpensAt) return "upcoming";
  if (now < t.startsAt) return "registration";
  if (now < t.submissionOpensAt) return "building";
  if (now < t.submissionClosesAt) return "submission";
  if (now < t.judgingClosesAt) return "judging";
  return t.resultsAt === undefined || now >= t.resultsAt
    ? "results"
    : "judging";
}
export function visibleBlock(
  b: Doc<"events">["blocks"][number],
  phase: string,
) {
  return (
    b.visible &&
    (!b.visibleFrom || PHASES.indexOf(phase) >= PHASES.indexOf(b.visibleFrom))
  );
}
