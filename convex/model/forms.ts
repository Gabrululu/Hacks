import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  validateFields,
  DEFAULT_CONSENT,
  DEFAULT_RULES,
  type Field,
} from "../lib/formEngine";
import { editable } from "./contentShared";
export async function versions(
  ctx: QueryCtx,
  eventId: Id<"events">,
  kind: Doc<"forms">["kind"],
) {
  return ctx.db
    .query("forms")
    .withIndex("by_event_kind_and_version", (q) =>
      q.eq("eventId", eventId).eq("kind", kind),
    )
    .order("desc")
    .take(100);
}
export async function published(
  ctx: QueryCtx,
  eventId: Id<"events">,
  kind: Doc<"forms">["kind"] = "registration",
) {
  return (
    (await versions(ctx, eventId, kind)).find(
      (f) => f.publishedAt !== undefined,
    ) ?? null
  );
}
export async function save(
  ctx: MutationCtx,
  eventId: Id<"events">,
  kind: Doc<"forms">["kind"],
  expectedRevision: number,
  fields: Field[],
  consentText: string,
  rulesText: string,
) {
  await editable(ctx, eventId);
  validateFields(fields);
  if (
    consentText.trim().length < 20 ||
    consentText.length > 5000 ||
    rulesText.trim().length < 10 ||
    rulesText.length > 5000
  )
    throw new ConvexError("INVALID_CONSENT_TEXT");
  const history = await versions(ctx, eventId, kind),
    latest = history[0];
  if ((latest?.revision ?? 0) !== expectedRevision)
    throw new ConvexError("FORM_CONFLICT");
  for (const f of fields) {
    const old = history.flatMap((v) => v.fields).find((o) => o.id === f.id);
    if (
      old &&
      (old.type !== f.type || !latest.fields.some((o) => o.id === f.id))
    )
      throw new ConvexError("RETIRED_FIELD_ID");
  }
  const input = {
    eventId,
    kind,
    fields,
    consentText: consentText.trim(),
    rulesText: rulesText.trim(),
    revision: expectedRevision + 1,
  };
  if (latest && latest.publishedAt === undefined) {
    await ctx.db.patch(latest._id, input);
    return latest._id;
  }
  if (history.length >= 100) throw new ConvexError("FORM_VERSION_LIMIT");
  return ctx.db.insert("forms", {
    ...input,
    version: (latest?.version ?? 0) + 1,
  });
}
export async function publish(
  ctx: MutationCtx,
  eventId: Id<"events">,
  id: Id<"forms">,
  expectedRevision: number,
) {
  await editable(ctx, eventId);
  const form = await ctx.db.get(id);
  if (!form || form.eventId !== eventId) throw new ConvexError("NOT_FOUND");
  const latest = (await versions(ctx, eventId, form.kind))[0];
  if (
    latest._id !== id ||
    form.publishedAt !== undefined ||
    (form.revision ?? 0) !== expectedRevision
  )
    throw new ConvexError("FORM_CONFLICT");
  validateFields(form.fields);
  await ctx.db.patch(id, {
    publishedAt: Date.now(),
    revision: expectedRevision + 1,
    consentText: form.consentText ?? DEFAULT_CONSENT,
    rulesText: form.rulesText ?? DEFAULT_RULES,
  });
  return null;
}
