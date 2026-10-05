import { useState } from "react";
import { Code2, ExternalLink, GitFork, LoaderCircle, Star } from "lucide-react";
import { formatLocale, useI18n } from "../../i18n/I18n";

type GitHubRepository = {
  name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
};

type GitHubIdentity = { owner: string; repo: string };

type CachedRepository = { value: GitHubRepository; expiresAt: number };

const repositoryCache = new Map<string, CachedRepository>();
const pendingRequests = new Map<string, Promise<GitHubRepository>>();
const CACHE_DURATION_MS = 15 * 60 * 1000;

function parseGitHubRepository(value: string): GitHubIdentity | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["github.com", "www.github.com"].includes(url.hostname.toLowerCase()) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const [owner, repository] = url.pathname.split("/").filter(Boolean);
    const repo = repository?.replace(/\.git$/i, "");
    const segmentPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
    if (
      !owner ||
      !repo ||
      !segmentPattern.test(owner) ||
      !segmentPattern.test(repo)
    ) {
      return null;
    }
    return { owner, repo };
  } catch {
    return null;
  }
}

async function fetchRepository(
  owner: string,
  repo: string,
): Promise<GitHubRepository> {
  const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
  const cached = repositoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const pending = pendingRequests.get(key);
  if (pending) return pending;

  const request = fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  ).then(async (response) => {
    if (!response.ok) {
      if (response.status === 404) throw new Error("not-found");
      if (
        response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0"
      ) {
        throw new Error("rate-limit");
      }
      throw new Error("unavailable");
    }

    const data = (await response.json()) as GitHubRepository;
    const repositoryData: GitHubRepository = {
      name: data.name,
      description: data.description,
      stargazers_count: data.stargazers_count,
      forks_count: data.forks_count,
      language: data.language,
    };
    repositoryCache.set(key, {
      value: repositoryData,
      expiresAt: Date.now() + CACHE_DURATION_MS,
    });
    return repositoryData;
  });

  pendingRequests.set(key, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(key);
  }
}

function formatCount(value: number) {
  return new Intl.NumberFormat(formatLocale(), { notation: "compact" }).format(
    value,
  );
}

/** Adapted from Elements' MIT-licensed GitHub Repo Card for Hacks' Vite app and design tokens. */
export function GitHubRepoCard({ repoUrl }: { repoUrl: string }) {
  const { t: tr } = useI18n();
  const identity = parseGitHubRepository(repoUrl);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<GitHubRepository | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!identity) {
    return (
      <a
        className="project-repo-link"
        href={repoUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Code2 size={16} aria-hidden="true" />
        {tr("Repositorio")}
        <ExternalLink size={14} aria-hidden="true" />
      </a>
    );
  }

  const fullName = `${identity.owner}/${identity.repo}`;
  const loadDetails = async () => {
    if (details || loading) return;
    setLoading(true);
    setError(null);
    try {
      setDetails(await fetchRepository(identity.owner, identity.repo));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "unavailable";
      setError(
        message === "not-found"
          ? tr("Repositorio privado o no encontrado.")
          : message === "rate-limit"
            ? tr(
                "GitHub limitó temporalmente esta consulta. Inténtalo más tarde.",
              )
            : tr(
                "Datos de GitHub no disponibles. Puedes abrir el repositorio.",
              ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="github-repo-card" aria-label={tr("Detalles de GitHub")}>
      <div className="github-repo-card-heading">
        <a href={repoUrl} target="_blank" rel="noopener noreferrer">
          <Code2 size={17} aria-hidden="true" />
          <span>{fullName}</span>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            const nextExpanded = !expanded;
            setExpanded(nextExpanded);
            if (nextExpanded) void loadDetails();
          }}
        >
          {expanded ? tr("Ocultar datos de GitHub") : tr("Ver datos de GitHub")}
        </button>
      </div>
      {expanded && (
        <div className="github-repo-card-details" aria-live="polite">
          {loading && (
            <p className="github-repo-card-message">
              <LoaderCircle size={15} aria-hidden="true" />
              {tr("Cargando datos públicos del repositorio…")}
            </p>
          )}
          {error && <p className="github-repo-card-message">{error}</p>}
          {details && (
            <>
              {details.description && <p>{details.description}</p>}
              <div className="github-repo-card-stats">
                {details.language && <span>{details.language}</span>}
                <span>
                  <Star size={14} aria-hidden="true" />
                  {formatCount(details.stargazers_count)} {tr("Estrellas")}
                </span>
                <span>
                  <GitFork size={14} aria-hidden="true" />
                  {formatCount(details.forks_count)} {tr("Forks")}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
