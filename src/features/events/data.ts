export type EventCard = {
  slug: string;
  name: string;
  tagline: string;
  type: string;
  format: string;
  location: string;
  date: string;
  prize: string;
  tracks: string[];
  art: string;
  open: boolean;
  description: string;
  isDemo?: boolean;
};
export const demoEvents: EventCard[] = [
  {
    slug: "stellar-build-latam",
    name: "Stellar Build LATAM",
    tagline: "El próximo paso de Web3 empieza contigo.",
    type: "Buildathon",
    format: "Híbrido",
    location: "Lima, Perú + online",
    date: "16 OCT — 08 NOV, 2026",
    prize: "$25,000 USDC",
    tracks: ["Stellar", "Web3", "Soroban"],
    art: "orbit",
    open: true,
    description:
      "Construye soluciones de impacto sobre Stellar y Soroban. Tres semanas para pasar de una idea a un producto, con mentorías técnicas, checkpoints y una comunidad de builders de toda Latinoamérica.",
  },
  {
    slug: "ai-for-good",
    name: "AI for Good",
    tagline: "Inteligencia artificial. Impacto real.",
    type: "Hackathon",
    format: "Online",
    location: "Desde cualquier lugar",
    date: "23 — 25 OCT, 2026",
    prize: "$10,000 USD",
    tracks: ["AI / ML", "Impacto social"],
    art: "mesh",
    open: true,
    description:
      "Un fin de semana para resolver problemas reales con inteligencia artificial. Forma un equipo, explora nuevos modelos y convierte tu propuesta en una demo funcional.",
  },
  {
    slug: "future-cities",
    name: "Future Cities",
    tagline: "Reimagina la ciudad que viene.",
    type: "Ideathon",
    format: "Presencial",
    location: "Bogotá, Colombia",
    date: "07 — 08 NOV, 2026",
    prize: "$5,000 USD",
    tracks: ["Sostenibilidad", "Smart cities"],
    art: "city",
    open: true,
    description:
      "Diseña ideas para ciudades más habitables, inclusivas y sostenibles. Conecta con personas de distintas disciplinas y presenta tu propuesta ante un panel de expertos.",
  },
  {
    slug: "open-source-week",
    name: "Open Source Week",
    tagline: "Construimos mejor cuando construimos juntos.",
    type: "Hackathon",
    format: "Online",
    location: "Desde cualquier lugar",
    date: "16 — 22 NOV, 2026",
    prize: "Mentorías + grants",
    tracks: ["Open source", "Developer tools"],
    art: "code",
    open: false,
    description:
      "Una semana para contribuir a proyectos abiertos y crear herramientas para otros desarrolladores. La colaboración es el punto de partida.",
  },
].map((event) => ({ ...event, isDemo: true }));
