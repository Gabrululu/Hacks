import type { Registration } from "./shared";
export function csvCell(value: unknown) {
  let text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function registrationsCsv(rows: Registration[]) {
  const columns = new Map<
    string,
    { id: string; label: string; type: string }
  >();
  for (const r of rows)
    for (const f of r.fields) {
      if (f.type !== "section_header")
        columns.set(`${f.id}\u0000${f.label}`, {
          id: f.id,
          label: f.label,
          type: f.type,
        });
    }
  const headers = [
    "Nombre",
    "Correo",
    "Wallet",
    "Estado",
    "Versión",
    "Consentimiento",
    "Check-in",
    ...Array.from(columns.values(), (f) => f.label),
  ];
  return (
    "\uFEFF" +
    [
      headers.map(csvCell).join(","),
      ...rows.map((r) =>
        [
          r.name,
          r.email,
          r.wallet,
          r.status,
          r.formVersion,
          new Date(r.consentAt).toISOString(),
          r.checkedInAt ? new Date(r.checkedInAt).toISOString() : "",
          ...Array.from(columns.values(), (f) => {
            if (
              !r.fields.some((old) => old.id === f.id && old.label === f.label)
            )
              return "";
            return f.type === "file" && r.answers[f.id]
              ? "Archivo privado"
              : (r.answers[f.id] ?? "");
          }),
        ]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n")
  );
}
