import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  useEffect,
  type ReactNode,
} from "react";
import english from "./en.json";
export type Language = "es" | "en";
const STORAGE_KEY = "hacks.language.v1";
const valid = (value: unknown): value is Language =>
  value === "es" || value === "en";
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return valid(saved) ? saved : "es";
  } catch {
    return "es";
  }
}
let language = initialLanguage();
const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function snapshot() {
  return language;
}
export function setLanguage(value: Language) {
  if (!valid(value)) return;
  language = value;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* The current tab remains usable when storage is unavailable. */
  }
  notify();
}
export function formatLocale() {
  return language === "en" ? "en-US" : "es-PE";
}
// The catalog API currently returns a Spanish, date-only label in the event's timezone.
// Reformat that calendar date without shifting it to the browser's timezone.
export function formatCatalogDate(label: string) {
  const match =
    /^(\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic) (\d{4})$/.exec(
      label,
    );
  if (!match) return label;
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sept",
    "oct",
    "nov",
    "dic",
  ];
  const month = months.indexOf(match[2] === "sep" ? "sept" : match[2]);
  return new Intl.DateTimeFormat(formatLocale(), {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(Date.UTC(Number(match[3]), month, Number(match[1])));
}
const catalog: Record<string, string> = english;
export function translate(
  text: string | null | undefined,
  values?: Record<string, ReactNode>,
  locale: Language = language,
): string {
  if (!text) return "";
  const key = text.trim();
  if (!key) return text;
  const translated = locale === "en" ? (catalog[key] ?? key) : key;
  const prefix = text.match(/^\s*/)?.[0] ?? "",
    suffix = text.match(/\s*$/)?.[0] ?? "";
  return (
    prefix +
    translated.replace(/\{(\w+)\}/g, (token, name: string) =>
      values && Object.hasOwn(values, name)
        ? String(values[name] ?? "")
        : token,
    ) +
    suffix
  );
}
const Context = createContext<{
  language: Language;
  setLanguage: typeof setLanguage;
  t: (
    text: string | null | undefined,
    values?: Record<string, ReactNode>,
  ) => string;
} | null>(null);
export function I18nProvider({ children }: { children: ReactNode }) {
  const selected = useSyncExternalStore(
    subscribe,
    snapshot,
    () => "es" as Language,
  );
  useEffect(() => {
    document.documentElement.lang = selected;
  }, [selected]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      language = valid(event.newValue) ? event.newValue : "es";
      notify();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const value = useMemo(
    () => ({
      language: selected,
      setLanguage,
      t: (
        text: string | null | undefined,
        values?: Record<string, ReactNode>,
      ) => translate(text, values, selected),
    }),
    [selected],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useI18n() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}
export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-selector">
      <span className="sr-only">{t("Idioma")}</span>
      <select
        aria-label={t("Idioma")}
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
      >
        <option value="es">ES</option>
        <option value="en">EN</option>
      </select>
    </label>
  );
}
