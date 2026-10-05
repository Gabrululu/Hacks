import type { AuthConfig } from "convex/server";
const issuer = process.env.AUTH_ISSUER;
const jwks = process.env.AUTH_PUBLIC_JWKS;
export default {
  providers:
    issuer && jwks
      ? [
          {
            type: "customJwt",
            applicationID: "hacks",
            issuer,
            jwks: `data:application/json;base64,${btoa(jwks)}`,
            algorithm: "RS256",
          },
        ]
      : [],
} satisfies AuthConfig;
