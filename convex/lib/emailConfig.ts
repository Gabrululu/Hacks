export function emailMode(): "development" | "resend" | "unconfigured" {
  if (process.env.EMAIL_DELIVERY_MODE === "development") {
    try {
      if (
        ["localhost", "127.0.0.1"].includes(
          new URL(process.env.AUTH_ISSUER ?? "").hostname,
        )
      )
        return "development";
    } catch {
      /* Missing issuer must not expose codes. */
    }
    return "unconfigured";
  }
  return process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM_EMAIL &&
    process.env.EMAIL_VERIFICATION_SECRET
    ? "resend"
    : "unconfigured";
}
