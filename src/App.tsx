import { LanguageSelector, formatCatalogDate, useI18n } from "./i18n/I18n";
import { UnsubscribePage } from "./features/communication/EventCommunication";
import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Link, Routes, Route, useParams, useLocation } from "react-router-dom";
import { useQuery } from "convex/react";
import { ProfilePage } from "./features/auth/ProfilePage";
import { WalletDialog } from "./features/auth/WalletDialog";
import { useWalletAuth } from "./features/auth/AuthProvider";
import { api } from "../convex/_generated/api";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  MapPin,
  CalendarDays,
  Globe2,
  Wallet,
  X,
  ChevronDown,
  Code2,
  Users,
  Flag,
  Check,
  Menu,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { demoEvents, type EventCard } from "./features/events/data";
import { eventDomainSlug, platformPath, EVENT_DOMAIN_BASE } from "./lib/eventUrls";
import type { PageData } from "./features/events/EventPage";
import { WaterRippleBackground } from "./features/events/WaterRippleBackground";
import type { ReactNode } from "react";
const ManagePage = lazy(() =>
  import("./features/manage/ManagePage").then((m) => ({
    default: m.ManagePage,
  })),
);
const OrganizerApplicationPage = lazy(() =>
  import("./features/manage/ManagePage").then((m) => ({
    default: m.OrganizerApplicationPage,
  })),
);
const EventManagePage = lazy(() =>
  import("./features/manage/ManagePage").then((m) => ({
    default: m.EventManagePage,
  })),
);
const StaffInvitePage = lazy(() =>
  import("./features/manage/ManagePage").then((m) => ({
    default: m.StaffInvitePage,
  })),
);
const PublicEventPage = lazy(() =>
  import("./features/events/EventPage").then((m) => ({
    default: m.PublishedEventPage,
  })),
);
const PreviewPage = lazy(() =>
  import("./features/events/EventPage").then((m) => ({
    default: m.PreviewPage,
  })),
);
const RegistrationPage = lazy(() =>
  import("./features/registration/RegistrationPage").then((m) => ({
    default: m.RegistrationPage,
  })),
);
const ParticipantDashboardPage = lazy(() =>
  import("./features/registration/RegistrationPage").then((m) => ({
    default: m.ParticipantDashboardPage,
  })),
);
const AdminPage = lazy(() =>
  import("./features/admin/AdminPage").then((m) => ({ default: m.AdminPage })),
);
const GalleryPage = lazy(() =>
  import("./features/projects/GalleryPage").then((m) => ({
    default: m.GalleryPage,
  })),
);
function DomainRoute({
  data,
  render,
}: {
  data: PageData | null | undefined;
  render: (page: PageData) => ReactNode;
}) {
  const { t: tr } = useI18n();
  if (data === undefined)
    return <section className="simple-page">{tr("Cargando evento…")}</section>;
  if (data === null)
    return (
      <section className="simple-page">
        <h1>{tr("Este subdominio todavía no está conectado a un evento publicado.")}</h1>
        <Link to={`https://${EVENT_DOMAIN_BASE}`}>{tr("Ir a Hacks")}</Link>
      </section>
    );
  return render(data);
}
const listEvents = api.events.list;
function Art({ kind }: { kind: string }) {
  const { t: tr } = useI18n();

  return (
    <div className={`art ${kind}`} aria-hidden="true">
      {kind === "orbit" ? (
        <>
          <div className="orbit-ring r1" />
          <div className="orbit-ring r2" />
          <div className="orbit-ring r3" />
          <div className="planet" />
          <span className="art-coordinate">{tr("STELLAR / LATAM · 2026")}</span>
          <span className="stellar-mark">↗</span>
        </>
      ) : kind === "mesh" ? (
        <>
          <div className="mesh-sphere" />
          <span className="art-coordinate">{tr("HUMAN × MACHINE")}</span>
          <span className="art-word">
            {tr("AI")}
            <span>{tr("for good.")}</span>
          </span>
        </>
      ) : kind === "city" ? (
        <>
          <div className="buildings">
            {Array.from({ length: 11 }, (_, i) => (
              <i key={i} style={{ height: `${35 + ((i * 37) % 65)}%` }} />
            ))}
          </div>
          <span className="art-coordinate">{tr("DESIGN TOMORROW")}</span>
          <span className="art-word city-word">
            {tr("FUTURE")}
            <br />
            {tr("CITIES.")}
          </span>
        </>
      ) : (
        <>
          <div className="code-pattern">
            {"{"}
            <br />
            {tr(" build(together);")}
            <br />
            {"}"}
          </div>
          <span className="art-coordinate">{tr("OPEN BY DEFAULT.")}</span>
        </>
      )}
    </div>
  );
}
function EventTile({ event }: { event: EventCard }) {
  const { t: tr } = useI18n();

  return (
    <Link className="event-card" to={`/e/${event.slug}`}>
      <div className="card-image">
        {event.isDemo && <span className="demo-card-label">{tr("Demo")}</span>}
        <Art kind={event.art} />
        <span className={`status ${event.open ? "" : "soon"}`}>
          <i />
          {event.open ? tr("Registro abierto") : tr("Próximamente")}
        </span>
        <span className="card-arrow">
          <ArrowUpRight size={19} />
        </span>
      </div>
      <div className="card-body">
        <div className="card-eyebrow">
          <span>{tr(event.type)}</span>
          <span>{tr(event.format)}</span>
        </div>
        <h3>{event.name}</h3>
        <p>{event.tagline}</p>
        <div className="card-meta">
          <span>
            <CalendarDays size={14} />
            {formatCatalogDate(event.date)}
          </span>
          <span>
            <MapPin size={14} />
            {event.location}
          </span>
        </div>
        <div className="card-bottom">
          <div className="tags">
            {event.tracks.slice(0, 2).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <strong>{event.prize}</strong>
        </div>
      </div>
    </Link>
  );
}
function Explore({ events, demo }: { events: EventCard[]; demo: boolean }) {
  const { t: tr } = useI18n();

  const [type, setType] = useState("Todos");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("Todos");
  const filtered = events.filter(
    (e) =>
      (type === "Todos" || e.type === type) &&
      (format === "Todos" || e.format === format) &&
      `${e.name} ${e.tracks.join(" ")} ${e.location}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="hero">
        <WaterRippleBackground
          intensity={0.38}
          alt=""
          className="hero-water-bg"
        />
        <div className="hero-grid" />
        <div className="hero-inner">
          <div className="eyebrow">
            <span className="live-dot" />{" "}
            {tr(" EL PUNTO DE ENCUENTRO DE LOS BUILDERS")}
          </div>
          <h1>
            {tr("Las ideas sobran.")}
            <br />
            <span>{tr("Construye la tuya.")}</span>
          </h1>
          <div className="hero-bottom">
            <p>
              {tr("Encuentra tu próximo reto. Conecta con tu equipo.")}
              <br />
              {tr("Convierte lo que imaginas en algo que importa.")}
            </p>
            <Button asChild>
              <a href="#eventos">
                {tr("Explorar eventos ")}
                <ArrowUpRight size={18} />
              </a>
            </Button>
          </div>
        </div>
        <div className="hero-orbits" aria-hidden="true">
          <i />
          <i />
          <i />
          <span className="orbit-core" />
          <b className="orbit-point" />
          <span className="orbit-label">{tr("IDEA → BUILD → IMPACT")}</span>
        </div>
        <div className="hero-index">{tr("01 / DESCUBRE TU PRÓXIMO RETO")}</div>
      </section>
      <div className="community-strip">
        <span>{tr("UN ESPACIO PARA CREAR, SIN LÍMITES.")}</span>
        <div>
          <Code2 size={17} /> {tr(" Builders ")}
          <span className="strip-cross">+</span>
          <Users size={17} /> {tr(" Comunidades ")}
          <span className="strip-cross">+</span>
          <Globe2 size={17} /> {tr(" Latinoamérica y el mundo")}
        </div>
      </div>
      <section id="eventos" className="events-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow muted">{tr("02 / EXPLORA")}</div>
            <h2>
              {tr("Tu próximo gran ")}
              <span>{tr("comienzo.")}</span>
            </h2>
          </div>
          <p>{tr("Un reto. Un equipo. Infinitas posibilidades.")}</p>
        </div>
        <div className="filters">
          <div className="tabs" aria-label={tr("Tipo de evento")}>
            {["Todos", "Hackathon", "Buildathon", "Ideathon", "Bootcamp"].map(
              (t) => (
                <button
                  key={t}
                  className={type === t ? "active" : ""}
                  onClick={() => setType(t)}
                  aria-pressed={type === t}
                >
                  {t === "Todos" ? tr("Todos los eventos") : tr(t) + "s"}
                </button>
              ),
            )}
          </div>
          <div className="filter-inputs">
            <label className="search">
              <Search size={16} />
              <input
                aria-label={tr("Buscar eventos")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr("Buscar evento...")}
              />
            </label>
            <label className="select">
              <select
                aria-label={tr("Modalidad")}
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {["Todos", "Online", "Presencial", "Híbrido"].map((f) => (
                  <option key={f} value={f}>
                    {f === "Todos" ? tr("Modalidad") : tr(f)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>
        <div className="result-line">
          <span>
            {filtered.length} {tr(" eventos")}{" "}
            {demo &&
            !events.some((e) => !demoEvents.some((d) => d.slug === e.slug))
              ? tr("de demostración")
              : tr("disponibles")}
          </span>
          <span>
            {tr("Encuentra dónde dejar tu huella ")}
            <ArrowUpRight size={12} />
          </span>
        </div>
        <div className="event-grid">
          {filtered.map((e) => (
            <EventTile key={e.slug} event={e} />
          ))}
        </div>
        {!filtered.length && (
          <div className="empty">
            <Search size={26} />
            <h3>{tr("No encontramos eventos")}</h3>
            <p>{tr("Prueba con otro término o modalidad.")}</p>
            <Button
              onClick={() => {
                setSearch("");
                setFormat("Todos");
                setType("Todos");
              }}
            >
              {tr("Limpiar filtros")}
            </Button>
          </div>
        )}
      </section>
      <section className="organizer-cta">
        <div className="eyebrow muted">{tr("03 / CREA EL SIGUIENTE")}</div>
        <div className="cta-content">
          <h2>
            {tr("Trae el reto.")}
            <br />
            <span>{tr("Nosotros, el espacio.")}</span>
          </h2>
          <div>
            <p>
              {tr("Hackathons, ideathons, buildathons.")}
              <br />
              {tr("Todo tu evento, desde el primer registro")}
              <br />
              {tr("hasta la última gran idea.")}
            </p>
            <Button asChild>
              <Link to="/organizar">
                {tr("Quiero organizar un evento ")}
                <ArrowUpRight size={18} />
              </Link>
            </Button>
          </div>
        </div>
        <span className="cta-symbol" aria-hidden="true">
          ✳
        </span>
      </section>
    </>
  );
}
function Detail({
  events,
  onWallet,
}: {
  events: EventCard[];
  onWallet: () => void;
}) {
  const { t: tr } = useI18n();

  const { slug } = useParams();
  const event = events.find((e) => e.slug === slug);
  if (!event)
    return (
      <div className="simple-page">
        <h1>{tr("Evento no encontrado")}</h1>
        <Link to="/">{tr("Volver a explorar")}</Link>
      </div>
    );
  return (
    <section className="detail">
      <Link className="back" to="/">
        {tr("← Todos los eventos")}
      </Link>
      <div className="detail-layout">
        <div>
          <div className="eyebrow">
            {tr(event.type)} / {tr(event.format)}
          </div>
          <h1>{event.name}</h1>
          <p className="detail-tagline">{event.tagline}</p>
          <div className="detail-art">
            <Art kind={event.art} />
          </div>
          <h2>{tr("El reto empieza aquí.")}</h2>
          <p>{event.description}</p>
          <div className="tags">
            {event.tracks.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
        <aside>
          <span className="eyebrow">{tr("TU PRÓXIMO RETO")}</span>
          <h3>{event.open ? tr("Registro abierto") : tr("Próximamente")}</h3>
          <p>
            <CalendarDays size={18} />
            {formatCatalogDate(event.date)}
          </p>
          <p>
            <MapPin size={18} />
            {event.location}
          </p>
          <p>
            <Flag size={18} />
            {event.prize}
          </p>
          <Button onClick={onWallet} disabled={!event.open}>
            {event.open
              ? tr("Conectar wallet para participar")
              : tr("Registro aún no disponible")}
            <ArrowUpRight size={16} />
          </Button>
          <small>
            {import.meta.env.VITE_CONVEX_URL &&
            import.meta.env.VITE_DEMO_MODE !== "true"
              ? tr("El registro de participantes llegará en la siguiente fase.")
              : tr("Evento de demostración. No admite registros reales.")}
          </small>
        </aside>
      </div>
    </section>
  );
}
function ConnectedExplore() {
  const { t: tr } = useI18n();

  const events = useQuery(listEvents, {});
  return events === undefined ? (
    <div className="simple-page">{tr("Cargando eventos…")}</div>
  ) : (
    <Explore
      events={
        import.meta.env.VITE_DEMO_MODE === "true"
          ? [
              ...events,
              ...demoEvents.filter(
                (d) => !events.some((e) => e.slug === d.slug),
              ),
            ]
          : events
      }
      demo={import.meta.env.VITE_DEMO_MODE === "true"}
    />
  );
}
function ConnectedDetail({ onWallet }: { onWallet: () => void }) {
  const { t: tr } = useI18n();

  const { slug = "" } = useParams();
  const data = useQuery(api.events.get, { slug });
  if (data === undefined)
    return <div className="simple-page">{tr("Cargando evento…")}</div>;
  if (data) return <PublicEventPage data={data} />;
  return (
    <Detail
      events={import.meta.env.VITE_DEMO_MODE === "true" ? demoEvents : []}
      onWallet={onWallet}
    />
  );
}
export default function App() {
  const { t: tr, language } = useI18n();
  const { pathname } = useLocation();
  useEffect(() => {
    const defaultTitle = "Hacks — Ideas que se construyen";
    if (
      [defaultTitle, "Hacks — Ideas brought to life"].includes(document.title)
    )
      document.title = tr(defaultTitle);
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (description)
      description.content = tr(
        "Encuentra tu próximo hackathon, forma un equipo y construye algo que importe.",
      );
  }, [language, pathname]);

  const [wallet, setWallet] = useState(false);
  const [menu, setMenu] = useState(false);
  const auth = useWalletAuth();
  const closeWallet = useCallback(() => setWallet(false), []);
  const connected = !!import.meta.env.VITE_CONVEX_URL;
  const domainAlias = eventDomainSlug();
  const domainPage = useQuery(
    api.events.getByDomain,
    connected && domainAlias ? { domainSlug: domainAlias } : "skip",
  );
  const platformOrigin = domainAlias ? `https://${EVENT_DOMAIN_BASE}` : "";
  return (
    <>
      <header>
        <Link to="/" className="logo">
          {tr("hacks")}
          <span className="logo-dot">✳</span>
        </Link>
        <nav className={menu ? "nav open" : "nav"}>
          <a href={`${platformOrigin}/#eventos`} onClick={() => setMenu(false)}>
            {tr("Explorar eventos")}
          </a>
          <Link to={platformPath("/como-funciona")} onClick={() => setMenu(false)}>
            {tr("Cómo funciona")}
          </Link>
          <Link to={platformPath("/organizar")} onClick={() => setMenu(false)}>
            {tr("Para organizadores ")}
            <ArrowUpRight size={13} />
          </Link>
          {auth.session && (
            <Link to={platformPath("/perfil")} onClick={() => setMenu(false)}>
              {tr("Mi perfil")}
            </Link>
          )}
          {auth.session && (
            <Link to={platformPath("/manage")} onClick={() => setMenu(false)}>
              {tr("Mi panel")}
            </Link>
          )}
        </nav>
        <div className="header-actions">
          <LanguageSelector />
          <Button className="wallet-button" onClick={() => setWallet(true)}>
            <Wallet size={15} />
            {auth.session
              ? `${auth.session.wallet.slice(0, 5)}…${auth.session.wallet.slice(-5)}`
              : tr("Conectar wallet")}
            <ArrowUpRight size={15} />
          </Button>
          <button
            className="menu-button"
            aria-label={tr("Abrir navegación")}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main>
        <Suspense
          fallback={
            <section className="simple-page">{tr("Cargando…")}</section>
          }
        >
          <Routes>
            {domainAlias && (
              <>
                <Route path="/register" element={<DomainRoute data={connected ? domainPage : null} render={(page) => <RegistrationPage eventSlug={page.slug} onConnect={() => setWallet(true)} />} />} />
                <Route path="/join/:code" element={<DomainRoute data={connected ? domainPage : null} render={(page) => <ParticipantDashboardPage eventSlug={page.slug} onConnect={() => setWallet(true)} />} />} />
                <Route path="/dashboard" element={<DomainRoute data={connected ? domainPage : null} render={(page) => <ParticipantDashboardPage eventSlug={page.slug} onConnect={() => setWallet(true)} />} />} />
                <Route path="/projects" element={<DomainRoute data={connected ? domainPage : null} render={(page) => <GalleryPage eventSlug={page.slug} />} />} />
                <Route path="/preview" element={<DomainRoute data={connected ? domainPage : null} render={(page) => <PreviewPage eventSlug={page.slug} onConnect={() => setWallet(true)} />} />} />
              </>
            )}
            <Route
              path="/admin"
              element={<AdminPage onConnect={() => setWallet(true)} />}
            />
            <Route path="/e/:slug/projects" element={<GalleryPage />} />
            <Route path="/unsubscribe/:token" element={<UnsubscribePage />} />
            <Route
              path="/e/:slug/register"
              element={<RegistrationPage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/e/:slug/join/:code"
              element={
                <ParticipantDashboardPage onConnect={() => setWallet(true)} />
              }
            />
            <Route
              path="/e/:slug/dashboard"
              element={
                <ParticipantDashboardPage onConnect={() => setWallet(true)} />
              }
            />
            <Route
              path="/manage"
              element={domainAlias ? <DomainRoute data={connected ? domainPage : null} render={(page) => <EventManagePage eventSlug={page.slug} onConnect={() => setWallet(true)} />} /> : <ManagePage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/organizar/solicitud"
              element={
                <OrganizerApplicationPage onConnect={() => setWallet(true)} />
              }
            />
            <Route
              path="/e/:slug/manage"
              element={<EventManagePage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/e/:slug/preview"
              element={<PreviewPage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/invite/:token"
              element={<StaffInvitePage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/perfil"
              element={<ProfilePage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/onboarding"
              element={<ProfilePage onConnect={() => setWallet(true)} />}
            />
            <Route
              path="/"
              element={domainAlias ? <DomainRoute data={connected ? domainPage : null} render={(page) => <PublicEventPage data={page} />} /> : (
                connected ? (
                  <ConnectedExplore />
                ) : (
                  <Explore
                    events={
                      import.meta.env.VITE_DEMO_MODE === "true"
                        ? demoEvents
                        : []
                    }
                    demo={import.meta.env.VITE_DEMO_MODE === "true"}
                  />
                )
              )}
            />
            <Route
              path="/e/:slug"
              element={
                connected ? (
                  <ConnectedDetail onWallet={() => setWallet(true)} />
                ) : (
                  <Detail
                    events={
                      import.meta.env.VITE_DEMO_MODE === "true"
                        ? demoEvents
                        : []
                    }
                    onWallet={() => setWallet(true)}
                  />
                )
              }
            />
            <Route
              path="/como-funciona"
              element={
                <section className="simple-page">
                  <div className="eyebrow">{tr("DE LA IDEA AL IMPACTO")}</div>
                  <h1>{tr("Encuentra. Conecta. Construye.")}</h1>
                  <div className="steps">
                    {[
                      [
                        "01",
                        "Encuentra tu reto",
                        "Explora eventos por formato, tecnología o modalidad.",
                      ],
                      [
                        "02",
                        "Forma tu equipo",
                        "Inicia sesión con tu wallet Stellar. La creación de equipos llegará en las siguientes fases.",
                      ],
                      [
                        "03",
                        "Construye y comparte",
                        "Equipos, entregas, mentorías y evaluación llegarán en las siguientes fases.",
                      ],
                    ].map(([n, t, p]) => (
                      <article key={n}>
                        <span>{n}</span>
                        <h2>{tr(t)}</h2>
                        <p>{tr(p)}</p>
                      </article>
                    ))}
                  </div>
                  <Button asChild>
                    <Link to="/">
                      {tr("Explorar eventos ")}
                      <ArrowRight size={16} />
                    </Link>
                  </Button>
                </section>
              }
            />
            <Route
              path="/organizar"
              element={
                <section className="simple-page">
                  <div className="eyebrow">{tr("PARA ORGANIZADORES")}</div>
                  <h1>
                    {tr("Tu comunidad.")}
                    <br />
                    {tr("Tu próximo gran evento.")}
                  </h1>
                  <p>
                    {tr(
                      "Una plataforma para gestionar registros, equipos, proyectos y evaluación desde un solo lugar.",
                    )}
                  </p>
                  <div className="organizer-features">
                    {[
                      "Landing personalizable por evento",
                      "Roles y permisos para tu staff",
                      "Registro, equipos y entregas",
                      "Rúbricas, jurado y resultados",
                    ].map((t) => (
                      <p key={t}>
                        <Check size={17} />
                        {tr(t)}
                      </p>
                    ))}
                  </div>
                  <div className="notice">
                    {tr(
                      "Solicita acceso como organizador y crea tu evento desde una plantilla. Podrás configurar fechas, equipos e invitar a tu staff.",
                    )}
                  </div>
                  <Button asChild>
                    <Link to="/organizar/solicitud">
                      {tr("Solicitar acceso ")}
                      <ArrowUpRight size={16} />
                    </Link>
                  </Button>
                </section>
              }
            />
            <Route
              path="*"
              element={
                <div className="simple-page">
                  <h1>{tr("Página no encontrada")}</h1>
                  <Link to="/">{tr("Volver al inicio")}</Link>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <footer>
        <Link to="/" className="logo">
          {tr("hacks")}
          <span className="logo-dot">✳</span>
        </Link>
        <span>{tr("Ideas que se construyen.")}</span>
        <p>
          © {new Date().getFullYear()} {tr(" Hacks ")}
          <span>{tr("HECHO PARA BUILDERS ↗")}</span>
        </p>
      </footer>
      {wallet && <WalletDialog onClose={closeWallet} />}
    </>
  );
}
