import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
const labels: Record<string, string> = {
  pending: "en revisión",
  approved: "aprobada",
  rejected: "rechazada",
  waitlisted: "en lista de espera",
  checked_in: "con check-in confirmado",
  withdrawn: "retirada",
};
export async function enqueue(ctx: MutationCtx, r: Doc<"registrations">) {
  const event = await ctx.db.get(r.eventId);
  if (!event) return;
  const subject = `Tu inscripción en ${event.name}: ${labels[r.status]}`;
  const id = await ctx.db.insert("registrationNotifications", {
    eventId: r.eventId,
    registrationId: r._id,
    userId: r.userId,
    revision: r.revision ?? 1,
    status: r.status,
    subject,
    body: `Hola ${r.nameSnapshot ?? "builder"}. Tu inscripción en ${event.name} está ${labels[r.status]}. Consulta tu estado y tu Hacker Pass en el panel del evento.`,
    delivery: "queued",
  });
  await ctx.scheduler.runAfter(0, internal.registrationEmails.deliver, { id });
}
export async function mark(
  ctx: MutationCtx,
  id: Id<"registrationNotifications">,
  delivery: Doc<"registrationNotifications">["delivery"],
) {
  const row = await ctx.db.get(id);
  if (row?.delivery === "queued") await ctx.db.patch(id, { delivery });
  return null;
}
