import { useI18n, formatLocale } from "../../i18n/I18n";
import { CommunicationWorkspace } from "../communication/CommunicationWorkspace";
import { TimezoneSelect } from "./TimezoneSelect";
import { JudgingManager } from "../judging/JudgingManager";
import { JudgePanel } from "../judging/JudgePanel";
import {
  TeamsStaff,
  CheckpointsStaff,
  ProjectsReview,
} from "../projects/StaffWorkspace";
import { FormBuilder } from "../registration/FormBuilder";
import { MentorshipManager } from "../content/MentorshipManager";
import { OrganizerSocialCards } from "../cards/OrganizerSocialCards";
import { STATUS as REGISTRATION_LABELS } from "../registration/shared";
import { ReviewPanel } from "../registration/ReviewPanel";
import {
  ThemeEditor,
  BlockEditor,
  PublicationControls,
} from "../content/DesignEditor";
import {
  TracksEditor,
  ResourcesEditor,
  MentorsEditor,
} from "../content/ContentManager";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useAction,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import type { FunctionReturnType } from "convex/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import {
  eventDomainUrl,
  eventPath,
  platformPath,
  EVENT_DOMAIN_BASE,
} from "../../lib/eventUrls";
import {
  EVENT_TYPES,
  TEMPLATE_DESCRIPTIONS,
} from "../../../convex/lib/eventTemplates";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../../convex/lib/permissions";
import { Button } from "../../components/ui/button";
import {
  ArrowUpRight,
  Plus,
  ShieldCheck,
  CalendarDays,
  Users,
  Settings2,
} from "lucide-react";
const ROLE_LABELS: Record<string, string> = {
  owner: "Propietario",
  co_organizer: "Coorganizador",
  reviewer: "Revisor",
  judge_lead: "Líder de jurado",
  judge: "Jurado",
  mentor: "Mentor",
  comms: "Comunicaciones",
  superadmin: "Superadmin",
};
const PERMISSION_LABELS: Record<string, string> = {
  "event.edit": "Editar evento",
  "event.publish": "Publicar evento",
  "event.delete": "Eliminar evento",
  "page.edit": "Editar página",
  "forms.edit": "Editar formularios",
  "resources.manage": "Gestionar recursos",
  "registrations.view": "Ver registros",
  "registrations.review": "Revisar registros",
  "registrations.export": "Exportar registros",
  "teams.manage": "Gestionar equipos",
  "submissions.view": "Ver proyectos",
  "submissions.review": "Revisar proyectos",
  "judges.manage": "Gestionar jurado",
  "judging.assign": "Asignar evaluaciones",
  "judging.score": "Evaluar proyectos",
  "judging.close": "Cerrar evaluación",
  "results.publish": "Publicar resultados",
  "mentors.manage": "Gestionar mentores",
  "email.send": "Enviar correos",
  "announcements.post": "Publicar anuncios",
  "staff.manage": "Gestionar staff",
  "audit.view": "Ver auditoría",
};
const ROLES = [
  "co_organizer",
  "reviewer",
  "judge_lead",
  "judge",
  "mentor",
  "comms",
] as const;
const STATUS_LABELS = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
  suspended: "Suspendido",
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
};
type Me = FunctionReturnType<typeof api.users.me>;
function errorMessage(error: unknown) {
  const text = String(error);
  const messages: Record<string, string> = {
    PROFILE_INCOMPLETE: "Completa tu nombre y verifica tu correo en Mi perfil.",
    APPLICATION_PENDING: "Tu solicitud ya está en revisión.",
    APPLICATION_NOT_PENDING:
      "Esta solicitud ya fue revisada. La lista se actualizará.",
    INVALID_APPLICATION:
      "Introduce una organización y una motivación de entre 30 y 2000 caracteres.",
    INVALID_LINK: "Los enlaces deben ser HTTPS y tener hasta 300 caracteres.",
    EVENT_QUOTA_REACHED:
      "Alcanzaste el límite de eventos activos de tu cuenta.",
    INVALID_SLUG:
      "La URL debe tener entre 3 y 80 caracteres: letras minúsculas, números y guiones.",
    SLUG_TAKEN: "Esa URL ya está en uso. Elige otra.",
    INVALID_EVENT: "Revisa el nombre y la longitud de los textos.",
    INVALID_TIMEZONE:
      "Introduce una zona horaria válida, por ejemplo America/Lima.",
    INVALID_TIMELINE:
      "Revisa el orden de las fechas de registro, construcción, entrega y evaluación.",
    INVALID_SETTINGS:
      "Revisa tamaños de equipo, cupo, checkpoints y cantidad de jurados.",
    LOCATION_REQUIRED: "Indica la ubicación del evento presencial o híbrido.",
    INVALID_WALLET:
      "Introduce una dirección pública Stellar válida que empiece con G.",
    WALLET_MISMATCH:
      "Esta invitación pertenece a otra wallet. Conecta la dirección invitada.",
    INVITE_UNAVAILABLE: "La invitación expiró, fue revocada o ya se utilizó.",
    INVITE_REVOKED:
      "Esta invitación se creó antes de revocar tu acceso. Solicita una nueva.",
    ALREADY_STAFF: "Ya formas parte del staff de este evento.",
    PROTECTED_MEMBER:
      "No puedes cambiar al propietario ni modificar tu propio acceso.",
    PERMISSION_ESCALATION:
      "No puedes delegar un permiso que está fuera de tu acceso.",
    FORBIDDEN: "No tienes permiso para esta acción.",
    NOT_FOUND: "El recurso ya no está disponible.",
    EVENT_ARCHIVED: "El evento está archivado y no admite cambios.",
    INVALID_DOMAIN_SLUG:
      "Usa entre 3 y 20 letras minúsculas, números o guiones; empieza y termina con letra o número.",
    RESERVED_DOMAIN_SLUG: "Ese subdominio está reservado por la plataforma.",
    EVENT_DOMAIN_TAKEN: "Ese subdominio ya está asignado a otro evento.",
  };
  for (const [code, message] of Object.entries(messages))
    if (text.includes(code)) return message;
  return "No pudimos completar la acción. Revisa los datos e inténtalo nuevamente.";
}
function useOperation() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(operation: () => Promise<void>, success = "") {
    setBusy(true);
    setMessage("");
    try {
      await operation();
      setMessage(success);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, run };
}
function Notice({ message }: { message: string }) {
  const { t: tr } = useI18n();

  return (
    <p className="manage-feedback" role="status" aria-live="polite">
      {tr(message)}
    </p>
  );
}
export function SessionGate({
  onConnect,
  children,
}: {
  onConnect: () => void;
  children: (me: Me) => ReactNode;
}) {
  const { t: tr } = useI18n();

  if (!import.meta.env.VITE_CONVEX_URL)
    return (
      <section className="simple-page">
        <h1>{tr("Tu espacio de organización")}</h1>
        <p>{tr("Conecta el servidor para acceder al panel.")}</p>
      </section>
    );
  return (
    <AuthenticatedGate onConnect={onConnect}>{children}</AuthenticatedGate>
  );
}
function AuthenticatedGate({
  onConnect,
  children,
}: {
  onConnect: () => void;
  children: (me: Me) => ReactNode;
}) {
  const { t: tr } = useI18n();

  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (isLoading || (isAuthenticated && !me))
    return (
      <section className="simple-page">
        <p>{tr("Cargando tu espacio…")}</p>
      </section>
    );
  if (!me)
    return (
      <section className="simple-page">
        <div className="eyebrow">{tr("CONSTRUYE EN COMUNIDAD")}</div>
        <h1>
          {tr("Tu próximo evento")}
          <br />
          {tr("empieza aquí.")}
        </h1>
        <p>
          {tr(
            "Conecta tu wallet para organizar un evento o acceder como staff.",
          )}
        </p>
        <Button onClick={onConnect}>{tr("Conectar wallet")}</Button>
      </section>
    );
  return children(me);
}
export function ManagePage({ onConnect }: { onConnect: () => void }) {
  const { t: tr } = useI18n();

  return (
    <SessionGate onConnect={onConnect}>
      {(me) => <Dashboard key={me.id} me={me} />}
    </SessionGate>
  );
}
function Dashboard({ me }: { me: Me }) {
  const { t: tr } = useI18n();

  const [tab, setTab] = useState("events"),
    [creating, setCreating] = useState(false);
  const organizer = me.platformRole !== "user";
  return (
    <section className="simple-page manage-page">
      <div className="eyebrow">{tr("TU ESPACIO DE ORGANIZACIÓN")}</div>
      <div className="manage-title">
        <div>
          <h1>
            {tr("Ideas que reúnen")}
            <br />
            {tr("a una comunidad.")}
          </h1>
          <p>
            {tr("Gestiona tus eventos y los espacios en los que colaboras.")}
          </p>
        </div>
        {organizer && (
          <Button onClick={() => setCreating(!creating)}>
            <Plus size={16} />
            {creating ? tr("Cerrar formulario") : tr("Crear evento")}
          </Button>
        )}
      </div>
      {me.platformRole === "superadmin" && (
        <Link className="manage-back" to="/admin">
          {tr("Administración global →")}
        </Link>
      )}
      {!organizer && (
        <div className="manage-callout">
          <div>
            <strong>{tr("¿Quieres crear tu propio evento?")}</strong>
            <p>
              {tr("Solicita acceso como organizador con tu perfil completo.")}
            </p>
          </div>
          <Button asChild>
            <Link to="/organizar/solicitud">
              {tr("Solicitar acceso ")}
              <ArrowUpRight size={15} />
            </Link>
          </Button>
        </div>
      )}
      {organizer && (
        <p className="manage-caption">
          {me.platformRole === "superadmin"
            ? tr("Acceso de superadmin · todos los eventos")
            : tr("Tu cuenta permite hasta {0} eventos activos.", {
                "0": me.eventLimit,
              })}
        </p>
      )}
      {creating && organizer && (
        <CreateEvent onCreated={() => setCreating(false)} />
      )}
      <nav
        className="manage-tabs manage-dashboard-tabs"
        aria-label={tr("Secciones de organización")}
      >
        <button
          aria-pressed={tab === "events"}
          onClick={() => setTab("events")}
        >
          {tr("Eventos")}
        </button>
        <button
          aria-pressed={tab === "registrations"}
          onClick={() => setTab("registrations")}
        >
          {tr("Mis inscripciones")}
        </button>
        {organizer && (
          <button
            aria-pressed={tab === "organizations"}
            onClick={() => setTab("organizations")}
          >
            {tr("Organizaciones")}
          </button>
        )}
        {me.platformRole === "superadmin" && (
          <button
            aria-pressed={tab === "applications"}
            onClick={() => setTab("applications")}
          >
            {tr("Solicitudes de organizador")}
          </button>
        )}
      </nav>
      {tab === "organizations" && organizer ? (
        <OrganizationsPanel />
      ) : tab === "registrations" ? (
        <MyRegistrations />
      ) : tab === "applications" && me.platformRole === "superadmin" ? (
        <ApplicationsPanel />
      ) : me.platformRole === "superadmin" ? (
        <AdminEventList />
      ) : (
        <OwnEventList />
      )}
    </section>
  );
}

function OrganizationsPanel() {
  const { t: tr } = useI18n();
  const organizations = useQuery(api.organizations.mine, {});
  const create = useMutation(api.organizations.create);
  const add = useMutation(api.organizations.addOrganizer);
  const remove = useMutation(api.organizations.removeOrganizer);
  const attach = useMutation(api.organizations.attachEvent);
  const detach = useMutation(api.organizations.detachEvent);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [wallets, setWallets] = useState<Record<string, string>>({});
  const [eventSlugs, setEventSlugs] = useState<Record<string, string>>({});
  const op = useOperation();
  return (
    <div className="organization-workspace">
      <form
        className="profile-panel manage-create"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await create({ name, slug });
            setName("");
            setSlug("");
          }, "Organización creada.");
        }}
      >
        <h2>{tr("Crear organización")}</h2>
        <p>
          {tr(
            "Comparte la propiedad y gestión de varios eventos con otros organizadores aprobados.",
          )}
        </p>
        <div className="manage-fields">
          <label>
            {tr("Nombre de la organización")}
            <input
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {tr("Identificador URL")}
            <input
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              maxLength={80}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </label>
        </div>
        <Button type="submit">{tr("Crear organización")}</Button>
        <Notice message={op.message} />
      </form>
      {organizations?.map((organization) => (
        <article
          className="profile-panel organization-card"
          key={organization.id}
        >
          <div className="manage-card-top">
            <div>
              <span className="eyebrow">{tr("Organización")}</span>
              <h2>{organization.name}</h2>
              <p className="manage-caption">
                /{organization.slug} ·{" "}
                {tr(
                  organization.role === "owner" ? "Propietario" : "Organizador",
                )}
              </p>
            </div>
          </div>
          <h3>{tr("Organizadores")}</h3>
          <ul className="organization-members">
            {organization.members.map((member) => (
              <li key={member.id}>
                <span>
                  {member.name} ·{" "}
                  <code>
                    {member.wallet.slice(0, 6)}…{member.wallet.slice(-5)}
                  </code>{" "}
                  ·{" "}
                  {tr(member.role === "owner" ? "Propietario" : "Organizador")}
                </span>
                {organization.role === "owner" && member.role !== "owner" && (
                  <Button
                    type="button"
                    onClick={() =>
                      void op.run(async () => {
                        await remove({
                          organizationId: organization.id,
                          userId: member.id,
                        });
                      }, "Organizador retirado.")
                    }
                  >
                    {tr("Retirar")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {organization.role === "owner" && (
            <form
              className="organization-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const wallet = wallets[organization.id]?.trim();
                if (wallet)
                  void op.run(async () => {
                    await add({ organizationId: organization.id, wallet });
                    setWallets({ ...wallets, [organization.id]: "" });
                  }, "Organizador añadido.");
              }}
            >
              <label>
                {tr("Wallet de organizador aprobado")}
                <input
                  required
                  value={wallets[organization.id] ?? ""}
                  onChange={(e) =>
                    setWallets({
                      ...wallets,
                      [organization.id]: e.target.value,
                    })
                  }
                  placeholder="G…"
                />
              </label>
              <Button type="submit">{tr("Añadir organizador")}</Button>
            </form>
          )}
          <h3>{tr("Eventos compartidos")}</h3>
          <ul className="organization-members">
            {organization.events.map((event) => (
              <li key={event.id}>
                <Link to={`/e/${event.slug}/manage`}>
                  {event.name} · /{event.slug}
                </Link>
                {organization.role === "owner" && (
                  <Button
                    type="button"
                    onClick={() =>
                      void op.run(async () => {
                        await detach({
                          organizationId: organization.id,
                          eventId: event.id,
                        });
                      }, "Evento desvinculado.")
                    }
                  >
                    {tr("Desvincular")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {organization.role === "owner" && (
            <form
              className="organization-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const eventSlug = eventSlugs[organization.id]?.trim();
                if (eventSlug)
                  void op.run(async () => {
                    await attach({
                      organizationId: organization.id,
                      slug: eventSlug,
                    });
                    setEventSlugs({ ...eventSlugs, [organization.id]: "" });
                  }, "Evento vinculado.");
              }}
            >
              <label>
                {tr("URL de un evento que gestionas")}
                <input
                  required
                  value={eventSlugs[organization.id] ?? ""}
                  onChange={(e) =>
                    setEventSlugs({
                      ...eventSlugs,
                      [organization.id]: e.target.value,
                    })
                  }
                  placeholder="mi-hackathon"
                />
              </label>
              <Button type="submit">{tr("Compartir evento")}</Button>
            </form>
          )}
          <Notice message={op.message} />
        </article>
      ))}
      {organizations?.length === 0 && (
        <div className="manage-empty">
          <Users size={28} />
          <p>{tr("Aún no formas parte de una organización.")}</p>
        </div>
      )}
    </div>
  );
}
function EventCards({
  events,
  status,
  loadMore,
}: {
  events: FunctionReturnType<typeof api.manage.all>["page"];
  status: string;
  loadMore: () => void;
}) {
  const { t: tr } = useI18n();

  return (
    <>
      <div className="manage-event-grid">
        {events.map((event) => (
          <Link
            className="manage-event-card"
            key={event.id}
            to={`/e/${event.slug}/manage`}
          >
            <div className="manage-card-top">
              <span className="manage-badge">
                {tr(STATUS_LABELS[event.status])}
              </span>
              <ArrowUpRight size={20} />
            </div>
            <span className="eyebrow">{tr(EVENT_TYPES[event.type])}</span>
            <h2>{event.name}</h2>
            <p>{tr(ROLE_LABELS[event.role] ?? event.role)}</p>
            <span className="manage-caption">
              {tr("/e/")}
              {event.slug}
            </span>
          </Link>
        ))}
      </div>
      {status === "LoadingFirstPage" && <p>{tr("Cargando eventos…")}</p>}
      {status !== "LoadingFirstPage" && !events.length && (
        <div className="manage-empty">
          <CalendarDays size={28} />
          <h2>{tr("El próximo evento puede ser el tuyo.")}</h2>
          <p>
            {tr(
              "Cuando crees un evento o aceptes una invitación de staff, aparecerá aquí.",
            )}
          </p>
        </div>
      )}
      {status === "CanLoadMore" && (
        <Button onClick={loadMore}>{tr("Ver más eventos")}</Button>
      )}
    </>
  );
}
function OwnEventList() {
  const { t: tr } = useI18n();

  const result = usePaginatedQuery(
    api.manage.mine,
    {},
    { initialNumItems: 12 },
  );
  return (
    <EventCards
      events={result.results}
      status={result.status}
      loadMore={() => result.loadMore(12)}
    />
  );
}
function AdminEventList() {
  const { t: tr } = useI18n();

  const result = usePaginatedQuery(api.manage.all, {}, { initialNumItems: 12 });
  return (
    <EventCards
      events={result.results}
      status={result.status}
      loadMore={() => result.loadMore(12)}
    />
  );
}
function CreateEvent({ onCreated }: { onCreated: () => void }) {
  const { t: tr } = useI18n();

  const [name, setName] = useState(""),
    [slug, setSlug] = useState(""),
    [type, setType] = useState<Doc<"events">["type"]>("hackathon"),
    [timezone, setTimezone] = useState("America/Lima");
  const create = useMutation(api.manage.create),
    navigate = useNavigate(),
    op = useOperation();
  return (
    <form
      className="profile-panel manage-create"
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(async () => {
          await create({ name, slug, type, timezone });
          onCreated();
          navigate(`/e/${slug.trim().toLowerCase()}/manage`);
        });
      }}
    >
      <h2>{tr("Crear desde una plantilla")}</h2>
      <div className="manage-fields">
        <label>
          {tr("Nombre del evento")}
          <input
            required
            minLength={3}
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (
                !slug ||
                slug ===
                  name
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "")
              )
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, ""),
                );
            }}
          />
        </label>
        <label>
          {tr("URL del evento")}
          <input
            required
            minLength={3}
            maxLength={80}
            aria-label={tr("URL del evento")}
            aria-describedby="create-event-url-help"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <small id="create-event-url-help">
            {tr("/e/")}
            {slug || tr("tu-evento")}
          </small>
        </label>
        <label>
          {tr("Tipo de evento")}
          <select
            aria-label={tr("Tipo de evento")}
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
          >
            {Object.entries(EVENT_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {tr(String(label))}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Zona horaria")}
          <TimezoneSelect
            required
            value={timezone}
            onChange={setTimezone}
            ariaLabel={tr("Zona horaria")}
          />
        </label>
      </div>
      <p>{tr(TEMPLATE_DESCRIPTIONS[type])}</p>
      <p>
        {tr(
          "Se creará como borrador. Podrás ajustar fechas, equipos y admisión.",
        )}
      </p>
      <Button type="submit" disabled={op.busy}>
        {tr("Crear borrador")}
      </Button>
      <Notice message={op.message} />
    </form>
  );
}
export function OrganizerApplicationPage({
  onConnect,
}: {
  onConnect: () => void;
}) {
  const { t: tr } = useI18n();

  return (
    <SessionGate onConnect={onConnect}>
      {(me) => <ApplicationForm me={me} />}
    </SessionGate>
  );
}
function ApplicationForm({ me }: { me: Me }) {
  const { t: tr } = useI18n();

  const application = useQuery(api.organizers.mine, {}),
    submit = useMutation(api.organizers.submit),
    op = useOperation();
  const [org, setOrg] = useState(""),
    [motivation, setMotivation] = useState(""),
    [links, setLinks] = useState("");
  if (me.platformRole !== "user")
    return (
      <section className="simple-page">
        <div className="eyebrow">{tr("ACCESO APROBADO")}</div>
        <h1>{tr("Ya puedes organizar.")}</h1>
        <p>{tr("Crea tu primer evento desde una plantilla.")}</p>
        <Button asChild>
          <Link to={platformPath("/manage")}>{tr("Ir a mi panel")}</Link>
        </Button>
      </section>
    );
  const complete = !!me.name && !!me.emailVerifiedAt;
  return (
    <section className="simple-page manage-page application-page">
      <div className="eyebrow">{tr("PARA ORGANIZADORES")}</div>
      <h1>
        {tr("Haz espacio")}
        <br />
        {tr("para grandes ideas.")}
      </h1>
      <p>
        {tr(
          "Cuéntanos qué quieres construir con tu comunidad. Revisaremos tu solicitud para habilitar la creación de eventos.",
        )}
      </p>
      {!complete && (
        <div className="manage-callout">
          <p>
            {tr(
              "Antes de solicitar acceso, completa tu nombre y verifica tu correo.",
            )}
          </p>
          <Button asChild>
            <Link to="/perfil">{tr("Completar perfil")}</Link>
          </Button>
        </div>
      )}
      {application && (
        <div className="profile-panel application-status">
          <span className="manage-badge">
            {tr(STATUS_LABELS[application.status])}
          </span>
          <h2>{application.org}</h2>
          <p>
            {application.status === "pending"
              ? tr(
                  "Tu solicitud está en revisión. Su estado se actualizará aquí.",
                )
              : application.reviewNote ||
                tr("Puedes preparar y enviar una nueva solicitud.")}
          </p>
        </div>
      )}
      {complete &&
        application !== undefined &&
        application?.status !== "pending" && (
          <form
            className="profile-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void op.run(async () => {
                await submit({
                  org,
                  motivation,
                  links: links
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
              }, "Solicitud enviada.");
            }}
          >
            <label>
              {tr("Organización o comunidad")}
              <input
                required
                minLength={2}
                maxLength={100}
                value={org}
                onChange={(e) => setOrg(e.target.value)}
              />
            </label>
            <label>
              {tr("¿Qué evento quieres organizar?")}
              <textarea
                required
                minLength={30}
                maxLength={2000}
                rows={6}
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
              />
            </label>
            <label>
              {tr("Enlaces de tu comunidad (uno por línea, hasta cinco)")}
              <textarea
                rows={3}
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                placeholder={tr("https://tu-comunidad.com")}
              />
            </label>
            <Button type="submit" disabled={op.busy}>
              {tr("Enviar solicitud")}
            </Button>
            <Notice message={op.message} />
          </form>
        )}
      <Link className="manage-back" to={platformPath("/manage")}>
        {tr("Volver al panel")}
      </Link>
    </section>
  );
}
export function ApplicationsPanel() {
  const { t: tr } = useI18n();

  const [status, setStatus] = useState<"pending" | "approved" | "rejected">(
    "pending",
  );
  const result = usePaginatedQuery(
    api.organizers.list,
    { status },
    { initialNumItems: 10 },
  );
  return (
    <div>
      <label className="manage-filter">
        {tr("Estado de solicitudes")}
        <select
          aria-label={tr("Estado de solicitudes")}
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="pending">{tr("En revisión")}</option>
          <option value="approved">{tr("Aprobadas")}</option>
          <option value="rejected">{tr("Rechazadas")}</option>
        </select>
      </label>
      <div className="manage-list">
        {result.results.map((row) => (
          <ApplicationReview key={row.application._id} row={row} />
        ))}
      </div>
      {result.status === "LoadingFirstPage" ? (
        <p>{tr("Cargando solicitudes…")}</p>
      ) : (
        !result.results.length && (
          <div className="manage-empty">
            <ShieldCheck size={28} />
            <h2>{tr("No hay solicitudes en este estado.")}</h2>
          </div>
        )
      )}
      {result.status === "CanLoadMore" && (
        <Button onClick={() => result.loadMore(10)}>
          {tr("Ver más solicitudes")}
        </Button>
      )}
    </div>
  );
}
function ApplicationReview({
  row,
}: {
  row: FunctionReturnType<typeof api.organizers.list>["page"][number];
}) {
  const { t: tr } = useI18n();

  const [note, setNote] = useState(""),
    [limit, setLimit] = useState(3),
    op = useOperation(),
    review = useMutation(api.organizers.review);
  return (
    <article className="profile-panel">
      <div className="manage-card-top">
        <h2>{row.application.org}</h2>
        <span className="manage-badge">
          {tr(STATUS_LABELS[row.application.status])}
        </span>
      </div>
      <p>
        {row.applicant.name} · {row.applicant.email}
      </p>
      <p className="manage-wallet">{row.applicant.wallet}</p>
      <p className="manage-long-text">{row.application.motivation}</p>
      <div className="manage-links">
        {row.application.links.map((link) => (
          <a key={link} href={link} target="_blank" rel="noopener noreferrer">
            {link} <ArrowUpRight size={13} />
          </a>
        ))}
      </div>
      {row.application.status === "pending" ? (
        <>
          <div className="manage-fields">
            <label>
              {tr("Eventos activos permitidos")}
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>
            <label>
              {tr("Respuesta al solicitante")}
              <textarea
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </div>
          <div className="manage-actions">
            <Button
              disabled={op.busy}
              onClick={() =>
                void op.run(async () => {
                  await review({
                    applicationId: row.application._id,
                    decision: "approved",
                    note,
                    eventLimit: limit,
                  });
                })
              }
            >
              {tr("Aprobar organizador")}
            </Button>
            <Button
              className="manage-outline"
              disabled={op.busy}
              onClick={() =>
                void op.run(async () => {
                  await review({
                    applicationId: row.application._id,
                    decision: "rejected",
                    note,
                    eventLimit: limit,
                  });
                })
              }
            >
              {tr("Rechazar solicitud")}
            </Button>
          </div>
          <Notice message={op.message} />
        </>
      ) : (
        <p>{row.application.reviewNote}</p>
      )}
    </article>
  );
}
export function EventManagePage({
  onConnect,
  eventSlug,
}: {
  onConnect: () => void;
  eventSlug?: string;
}) {
  const { t: tr } = useI18n();

  return (
    <SessionGate onConnect={onConnect}>
      {(me) => <EventManager me={me} eventSlug={eventSlug} />}
    </SessionGate>
  );
}
function EventManager({ me, eventSlug }: { me: Me; eventSlug?: string }) {
  const { t: tr } = useI18n();

  const { slug: routeSlug = "" } = useParams(),
    slug = eventSlug ?? routeSlug,
    detail = useQuery(api.manage.detail, { slug }),
    [tab, setTab] = useState("overview");
  if (detail === undefined)
    return (
      <section className="simple-page">
        <p>{tr("Cargando evento…")}</p>
      </section>
    );
  if (!detail)
    return (
      <section className="simple-page">
        <h1>{tr("Evento no disponible.")}</h1>
        <p>{tr("No tienes acceso a este espacio o el evento no existe.")}</p>
        <Button asChild>
          <Link to={platformPath("/manage")}>{tr("Volver al panel")}</Link>
        </Button>
      </section>
    );
  const tabs = [
    ...(detail.permissions.includes("email.send") ||
    detail.permissions.includes("announcements.post")
      ? [{ id: "communication", label: "Comunicación", icon: Users }]
      : []),
    ...((
      [
        "judges.manage",
        "judging.assign",
        "judging.close",
        "results.publish",
      ] as const
    ).some((p) => detail.permissions.includes(p))
      ? [{ id: "judging", label: "Evaluación", icon: ShieldCheck }]
      : []),
    ...(detail.permissions.includes("judging.score")
      ? [{ id: "myScores", label: "Mis evaluaciones", icon: ShieldCheck }]
      : []),
    ...(detail.permissions.includes("teams.manage")
      ? [{ id: "teams", label: "Equipos", icon: Users }]
      : []),
    ...(detail.permissions.includes("event.edit") ||
    detail.permissions.includes("submissions.view")
      ? [{ id: "checkpoints", label: "Checkpoints", icon: Settings2 }]
      : []),
    ...(detail.permissions.includes("submissions.view")
      ? [{ id: "projects", label: "Proyectos", icon: Settings2 }]
      : []),
    ...(detail.event.status !== "archived" &&
    detail.permissions.includes("forms.edit")
      ? [{ id: "forms", label: "Formularios", icon: Settings2 }]
      : []),
    ...(detail.permissions.includes("registrations.view")
      ? [{ id: "registrations", label: "Participantes", icon: Users }]
      : []),
    { id: "overview", label: "Resumen", icon: CalendarDays },
    ...(detail.permissions.includes("event.edit")
      ? [{ id: "settings", label: "Configuración", icon: Settings2 }]
      : []),
    ...(detail.event.status !== "archived" &&
    detail.permissions.includes("page.edit")
      ? [
          { id: "theme", label: "Tema", icon: Settings2 },
          { id: "page", label: "Página", icon: Settings2 },
        ]
      : []),
    ...(detail.event.status !== "archived" &&
    detail.permissions.includes("resources.manage")
      ? [
          { id: "tracks", label: "Tracks", icon: Settings2 },
          { id: "resources", label: "Recursos", icon: Settings2 },
        ]
      : []),
    ...(detail.event.status !== "archived" &&
    detail.permissions.includes("mentors.manage")
      ? [{ id: "mentors", label: "Mentores", icon: Users }]
      : []),
    ...(detail.permissions.includes("staff.manage")
      ? [{ id: "staff", label: "Staff", icon: Users }]
      : []),
    ...(detail.permissions.includes("audit.view")
      ? [{ id: "audit", label: "Auditoría", icon: ShieldCheck }]
      : []),
  ];
  const active = tabs.some((t) => t.id === tab) ? tab : "overview",
    event = detail.event;
  return (
    <section className="simple-page manage-page">
      <Link className="manage-back" to={platformPath("/manage")}>
        {tr("← Mis eventos")}
      </Link>
      <div className="eyebrow">
        {tr(EVENT_TYPES[event.type])} · {tr(ROLE_LABELS[detail.role])}
      </div>
      <div className="manage-title">
        <h1>{event.name}</h1>
        <span className="manage-badge">{tr(STATUS_LABELS[event.status])}</span>
      </div>
      <nav
        className="manage-tabs manage-dashboard-tabs"
        aria-label={tr("Secciones del evento")}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={active === t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={15} />
            {tr(t.label)}
          </button>
        ))}
      </nav>
      {active === "communication" ? (
        <CommunicationWorkspace
          event={event}
          permissions={detail.permissions}
        />
      ) : active === "judging" ? (
        <JudgingManager event={event} permissions={detail.permissions} />
      ) : active === "myScores" ? (
        <JudgePanel eventId={event._id} />
      ) : active === "teams" ? (
        <TeamsStaff
          eventId={event._id}
          readOnly={event.status !== "published"}
        />
      ) : active === "checkpoints" ? (
        <CheckpointsStaff event={event} permissions={detail.permissions} />
      ) : active === "projects" ? (
        <ProjectsReview
          eventId={event._id}
          canReview={
            detail.permissions.includes("submissions.review") &&
            event.status === "published" &&
            event.judgingStartedAt === undefined &&
            !event.judgingClosed &&
            !event.resultsPublished
          }
        />
      ) : active === "forms" ? (
        <FormBuilder eventId={event._id} />
      ) : active === "registrations" ? (
        <ReviewPanel eventId={event._id} permissions={detail.permissions} />
      ) : active === "theme" ? (
        <ThemeEditor key={event._id} event={event} />
      ) : active === "page" ? (
        <BlockEditor key={event._id} event={event} />
      ) : active === "tracks" ? (
        <TracksEditor eventId={event._id} />
      ) : active === "resources" ? (
        <ResourcesEditor eventId={event._id} />
      ) : active === "mentors" ? (
        <>
          <MentorsEditor eventId={event._id} />
          <MentorshipManager eventId={event._id} />
        </>
      ) : active === "settings" ? (
        <>
          <EventEditor key={event._id} event={event} />
          <EventDomainSettings event={event} />
        </>
      ) : active === "staff" ? (
        <StaffPanel key={event._id} event={event} me={me} />
      ) : active === "audit" ? (
        <AuditPanel eventId={event._id} />
      ) : (
        <EventOverview
          event={event}
          permissions={detail.permissions}
          onSettings={() => setTab("settings")}
        />
      )}
    </section>
  );
}
const DATE_LABELS = {
  registrationOpensAt: "Apertura de registro",
  registrationClosesAt: "Cierre de registro",
  startsAt: "Inicio del evento",
  submissionOpensAt: "Apertura de entregas",
  submissionClosesAt: "Cierre de entregas",
  judgingClosesAt: "Cierre de evaluación",
  resultsAt: "Publicación de resultados",
};
function EventOverview({
  event,
  permissions,
  onSettings,
}: {
  event: Doc<"events">;
  permissions: string[];
  onSettings: () => void;
}) {
  const { t: tr } = useI18n();

  return (
    <div className="manage-overview">
      <div className="profile-panel">
        <h2>{tr("Tu evento, en marcha.")}</h2>
        <p>{event.description}</p>
        <div className="manage-facts">
          <span>
            {event.format === "online" ? tr("Online") : event.location}
          </span>
          <span>
            {tr("Equipos de ")}
            {event.settings.teamSizeMin}–{event.settings.teamSizeMax}
          </span>
          <span>
            {event.settings.requiredCheckpoints} {tr(" checkpoints")}
          </span>
          <span>
            {tr("Zona horaria: ")}
            {event.timezone}
          </span>
        </div>
        <p className="manage-caption">
          {event.status === "draft"
            ? tr(
                "Este borrador es privado. Personaliza su tema y contenido, revisa la vista previa y publícalo cuando esté listo.",
              )
            : tr("Consulta las fechas y el acceso de tu evento.")}
        </p>
        {permissions.includes("event.edit") && (
          <Button onClick={onSettings}>{tr("Configurar evento")}</Button>
        )}
      </div>
      <PublicationControls
        event={event}
        allowed={permissions.includes("event.publish")}
      />
      <div className="profile-panel">
        <h2>{tr("Timeline")}</h2>
        <dl className="manage-timeline">
          {Object.entries(DATE_LABELS).map(([key, label]) => {
            const date = event.timeline[key as keyof typeof event.timeline];
            return date !== undefined ? (
              <div key={key}>
                <dt>{tr(String(label))}</dt>
                <dd>
                  {new Intl.DateTimeFormat(formatLocale(), {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: event.timezone,
                  }).format(date)}
                </dd>
              </div>
            ) : null;
          })}
        </dl>
      </div>
    </div>
  );
}
function EventEditor({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();

  const [form, setForm] = useState({
    name: event.name,
    tagline: event.tagline ?? "",
    description: event.description ?? "",
    format: event.format,
    location: event.location ?? "",
    timezone: event.timezone,
  });
  const [dates, setDates] = useState(
    Object.fromEntries(
      Object.keys(DATE_LABELS).map((key) => {
        const value = event.timeline[key as keyof typeof event.timeline];
        return [
          key,
          value === undefined ? "" : new Date(value).toISOString().slice(0, 16),
        ];
      }),
    ) as Record<keyof typeof DATE_LABELS, string>,
  );
  const [settings, setSettings] = useState(event.settings),
    update = useMutation(api.manage.update),
    op = useOperation();
  return (
    <>
      <form
        className="profile-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            const timeline = {
              registrationOpensAt: Date.parse(dates.registrationOpensAt + "Z"),
              registrationClosesAt: Date.parse(
                dates.registrationClosesAt + "Z",
              ),
              startsAt: Date.parse(dates.startsAt + "Z"),
              submissionOpensAt: Date.parse(dates.submissionOpensAt + "Z"),
              submissionClosesAt: Date.parse(dates.submissionClosesAt + "Z"),
              judgingClosesAt: Date.parse(dates.judgingClosesAt + "Z"),
              ...(dates.resultsAt
                ? { resultsAt: Date.parse(dates.resultsAt + "Z") }
                : {}),
            };
            await update({ eventId: event._id, ...form, timeline, settings });
          }, "Configuración guardada.");
        }}
      >
        <h2>{tr("Información del evento")}</h2>
        <div className="manage-fields">
          <label>
            {tr("Nombre del evento")}
            <input
              required
              minLength={3}
              maxLength={120}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            {tr("Frase de presentación")}
            <input
              maxLength={180}
              value={form.tagline}
              onChange={(e) => setForm({ ...form, tagline: e.target.value })}
            />
          </label>
          <label>
            {tr("Formato")}
            <select
              aria-label={tr("Formato")}
              value={form.format}
              onChange={(e) =>
                setForm({
                  ...form,
                  format: e.target.value as typeof form.format,
                })
              }
            >
              <option value="online">{tr("Online")}</option>
              <option value="onsite">{tr("Presencial")}</option>
              <option value="hybrid">{tr("Híbrido")}</option>
            </select>
          </label>
          <label>
            {tr("Ubicación")}
            <input
              required={form.format !== "online"}
              maxLength={200}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </label>
          <label>
            {tr("Zona horaria del evento")}
            <TimezoneSelect
              required
              value={form.timezone}
              onChange={(timezone) => setForm({ ...form, timezone })}
              ariaLabel={tr("Zona horaria del evento")}
            />
          </label>
        </div>
        <label>
          {tr("Descripción")}
          <textarea
            maxLength={10000}
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <h2>{tr("Fechas en UTC")}</h2>
        <p>
          {tr(
            "Introduce las fechas en UTC. El resumen las muestra en la zona horaria del evento.",
          )}
        </p>
        <div className="manage-fields">
          {Object.entries(DATE_LABELS).map(([key, label]) => (
            <label key={key}>
              {tr(String(label))}
              <input
                type="datetime-local"
                required={key !== "resultsAt"}
                value={dates[key as keyof typeof dates]}
                onChange={(e) => setDates({ ...dates, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <h2>{tr("Equipos y admisión")}</h2>
        <div className="manage-fields">
          <label>
            {tr("Admisión")}
            <select
              aria-label={tr("Admisión")}
              value={settings.admission}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  admission: e.target.value as typeof settings.admission,
                })
              }
            >
              <option value="manual">{tr("Revisión manual")}</option>
              <option value="auto">{tr("Automática")}</option>
              <option value="capped">{tr("Automática con cupo")}</option>
            </select>
          </label>
          <label>
            {tr("Cupo de participantes")}
            <input
              type="number"
              min={1}
              max={100000}
              required={settings.admission === "capped"}
              value={settings.capacity ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  capacity: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </label>
          {(
            [
              {
                key: "teamSizeMin",
                label: "Tamaño mínimo de equipo",
                min: 1,
                max: 20,
              },
              {
                key: "teamSizeMax",
                label: "Tamaño máximo de equipo",
                min: 1,
                max: 20,
              },
              {
                key: "requiredCheckpoints",
                label: "Checkpoints requeridos",
                min: 0,
                max: 52,
              },
              {
                key: "judgesPerSubmission",
                label: "Jurados por proyecto",
                min: 1,
                max: 10,
              },
            ] as const
          ).map((field) => (
            <label key={field.key}>
              {tr(field.label)}
              <input
                type="number"
                required
                min={field.min}
                max={field.max}
                value={settings[field.key]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    [field.key]: Number(e.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="manage-checkbox">
          <input
            type="checkbox"
            checked={settings.publicGallery}
            onChange={(e) =>
              setSettings({ ...settings, publicGallery: e.target.checked })
            }
          />
          {tr("Galería pública de proyectos")}
        </label>
        <Button type="submit" disabled={op.busy}>
          {tr("Guardar configuración")}
        </Button>
        <Notice message={op.message} />
      </form>
      <OrganizerSocialCards event={event} />
    </>
  );
}
function EventDomainSettings({ event }: { event: Doc<"events"> }) {
  const { t: tr } = useI18n();
  const [domainSlug, setDomainSlug] = useState(event.domainSlug ?? "");
  const save = useMutation(api.domains.setSubdomain);
  const op = useOperation();
  useEffect(() => setDomainSlug(event.domainSlug ?? ""), [event.domainSlug]);
  const normalized = domainSlug.trim().toLowerCase();
  return (
    <form
      className="profile-panel event-domain-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void op.run(async () => {
          await save({ eventId: event._id, domainSlug: normalized || null });
        }, "Subdominio guardado.");
      }}
    >
      <h2>{tr("Subdominio propio")}</h2>
      <p>
        {tr(
          "Elige un nombre corto para compartir una dirección fácil de recordar.",
        )}
      </p>
      <label>
        {tr("Identificador del subdominio")}
        <div className="event-domain-input">
          <input
            required
            minLength={3}
            maxLength={20}
            pattern="(?!.*--)[a-z0-9](?:[a-z0-9-]{1,18}[a-z0-9])?"
            autoCapitalize="none"
            autoCorrect="off"
            value={domainSlug}
            onChange={(e) => setDomainSlug(e.target.value.toLowerCase())}
            placeholder="stellar"
          />
          <span>.{EVENT_DOMAIN_BASE}</span>
        </div>
      </label>
      <p className="manage-caption">
        {tr(
          "Admite 3–20 caracteres: letras minúsculas, números y guiones simples.",
        )}
      </p>
      <p>
        {tr(
          "Para que la dirección abra el evento, el dominio base debe tener configurado el wildcard DNS y el hosting debe aceptar subdominios.",
        )}
      </p>
      {normalized && (
        <p>
          <a href={eventDomainUrl(normalized)} target="_blank" rel="noreferrer">
            {eventDomainUrl(normalized)}
          </a>
        </p>
      )}
      <div className="manage-actions">
        <Button type="submit" disabled={op.busy}>
          {tr("Guardar subdominio")}
        </Button>
        {event.domainSlug && (
          <Button
            type="button"
            className="manage-outline"
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                await save({ eventId: event._id, domainSlug: null });
                setDomainSlug("");
              }, "Subdominio quitado.")
            }
          >
            {tr("Quitar subdominio")}
          </Button>
        )}
      </div>
      <Notice message={op.message} />
    </form>
  );
}
function StaffPanel({ event, me }: { event: Doc<"events">; me: Me }) {
  const { t: tr } = useI18n();

  const [role, setRole] = useState<(typeof ROLES)[number]>("co_organizer"),
    [wallet, setWallet] = useState(""),
    [inviteEmail, setInviteEmail] = useState(""),
    [link, setLink] = useState("");
  const invite = useAction(api.staffActions.invite),
    op = useOperation();
  const members = usePaginatedQuery(
    api.staff.list,
    { eventId: event._id },
    { initialNumItems: 20 },
  );
  return (
    <>
      <form
        className="profile-panel"
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            const result = await invite({
              eventId: event._id,
              role,
              ...(inviteEmail.trim() ? { email: inviteEmail.trim() } : {}),
              ...(wallet.trim() ? { wallet: wallet.trim() } : {}),
            });
            setLink(
              new URL(`/invite/${result.token}`, window.location.origin).href,
            );
          }, "Invitación creada. Comparte el enlace con la persona invitada.");
        }}
      >
        <h2>{tr("Invitar al staff")}</h2>
        <p>
          {tr(
            "Los enlaces duran tres días y se utilizan una sola vez. Si indicas una wallet, solo esa dirección puede aceptarlos.",
          )}
        </p>
        <div className="manage-fields">
          <label>
            {tr("Rol de la invitación")}
            <select
              aria-label={tr("Rol de la invitación")}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(ROLE_LABELS[r])}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Correo de la invitación (opcional)")}
            <input
              type="email"
              maxLength={254}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </label>
          <label>
            {tr("Wallet invitada (opcional)")}
            <input
              maxLength={56}
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
              placeholder={tr("G…")}
            />
          </label>
        </div>
        <Button type="submit" disabled={op.busy}>
          {tr("Crear invitación")}
        </Button>
        {link && (
          <div className="manage-invite-link">
            <label>
              {tr("Enlace de invitación")}
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <Button
              className="manage-outline"
              type="button"
              onClick={() =>
                void op.run(async () => {
                  await navigator.clipboard.writeText(link);
                }, "Enlace copiado.")
              }
            >
              {tr("Copiar enlace")}
            </Button>
            <p>
              {tr(
                "El enlace completo solo se muestra al crearlo. Genera otro si lo pierdes.",
              )}
            </p>
          </div>
        )}
        <Notice message={op.message} />
      </form>
      <h2 className="manage-section-title">{tr("Equipo de organización")}</h2>
      <div className="manage-list">
        {members.results.map((row) => (
          <StaffMember
            key={row.member._id}
            row={row}
            eventId={event._id}
            currentId={me.id}
          />
        ))}
      </div>
      {members.status === "CanLoadMore" && (
        <Button onClick={() => members.loadMore(20)}>
          {tr("Ver más miembros")}
        </Button>
      )}
      <InvitationsList eventId={event._id} />
    </>
  );
}
function StaffMember({
  row,
  eventId,
  currentId,
}: {
  row: FunctionReturnType<typeof api.staff.list>["page"][number];
  eventId: Id<"events">;
  currentId: Id<"users">;
}) {
  const { t: tr } = useI18n();

  const protectedMember =
    row.member.role === "owner" || row.member.userId === currentId;
  const [role, setRole] = useState<(typeof ROLES)[number]>(
      row.member.role === "owner" ? "co_organizer" : row.member.role,
    ),
    [extra, setExtra] = useState(row.member.extraPermissions ?? []),
    [revoked, setRevoked] = useState(row.member.revokedPermissions ?? []);
  const update = useMutation(api.staff.update),
    revoke = useMutation(api.staff.revoke),
    op = useOperation();
  return (
    <article className="profile-panel">
      <div className="manage-card-top">
        <h3>{row.name}</h3>
        <span className="manage-badge">{tr(ROLE_LABELS[row.member.role])}</span>
      </div>
      <p className="manage-wallet">{row.wallet}</p>
      {!protectedMember && (
        <details>
          <summary>{tr("Editar rol y permisos")}</summary>
          <label>
            {tr("Rol del miembro")}
            <select
              aria-label={tr("Rol del miembro")}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as typeof role);
                setExtra([]);
                setRevoked([]);
              }}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr(ROLE_LABELS[r])}
                </option>
              ))}
            </select>
          </label>
          <div className="manage-permissions">
            {PERMISSIONS.map((permission) => (
              <label className="manage-checkbox" key={permission}>
                <input
                  type="checkbox"
                  checked={
                    !revoked.includes(permission) &&
                    (ROLE_PERMISSIONS[role].includes(permission) ||
                      extra.includes(permission))
                  }
                  onChange={(e) => {
                    if (ROLE_PERMISSIONS[role].includes(permission))
                      setRevoked(
                        e.target.checked
                          ? revoked.filter((p) => p !== permission)
                          : [...revoked, permission],
                      );
                    else
                      setExtra(
                        e.target.checked
                          ? [...extra, permission]
                          : extra.filter((p) => p !== permission),
                      );
                  }}
                />
                {tr(PERMISSION_LABELS[permission])}
              </label>
            ))}
          </div>
          <div className="manage-actions">
            <Button
              disabled={op.busy}
              onClick={() =>
                void op.run(async () => {
                  await update({
                    eventId,
                    memberId: row.member._id,
                    role,
                    extraPermissions: extra,
                    revokedPermissions: revoked,
                  });
                }, "Permisos guardados.")
              }
            >
              {tr("Guardar permisos")}
            </Button>
            <Button
              className="manage-outline"
              disabled={op.busy}
              onClick={() =>
                void op.run(async () => {
                  await revoke({ eventId, memberId: row.member._id });
                })
              }
            >
              {tr("Revocar acceso")}
            </Button>
          </div>
          <Notice message={op.message} />
        </details>
      )}
    </article>
  );
}
function InvitationsList({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const result = usePaginatedQuery(
    api.staff.invitations,
    { eventId },
    { initialNumItems: 10 },
  );
  const revoke = useMutation(api.staff.revokeInvite),
    op = useOperation();
  return (
    <>
      <h2 className="manage-section-title">{tr("Invitaciones")}</h2>
      <div className="manage-list">
        {result.results.map((invite) => (
          <article className="profile-panel manage-invite-row" key={invite.id}>
            <div>
              <strong>{tr(ROLE_LABELS[invite.role])}</strong>
              <p className="manage-wallet">
                {invite.wallet ?? tr("Cualquier wallet con el enlace")}
              </p>
              <p>
                {invite.claimed
                  ? tr("Aceptada")
                  : invite.revoked
                    ? tr("Revocada")
                    : tr("Válida hasta {0}", {
                        "0": new Date(invite.expiresAt).toLocaleString(
                          formatLocale(),
                        ),
                      })}
              </p>
            </div>
            {!invite.claimed && !invite.revoked && (
              <Button
                className="manage-outline"
                disabled={op.busy}
                onClick={() =>
                  void op.run(async () => {
                    await revoke({ eventId, inviteId: invite.id });
                  }, "Invitación revocada.")
                }
              >
                {tr("Revocar invitación")}
              </Button>
            )}
          </article>
        ))}
      </div>
      {!result.results.length && result.status !== "LoadingFirstPage" && (
        <p>{tr("Todavía no hay invitaciones.")}</p>
      )}
      <Notice message={op.message} />
      {result.status === "CanLoadMore" && (
        <Button onClick={() => result.loadMore(10)}>
          {tr("Ver más invitaciones")}
        </Button>
      )}
    </>
  );
}
function AuditPanel({ eventId }: { eventId: Id<"events"> }) {
  const { t: tr } = useI18n();

  const result = usePaginatedQuery(
    api.manage.audit,
    { eventId },
    { initialNumItems: 20 },
  );
  const labels: Record<string, string> = {
    "event.create": "Evento creado",
    "event.update": "Configuración actualizada",
    "event.status": "Estado de publicación actualizado",
    "theme.update": "Tema actualizado",
    "page.update": "Página actualizada",
    "track.save": "Track guardado",
    "track.remove": "Track eliminado",
    "resource.save": "Recurso guardado",
    "resource.remove": "Recurso eliminado",
    "mentor.save": "Mentor guardado",
    "mentor.remove": "Mentor eliminado",
    "staff.accept": "Invitación aceptada",
    "staff.update": "Permisos de staff actualizados",
    "staff.revoke": "Acceso de staff revocado",
    "staff.invite.revoke": "Invitación revocada",
  };
  return (
    <div className="profile-panel">
      <h2>{tr("Actividad del evento")}</h2>
      <p>
        {tr(
          "Los cambios del propietario, el staff y el superadmin quedan registrados.",
        )}
      </p>
      <ol className="manage-audit">
        {result.results.map((log) => (
          <li key={log._id}>
            <strong>
              {tr(labels[log.action]) ||
                tr(
                  log.action.startsWith("staff.invite.")
                    ? tr("Invitación creada: {0}", {
                        "0": tr(
                          ROLE_LABELS[log.action.slice(13)] ?? log.action,
                        ),
                      })
                    : log.action,
                )}
            </strong>
            <time dateTime={new Date(log.at).toISOString()}>
              {new Date(log.at).toLocaleString(formatLocale())}
            </time>
            <span className="manage-caption">
              {tr("Por ")}
              {log.actorName}
            </span>
          </li>
        ))}
      </ol>
      {!result.results.length && result.status !== "LoadingFirstPage" && (
        <p>{tr("No hay actividad todavía.")}</p>
      )}
      {result.status === "CanLoadMore" && (
        <Button onClick={() => result.loadMore(20)}>
          {tr("Ver más actividad")}
        </Button>
      )}
    </div>
  );
}
export function StaffInvitePage({ onConnect }: { onConnect: () => void }) {
  const { t: tr } = useI18n();

  return (
    <SessionGate onConnect={onConnect}>{() => <AcceptInvite />}</SessionGate>
  );
}
function AcceptInvite() {
  const { t: tr } = useI18n();

  const { token = "" } = useParams(),
    preview = useAction(api.staffActions.preview),
    accept = useAction(api.staffActions.accept),
    navigate = useNavigate(),
    op = useOperation();
  const [info, setInfo] = useState<
    FunctionReturnType<typeof api.staffActions.preview> | undefined
  >(undefined);
  useEffect(() => {
    let alive = true;
    setInfo(undefined);
    void preview({ token })
      .then((result) => {
        if (alive) setInfo(result);
      })
      .catch(() => {
        if (alive) setInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [token, preview]);
  return (
    <section className="simple-page manage-page application-page">
      <div className="eyebrow">{tr("UNA INVITACIÓN A CONSTRUIR")}</div>
      <h1>{info?.eventName ?? tr("Únete al staff.")}</h1>
      {info === undefined ? (
        <p>{tr("Cargando invitación…")}</p>
      ) : !info || info.expiresAt <= Date.now() ? (
        <>
          <p>
            {tr(
              "Esta invitación ya no está disponible. Solicita un enlace nuevo.",
            )}
          </p>
          <Button asChild>
            <Link to="/manage">{tr("Ir a mi panel")}</Link>
          </Button>
        </>
      ) : (
        <div className="profile-panel">
          <h2>{tr(ROLE_LABELS[info.role])}</h2>
          <p>
            {tr(
              "Al aceptar, podrás acceder al panel de este evento con los permisos del rol invitado.",
            )}
          </p>
          <Button
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                const slug = await accept({ token });
                navigate(eventPath(slug, "manage"), { replace: true });
              })
            }
          >
            {tr("Aceptar invitación")}
          </Button>
          <Notice message={op.message} />
        </div>
      )}
    </section>
  );
}

function MyRegistrations() {
  const { t: tr } = useI18n();

  const { results, status, loadMore } = usePaginatedQuery(
    api.registrations.myEvents,
    {},
    { initialNumItems: 20 },
  );
  return (
    <div className="manage-event-grid">
      {results.map((r) => (
        <Link
          className="manage-event-card"
          to={`/e/${r.slug}/dashboard`}
          key={r.id}
        >
          <span className="manage-badge">
            {tr(REGISTRATION_LABELS[r.status])}
          </span>
          <h2>{r.name}</h2>
          <p>{tr("Ver mi inscripción y Hacker Pass →")}</p>
        </Link>
      ))}
      {status === "LoadingFirstPage" && <p>{tr("Cargando inscripciones…")}</p>}
      {status === "Exhausted" && !results.length && (
        <p>
          {tr(
            "Todavía no tienes inscripciones. Explora un evento para encontrar tu próximo reto.",
          )}
        </p>
      )}
      {status === "CanLoadMore" && (
        <Button onClick={() => loadMore(20)}>
          {tr("Cargar más inscripciones")}
        </Button>
      )}
    </div>
  );
}
