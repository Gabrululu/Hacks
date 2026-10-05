import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import * as media from "./mediaHttp";
import * as registrationFiles from "./registrationFilesHttp";
import * as projects from "./projectFilesHttp";
import * as socialCardFiles from "./socialCardFilesHttp";
import * as socialCardMedia from "./socialCardMediaHttp";
import { webhook } from "./emailWebhook";
import { image as galleryImage } from "./galleryHttp";
import { handle as eventMcp } from "./mcp";
const http = httpRouter();
http.route({ pathPrefix: "/mcp/", method: "POST", handler: eventMcp });
http.route({ path: "/gallery-image", method: "GET", handler: galleryImage });
http.route({ path: "/resend-webhook", method: "POST", handler: webhook });
http.route({
  path: "/project-upload",
  method: "POST",
  handler: projects.upload,
});
http.route({
  path: "/project-upload",
  method: "OPTIONS",
  handler: projects.options,
});
http.route({
  path: "/social-card-photo-upload",
  method: "POST",
  handler: socialCardFiles.upload,
});
http.route({
  path: "/social-card-photo-upload",
  method: "OPTIONS",
  handler: socialCardFiles.options,
});
http.route({
  path: "/personal-card-photo",
  method: "GET",
  handler: socialCardMedia.personalPhoto,
});
http.route({
  path: "/personal-card-photo",
  method: "OPTIONS",
  handler: socialCardMedia.options,
});
http.route({
  path: "/project-card-logo",
  method: "GET",
  handler: socialCardMedia.projectLogo,
});
http.route({
  path: "/project-card-logo",
  method: "OPTIONS",
  handler: socialCardMedia.options,
});
http.route({
  path: "/event-card-logo",
  method: "GET",
  handler: socialCardMedia.officialLogo,
});
http.route({
  path: "/event-card-logo",
  method: "OPTIONS",
  handler: socialCardMedia.options,
});
http.route({
  path: "/project-file",
  method: "GET",
  handler: projects.download,
});
http.route({
  path: "/project-file",
  method: "OPTIONS",
  handler: projects.options,
});
http.route({
  path: "/registration-upload",
  method: "POST",
  handler: registrationFiles.upload,
});
http.route({
  path: "/registration-upload",
  method: "OPTIONS",
  handler: registrationFiles.options,
});
http.route({
  path: "/registration-file",
  method: "GET",
  handler: registrationFiles.download,
});
http.route({
  path: "/registration-file",
  method: "OPTIONS",
  handler: registrationFiles.options,
});
http.route({ path: "/event-upload", method: "POST", handler: media.upload });
http.route({
  path: "/event-upload",
  method: "OPTIONS",
  handler: media.options,
});
http.route({ path: "/event-file", method: "GET", handler: media.download });
http.route({ path: "/event-file", method: "OPTIONS", handler: media.options });
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: httpAction(async () => {
    const jwks = process.env.AUTH_PUBLIC_JWKS;
    if (!jwks)
      return new Response("Authentication not configured", { status: 503 });
    return new Response(jwks, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  }),
});
export default http;
