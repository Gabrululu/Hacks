import { useState } from "react";
import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useI18n } from "../../i18n/I18n";
import { convexSiteUrl } from "../../lib/backend";

export function EventMcpAccess({ slug }: { slug: string }) {
  const { t } = useI18n();
  const access = useQuery(api.socialCards.my, { slug });
  const [copied, setCopied] = useState<string | null>(null);
  if (access === undefined || !access || !convexSiteUrl) return null;

  const endpoint = `${convexSiteUrl.replace(/\/$/, "")}/mcp/${encodeURIComponent(slug)}`;
  const name = `hacks-${slug}`;
  const snippets = [
    {
      label: "Codex",
      value: `codex mcp add ${name} --url ${endpoint}`,
    },
    {
      label: "Claude Code",
      value: `claude mcp add --transport http ${name} ${endpoint}`,
    },
    {
      label: "Cursor",
      value: JSON.stringify(
        { mcpServers: { [name]: { url: endpoint } } },
        null,
        2,
      ),
    },
  ];

  async function copy(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <details className="profile-panel event-mcp-access">
      <summary>
        <span className="event-mcp-title">
          <Sparkles size={18} aria-hidden="true" />
          {t("Consulta esta hack con tu IA")}
        </span>
      </summary>
      <p>
        {t(
          "Conecta Codex, Claude o Cursor para consultar las reglas, fechas, premios, mentorías y demás información pública de esta hack.",
        )}
      </p>
      <label htmlFor={`mcp-endpoint-${slug}`}>{t("Endpoint MCP")}</label>
      <div className="event-mcp-endpoint">
        <code id={`mcp-endpoint-${slug}`}>{endpoint}</code>
        <button
          type="button"
          className="icon-button"
          aria-label={copied === "url" ? t("Copiado") : t("Copiar URL")}
          title={copied === "url" ? t("Copiado") : t("Copiar URL")}
          onClick={() => void copy("url", endpoint)}
        >
          {copied === "url" ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
      <div className="event-mcp-clients">
        {snippets.map(({ label, value }) => (
          <div className="event-mcp-client" key={label}>
            <div className="event-mcp-client-heading">
              <strong>{label}</strong>
              <button
                type="button"
                className="text-link"
                onClick={() => void copy(label, value)}
              >
                {copied === label ? <Check size={14} /> : <Copy size={14} />}
                {copied === label ? t("Copiado") : t("Copiar configuración")}
              </button>
            </div>
            <pre>{value}</pre>
          </div>
        ))}
      </div>
      <p className="manage-caption">
        {t(
          "El MCP solo permite leer información pública; nunca expone tu inscripción, datos personales ni evaluaciones.",
        )}
      </p>
      <a
        className="text-link event-mcp-learn-more"
        href="https://developers.openai.com/learn/docs-mcp"
        target="_blank"
        rel="noopener noreferrer"
      >
        {t("Cómo conectar un servidor MCP")}
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    </details>
  );
}
