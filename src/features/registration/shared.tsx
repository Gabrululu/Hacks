import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { useWalletAuth } from "../auth/AuthProvider";
import { convexSiteUrl } from "../../lib/backend";
export type Registration = NonNullable<
  FunctionReturnType<typeof api.registrations.mine>
>;
export const STATUS: Record<Registration["status"], string> = {
  pending: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  waitlisted: "Lista de espera",
  checked_in: "Check-in confirmado",
  withdrawn: "Retirada",
};
export function registrationError(error: unknown) {
  const text = String(error);
  const messages: Record<string, string> = {
    INVALID_RUBRIC:
      "Define entre 1 y 20 criterios con nombres, pesos positivos y escalas válidas.",
    INVALID_ROUND:
      "Revisa el nombre, el orden y el mínimo de evaluaciones de la ronda.",
    ROUND_LOCKED:
      "La ronda está cerrada, ya empezó o tiene una asignación automática en curso.",
    JUDGING_CONFLICT:
      "La evaluación cambió en otra sesión. Recarga antes de guardar.",
    JUDGING_STARTED:
      "Las fechas y reglas quedan fijadas desde la primera asignación del jurado.",
    JUDGING_NOT_AVAILABLE:
      "La evaluación abre después del cierre de entregas y antes de la fecha límite del jurado.",
    JUDGING_CLOSED:
      "El puntaje no admite cambios: la ronda está cerrada o terminó el plazo.",
    CONFLICT_OF_INTEREST:
      "Un juez no puede evaluar un proyecto de su propio equipo.",
    INVALID_JUDGE:
      "El juez no tiene acceso activo para evaluar en este evento.",
    PROJECT_NOT_ADMITTED: "Solo pueden asignarse entregas admitidas.",
    PROJECT_VERSION_MISSING:
      "La entrega no tiene una versión final disponible.",
    INVALID_ASSIGNMENT_CONFIG:
      "Selecciona hasta 20 jueces, 1–10 por proyecto y un máximo de 1–100 proyectos por juez.",
    PREVIOUS_ROUND_OPEN:
      "Cierra las rondas anteriores y espera sus rankings antes de abrir esta ronda.",
    ASSIGNMENTS_REQUIRED:
      "Asigna al menos un proyecto antes de abrir la ronda.",
    INVALID_SCORE: "Puntúa cada criterio dentro de su escala.",
    INVALID_ABSTENTION: "Escribe un motivo válido para abstenerte.",
    JUDGE_ABSTAINED: "Este juez ya se abstuvo de esta asignación.",
    SCORED_ASSIGNMENT_LOCKED:
      "Ya se guardó un puntaje; contacta al responsable si detectas un conflicto.",
    EVALUATIONS_PENDING:
      "Hay evaluaciones pendientes. Complétalas o marca explícitamente el cierre con pendientes.",
    ROUNDS_NOT_CLOSED:
      "Cierra todas las rondas y espera la generación de sus rankings.",
    RESULTS_NOT_READY:
      "Cierra la evaluación y genera el ranking antes de publicar resultados.",
    FINAL_ROUND_REQUIRED: "Publica el ranking de la última ronda del evento.",
    NOT_ENOUGH_RESULTS:
      "No hay suficientes proyectos clasificados para este número de ganadores.",
    RESULTS_ALREADY_PUBLISHED:
      "Los resultados ya publicados no se pueden cambiar.",
    ROUND_ORDER_TAKEN: "Cada ronda necesita un orden diferente.",
    INVALID_TRACK: "Selecciona únicamente tracks de este evento.",
    INVALID_CHECKPOINT:
      "Revisa el título y la fecha; el checkpoint debe cerrar entre el inicio del evento y el cierre de entregas.",
    PROJECT_NOT_SUBMITTED: "Guarda y entrega el proyecto antes de revisarlo.",
    UPLOAD_LIMIT: "El equipo alcanzó el límite de archivos preparados.",
    INVALID_TEAM: "El nombre del equipo debe tener entre 3 y 80 caracteres.",
    INVALID_PROJECT_URL:
      "Los enlaces del proyecto deben usar HTTPS y no incluir credenciales.",
    INVALID_PROJECT:
      "Revisa el título, resumen, tracks, imágenes y contrato del proyecto.",
    CHECKPOINT_IN_USE:
      "Este checkpoint ya tiene respuestas; conserva su configuración.",
    PROJECT_CONFLICT:
      "Otra sesión modificó esta respuesta. Recarga antes de guardar.",
    PROJECT_TEAM_LOCKED:
      "Después de la primera entrega, el equipo y sus checkpoints quedan cerrados.",
    CHECKPOINT_REVIEW_LOCKED:
      "Este equipo ya entregó su proyecto; sus checkpoints están cerrados.",
    ALREADY_IN_TEAM: "Ya perteneces a un equipo en este evento.",
    INVALID_JOIN_CODE:
      "El código no corresponde a un equipo disponible de este evento.",
    TEAM_FULL: "El equipo superaría el número máximo de integrantes.",
    TEAM_LEADER_REQUIRED: "Solo el líder puede realizar esta acción.",
    TRANSFER_LEADERSHIP_FIRST:
      "Transfiere el liderazgo antes de salir del equipo.",
    TEAM_SIZE_INVALID:
      "El equipo no cumple el tamaño mínimo o máximo del evento.",
    CHECKPOINT_GATE:
      "Completa los checkpoints requeridos y espera su aceptación antes de entregar.",
    CHECKPOINT_CLOSED:
      "El plazo del checkpoint ha terminado o el evento aún no empieza.",
    SUBMISSION_CLOSED:
      "La entrega no está disponible en este momento. Revisa las fechas del evento.",
    TEAMS_CLOSED: "Ha cerrado el plazo para formar equipos.",
    MERGE_ALREADY_PENDING:
      "Tu equipo ya tiene una solicitud de fusión pendiente.",
    MERGE_LEADER_CHANGED:
      "Cambió el líder del equipo de origen. Solicita una nueva fusión.",
    INVALID_MERGE: "Selecciona dos equipos activos del mismo evento.",
    REVIEW_REASON_REQUIRED: "Escribe un motivo para rechazar o descalificar.",
    REVIEW_CLOSED: "La revisión de este evento está cerrada.",
    CHECKPOINT_HAS_RESPONSES:
      "Este checkpoint ya tiene respuestas; conserva su configuración.",
    INVALID_FILE:
      "El archivo no cumple el formato, tamaño o permisos necesarios.",
    REGISTRATION_NOT_APPROVED:
      "La inscripción debe estar aprobada para participar en un equipo.",
    QR_IMAGE_UNREADABLE:
      "No se encontró un QR legible en la imagen. Carga el pase original o pega su código.",
    CAPACITY_REACHED: "No hay suficientes cupos para aprobar esta selección.",
    FORM_CHANGED:
      "El formulario cambió. Revisa la nueva versión antes de enviar.",
    FORM_CONFLICT:
      "Otro editor guardó cambios. Recarga el formulario antes de continuar.",
    RETIRED_FIELD_ID:
      "Un campo eliminado no puede reutilizarse con el mismo identificador.",
    INVALID_ANSWER: "Revisa las respuestas obligatorias y sus formatos.",
    INVALID_CONDITION:
      "La condición debe depender de un campo anterior y un valor válido.",
    PROFILE_INCOMPLETE:
      "Completa tu nombre y verifica tu correo para inscribirte.",
    CONSENT_REQUIRED: "Debes aceptar las reglas y el consentimiento de datos.",
    REGISTRATION_CLOSED: "El registro está cerrado.",
    ALREADY_REGISTERED: "Ya tienes una inscripción en este evento.",
    FORBIDDEN: "No tienes permiso para esta acción.",
    INVALID_PASS: "El pase es inválido, ha vencido o pertenece a otro evento.",
    CHECKIN_CLOSED: "El check-in no está disponible en este momento.",
    NOT_APPROVED: "Solo los participantes aprobados pueden hacer check-in.",
    INVALID_TRANSITION:
      "Una inscripción retirada o con check-in no puede cambiar de estado.",
    UNSAFE_PATTERN: "Usa un patrón simple, por ejemplo ^[A-Z]+$.",
    EVENT_NOT_STARTED: "El check-in abre al inicio del evento.",
    EVENT_NOT_PUBLISHED: "El evento no está publicado.",
    EVENT_NOT_AVAILABLE: "El evento no está publicado.",
    PASS_EXPIRED: "El pase ha vencido.",
  };
  return (
    Object.entries(messages).find(([code]) => text.includes(code))?.[1] ??
    "No se pudo completar la acción. Revisa los campos e inténtalo nuevamente."
  );
}
export function useRegistrationOperation() {
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
        setMessage(registrationError(e));
      } finally {
        setBusy(false);
      }
    },
  };
}
export function Responses({ registration: r }: { registration: Registration }) {
  const { t: tr } = useI18n();

  const auth = useWalletAuth(),
    op = useRegistrationOperation();
  return (
    <div>
      <dl className="registration-answers">
        {r.fields
          .filter((f) => Object.hasOwn(r.answers, f.id))
          .map((f) => (
            <div key={f.id}>
              <dt>{f.label}</dt>
              <dd>
                {f.type === "file" ? (
                  <button
                    className="text-link"
                    onClick={() =>
                      void op.run(async () => {
                        const token = await auth.fetchAccessToken({
                          forceRefreshToken: false,
                        });
                        if (!token) throw Error("FORBIDDEN");
                        const response = await fetch(
                          `${convexSiteUrl}/registration-file?registrationId=${r.id}&fieldId=${encodeURIComponent(f.id)}`,
                          { headers: { Authorization: `Bearer ${token}` } },
                        );
                        if (!response.ok) throw Error("FORBIDDEN");
                        const url = URL.createObjectURL(await response.blob()),
                          a = document.createElement("a");
                        a.href = url;
                        const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(
                          response.headers.get("Content-Disposition") ?? "",
                        )?.[1];
                        a.download = encodedName
                          ? decodeURIComponent(encodedName)
                          : "archivo-inscripcion";
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }, "Archivo descargado.")
                    }
                  >
                    {tr("Descargar archivo privado")}
                  </button>
                ) : Array.isArray(r.answers[f.id]) ? (
                  (r.answers[f.id] as string[])
                    .map(
                      (value) =>
                        f.options?.find((o) => o.value === value)?.label ??
                        value,
                    )
                    .join(", ")
                ) : typeof r.answers[f.id] === "boolean" ? (
                  r.answers[f.id] ? (
                    "Sí"
                  ) : (
                    "No"
                  )
                ) : (
                  (f.options?.find((o) => o.value === r.answers[f.id])?.label ??
                  String(r.answers[f.id] ?? "—"))
                )}
              </dd>
            </div>
          ))}
      </dl>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </div>
  );
}
