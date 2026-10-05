"use node";
import { createPublicKey } from "node:crypto";
import { SignJWT, importPKCS8, jwtVerify } from "jose";
import { v, ConvexError } from "convex/values";
import { authedAction } from "./lib/functions";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
export const issue = authedAction({
  args: { slug: v.string() },
  returns: v.object({
    token: v.string(),
    name: v.string(),
    eventName: v.string(),
    wallet: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (
    ctx,
    a,
  ): Promise<{
    token: string;
    name: string;
    eventName: string;
    wallet: string;
    expiresAt: number;
  }> => {
    const data = await ctx.runQuery(internal.registrationData.passData, a);
    if (!process.env.AUTH_PRIVATE_KEY || !process.env.AUTH_ISSUER)
      throw new ConvexError("AUTH_NOT_CONFIGURED");
    if (data.expiresAt <= Date.now()) throw new ConvexError("PASS_EXPIRED");
    const token = await new SignJWT({
      registrationId: data.id,
      eventId: data.eventId,
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(process.env.AUTH_ISSUER)
      .setAudience("hacks-checkin")
      .setIssuedAt()
      .setExpirationTime(Math.floor(data.expiresAt / 1000))
      .sign(await importPKCS8(process.env.AUTH_PRIVATE_KEY, "RS256"));
    return {
      token,
      name: data.name,
      eventName: data.eventName,
      wallet: data.wallet,
      expiresAt: data.expiresAt,
    };
  },
});
export const checkIn = authedAction({
  args: { eventId: v.id("events"), token: v.string() },
  returns: v.union(v.literal("checked_in"), v.literal("already_checked_in")),
  handler: async (ctx, a): Promise<"checked_in" | "already_checked_in"> => {
    if (!process.env.AUTH_PRIVATE_KEY || !process.env.AUTH_ISSUER)
      throw new ConvexError("AUTH_NOT_CONFIGURED");
    let id: Id<"registrations">;
    try {
      if (a.token.length > 4096) throw new Error("too long");
      const { payload } = await jwtVerify(
        a.token,
        createPublicKey(process.env.AUTH_PRIVATE_KEY),
        {
          algorithms: ["RS256"],
          issuer: process.env.AUTH_ISSUER,
          audience: "hacks-checkin",
        },
      );
      if (
        payload.eventId !== a.eventId ||
        typeof payload.registrationId !== "string"
      )
        throw new Error("wrong event");
      id = payload.registrationId as Id<"registrations">;
    } catch {
      throw new ConvexError("INVALID_PASS");
    }
    return ctx.runMutation(internal.registrationData.checkIn, {
      eventId: a.eventId,
      id,
    });
  },
});
