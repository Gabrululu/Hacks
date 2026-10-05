import { ConvexError } from "convex/values";
export function validateMessage(subject: string, body: string) {
  if (
    !subject.trim() ||
    subject.length > 200 ||
    /[\r\n]/.test(subject) ||
    !body.trim() ||
    body.length > 20000
  )
    throw new ConvexError("INVALID_MESSAGE");
  for (const match of `${subject}\n${body}`.matchAll(/{{\s*([^}]+)\s*}}/g))
    if (!["name", "eventName", "teamName"].includes(match[1].trim()))
      throw new ConvexError("UNKNOWN_VARIABLE");
}
export function personalize(
  text: string,
  data: { name: string; eventName: string; teamName: string },
  markdown = false,
) {
  return text.replace(
    /{{\s*(name|eventName|teamName)\s*}}/g,
    (_, key: keyof typeof data) =>
      markdown
        ? data[key].replace(/[\\`*_{}\[\]()<>#+.!|~-]/g, "\\$&")
        : data[key],
  );
}
export function appUrl() {
  return process.env.APP_URL ?? "https://hacks.mintedinpe.com";
}
