import type { Doc } from "../_generated/dataModel";
export const EVENT_TYPES = {
  hackathon: "Hackathon",
  ideathon: "Ideathon",
  buildathon: "Buildathon",
  bootcamp: "Bootcamp",
  demo_day: "Demo day",
  other: "Otro",
} as const;
export const TEMPLATE_DESCRIPTIONS = {
  hackathon:
    "Construye un prototipo con tu equipo y presenta repo, demo y video.",
  ideathon: "Explora un problema y presenta una solución con tu pitch deck.",
  buildathon: "Construye y despliega un proyecto con avances semanales.",
  bootcamp: "Aprende por módulos y completa entregas individuales.",
  demo_day: "Presenta tu proyecto y comparte lo que has construido.",
  other: "Diseña una experiencia a la medida de tu comunidad.",
};
export function templateSettings(
  type: Doc<"events">["type"],
): Doc<"events">["settings"] {
  return {
    admission: "manual",
    teamSizeMin: 1,
    teamSizeMax: type === "bootcamp" ? 1 : 5,
    requiredCheckpoints:
      type === "buildathon" ? 4 : type === "bootcamp" ? 1 : 0,
    judgesPerSubmission: type === "bootcamp" ? 1 : 3,
    publicGallery: false,
  };
}
export const DEFAULT_THEME: Doc<"events">["theme"] = {
  preset: "nocturnal",
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
  cursorEffect: { enabled: false, intensity: 0.45 },
};
