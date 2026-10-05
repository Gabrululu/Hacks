"use node";
import { randomInt, randomUUID, createHmac } from "node:crypto";
import { render } from "@react-email/render";
import { createElement } from "react";
import { EventEmail } from "./emails/templates/EventEmail";
import { v, ConvexError } from "convex/values";
import { internalAction } from "./_generated/server";
import { authedAction } from "./lib/functions";
import { internal } from "./_generated/api";
import { emailMode } from "./lib/emailConfig";
function hash(user: string, email: string, code: string, nonce: string) {
  const secret = process.env.EMAIL_VERIFICATION_SECRET;
  if (!secret) throw new ConvexError("EMAIL_NOT_CONFIGURED");
  return createHmac("sha256", secret)
    .update(JSON.stringify([user, email, nonce, code]))
    .digest("hex");
}
export const request = authedAction({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }): Promise<null> => {
    const user = ctx.user;
    email = email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new ConvexError("INVALID_EMAIL");
    if (emailMode() === "unconfigured")
      throw new ConvexError("EMAIL_NOT_CONFIGURED");
    if (await ctx.runQuery(internal.emailDelivery.suppressed, { email }))
      throw new ConvexError("EMAIL_SUPPRESSED");
    const code = randomInt(0, 1000000).toString().padStart(6, "0");
    const nonce = randomUUID();
    await ctx.runMutation(internal.emailData.create, {
      email,
      code,
      nonce,
      codeHash: hash(user._id, email, code, nonce),
    });
    return null;
  },
});
export const verify = authedAction({
  args: { code: v.string() },
  returns: v.union(
    v.literal("expired"),
    v.literal("locked"),
    v.literal("invalid"),
    v.literal("verified"),
  ),
  handler: async (
    ctx,
    { code },
  ): Promise<"expired" | "locked" | "invalid" | "verified"> => {
    const user = ctx.user;
    const p = await ctx.runQuery(internal.emailData.pending, {});
    if (!p) return "expired";
    return ctx.runMutation(internal.emailData.confirm, {
      id: p._id,
      codeHash: hash(user._id, p.email, code, p.nonce ?? ""),
    });
  },
});
export const deliver = internalAction({
  args: { id: v.id("emailVerifications"), code: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, code }) => {
    const p = await ctx.runQuery(internal.emailData.deliveryData, { id });
    if (!p || p.usedAt || p.expiresAt <= Date.now()) return null;
    try {
      const delivery = await ctx.runMutation(internal.emailDelivery.enqueue, {
        source: { verificationId: id },
        verificationCode: code,
        html: await render(
          createElement(EventEmail, {
            subject: "Tu código de acceso a hacks",
            body: `Tu código de verificación es **${code}**. Expira en 10 minutos. Si no lo solicitaste, ignora este correo.`,
            eventName: "hacks",
            primary: "#a4ff60",
            logo: null,
          }),
        ),
      });
      if (delivery === "development")
        await ctx.runMutation(internal.emailData.mark, {
          id,
          delivery: "development",
          code,
        });
      else if (delivery === "suppressed" || delivery === "failed")
        await ctx.runMutation(internal.emailData.mark, {
          id,
          delivery: "failed",
        });
    } catch {
      await ctx.runMutation(internal.emailData.mark, {
        id,
        delivery: "failed",
      });
    }
    return null;
  },
});
