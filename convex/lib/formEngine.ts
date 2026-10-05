import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
export type Field = Doc<"forms">["fields"][number];
export type Answers = Doc<"registrations">["answers"];
export const FIELD_TYPES: Record<string, string> = {
  short_text: "Texto corto",
  long_text: "Texto largo",
  email: "Correo",
  url: "Enlace",
  number: "Número",
  select: "Selección",
  multi_select: "Selección múltiple",
  checkbox: "Casilla",
  date: "Fecha",
  file: "Archivo",
  country: "País",
  phone: "Teléfono",
  github_url: "GitHub",
  stellar_address: "Wallet Stellar",
  contract_id: "Contrato Soroban",
  section_header: "Sección",
};
export const DEFAULT_CONSENT =
  "Autorizo el tratamiento de mis datos personales por la organización para gestionar mi participación, revisar mi inscripción y comunicar información relacionada con este evento.";
export const DEFAULT_RULES =
  "Acepto las reglas y el código de conducta del evento.";
export const FILE_TYPES = [
  "application/pdf",
  "text/plain",
  "application/zip",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export function shown(
  field: Field,
  answers: Answers,
  visibleIds?: Set<string>,
) {
  if (!field.showIf) return true;
  if (visibleIds && !visibleIds.has(field.showIf.fieldId)) return false;
  const actual = answers[field.showIf.fieldId] ?? null,
    expected = field.showIf.equals;
  return (
    JSON.stringify(Array.isArray(actual) ? [...actual].sort() : actual) ===
    JSON.stringify(Array.isArray(expected) ? [...expected].sort() : expected)
  );
}
export function safePattern(pattern: string) {
  // A single anchored character class: no backtracking groups or lookarounds.
  return /^\^\[[a-zA-Z0-9\\\s_+@.,:;\-]+\](?:[+*?]|\{\d{1,3}(?:,\d{1,3})?\})\$$/.test(
    pattern,
  );
}
export function validateFields(fields: Field[]) {
  if (new TextEncoder().encode(JSON.stringify(fields)).byteLength > 100000)
    throw new ConvexError("FORM_TOO_LARGE");
  if (fields.length > 50) throw new ConvexError("FORM_TOO_LARGE");
  const previous = new Map<string, Field>();
  for (const f of fields) {
    if (
      !/^[a-zA-Z0-9_-]{1,64}$/.test(f.id) ||
      previous.has(f.id) ||
      [
        "wallet",
        "name",
        "email",
        "rules",
        "consent",
        "__proto__",
        "constructor",
        "prototype",
      ].includes(f.id) ||
      !FIELD_TYPES[f.type] ||
      !f.label.trim() ||
      f.label.length > 160 ||
      (f.help?.length ?? 0) > 1000 ||
      (f.placeholder?.length ?? 0) > 200
    )
      throw new ConvexError("INVALID_FIELD");
    if (
      f.options &&
      (f.options.length > 50 ||
        new Set(f.options.map((o) => o.value)).size !== f.options.length ||
        f.options.some(
          (o) =>
            !o.value.trim() ||
            o.value.length > 100 ||
            !o.label.trim() ||
            o.label.length > 160,
        ))
    )
      throw new ConvexError("INVALID_OPTIONS");
    if (["select", "multi_select"].includes(f.type) && !f.options?.length)
      throw new ConvexError("OPTIONS_REQUIRED");
    const limits = f.validation;
    if (limits) {
      if (
        [limits.min, limits.max, limits.maxFileMB].some(
          (n) => n !== undefined && (!Number.isFinite(n) || Math.abs(n) > 1e9),
        ) ||
        (limits.min !== undefined &&
          limits.max !== undefined &&
          limits.min > limits.max)
      )
        throw new ConvexError("INVALID_FIELD_LIMIT");
      if (
        f.type !== "number" &&
        [limits.min, limits.max].some(
          (n) =>
            n !== undefined && (!Number.isInteger(n) || n < 0 || n > 10000),
        )
      )
        throw new ConvexError("INVALID_FIELD_LIMIT");
      if (
        limits.pattern &&
        (!safePattern(limits.pattern) || limits.pattern.length > 100)
      )
        throw new ConvexError("UNSAFE_PATTERN");
      if (limits.pattern) {
        try {
          new RegExp(limits.pattern);
        } catch {
          throw new ConvexError("UNSAFE_PATTERN");
        }
      }
      if (
        limits.maxFileMB !== undefined &&
        (limits.maxFileMB < 1 || limits.maxFileMB > 10)
      )
        throw new ConvexError("INVALID_FILE_LIMIT");
      if (
        limits.accept &&
        limits.accept.split(",").some((s) => !FILE_TYPES.includes(s.trim()))
      )
        throw new ConvexError("INVALID_FILE_TYPE");
    }
    if (f.showIf) {
      const source = previous.get(f.showIf.fieldId);
      if (!source || ["file", "section_header"].includes(source.type))
        throw new ConvexError("INVALID_CONDITION");
      // Validate equality against the controlling field's type and options.
      validateValue(source, f.showIf.equals, false);
    }
    previous.set(f.id, f);
  }
}
export function validateValue(
  field: Field,
  value: Answers[string] | undefined,
  required = field.required,
) {
  const invalid = () => {
    throw new ConvexError({
      code: "INVALID_ANSWER",
      fieldId: field.id,
      label: field.label,
    });
  };
  const empty =
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);
  if (empty) {
    if (required) invalid();
    return;
  }
  if (field.type === "checkbox") {
    if (typeof value !== "boolean" || (required && value !== true)) invalid();
    return;
  }
  if (field.type === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (field.validation?.min !== undefined && value < field.validation.min) ||
      (field.validation?.max !== undefined && value > field.validation.max)
    )
      invalid();
    return;
  }
  if (field.type === "multi_select") {
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      new Set(value).size !== value.length ||
      value.some((s) => !field.options?.some((o) => o.value === s))
    )
      invalid();
    return;
  }
  if (typeof value !== "string") return invalid();
  if (
    value.length > (field.type === "long_text" ? 10000 : 2000) ||
    value.length < (field.validation?.min ?? 0) ||
    value.length > (field.validation?.max ?? 10000)
  )
    invalid();
  if (field.type === "select" && !field.options?.some((o) => o.value === value))
    invalid();
  if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    invalid();
  if (["url", "github_url"].includes(field.type)) {
    try {
      const url = new URL(value);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (field.type === "github_url" && url.hostname !== "github.com")
      )
        invalid();
    } catch {
      invalid();
    }
  }
  if (
    field.type === "date" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  )
    invalid();
  if (field.type === "phone" && !/^\+?[0-9 ()-]{7,30}$/.test(value)) invalid();
  if (field.type === "country" && !/^[A-Z]{2}$/.test(value)) invalid();
  if (
    ["stellar_address", "contract_id"].includes(field.type) &&
    !validStrKey(value, field.type === "stellar_address" ? 48 : 16)
  )
    invalid();
  if (
    field.validation?.pattern &&
    !new RegExp(field.validation.pattern).test(value)
  )
    invalid();
}
export function validateAnswers(fields: Field[], answers: Answers) {
  if (
    Object.keys(answers).some(
      (id) => !fields.some((f) => f.id === id && f.type !== "section_header"),
    )
  )
    throw new ConvexError("UNKNOWN_ANSWER");
  const clean: Answers = {},
    visible = new Set<string>();
  for (const f of fields) {
    if (!shown(f, clean, visible) || f.type === "section_header") continue;
    visible.add(f.id);
    validateValue(f, answers[f.id]);
    if (answers[f.id] !== undefined) clean[f.id] = answers[f.id];
  }
  if (new TextEncoder().encode(JSON.stringify(clean)).byteLength > 100000)
    throw new ConvexError("ANSWERS_TOO_LARGE");
  return clean;
}
export function visibleAnswers(
  fields: Field[],
  answers: Answers,
  organizer: boolean,
) {
  const visible = fields.filter(
    (f) => organizer || f.staffVisibility !== "organizers",
  );
  return {
    fields: visible,
    answers: Object.fromEntries(
      visible
        .filter((f) => Object.hasOwn(answers, f.id))
        .map((f) => [f.id, answers[f.id]]),
    ) as Answers,
  };
}

export function validStrKey(value: string, version: number) {
  if (!/^[A-Z2-7]{56}$/.test(value)) return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
    bytes: number[] = [];
  let buffer = 0,
    bits = 0;
  for (const char of value) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 255);
    }
  }
  if (bytes.length !== 35 || bytes[0] !== version) return false;
  let crc = 0;
  for (const byte of bytes.slice(0, 33)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++)
      crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff;
  }
  return bytes[33] === (crc & 255) && bytes[34] === crc >>> 8;
}
