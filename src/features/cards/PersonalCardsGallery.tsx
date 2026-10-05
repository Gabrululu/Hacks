import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useI18n } from "../../i18n/I18n";
import { convexSiteUrl } from "../../lib/backend";

export function PersonalCardsGallery({ slug }: { slug: string }) {
  const { t: tr } = useI18n();
  const { results, status, loadMore } = usePaginatedQuery(
    api.socialCards.personalGallery,
    { slug },
    { initialNumItems: 12 },
  );
  if (!results.length && status === "Exhausted") return null;
  return (
    <section className="personal-cards-gallery">
      <div className="eyebrow">{tr("COMUNIDAD")}</div>
      <h2>{tr("Cards de participantes")}</h2>
      <div className="personal-cards-grid">
        {results.map((card) => (
          <article className="personal-card-tile" key={card.userId}>
            {card.photoUrl && convexSiteUrl ? (
              <img
                loading="lazy"
                src={`${convexSiteUrl.replace(/\/$/, "")}/${card.photoUrl.replace(/^\//, "")}`}
                alt={tr("Foto de {0}", { "0": card.displayName })}
              />
            ) : (
              <span aria-hidden="true">✳</span>
            )}
            <strong>{card.displayName}</strong>
            <span>
              {tr(
                card.role === "participant"
                  ? "Hacker"
                  : card.role === "mentor"
                    ? "Mentor"
                    : "Jurado",
              )}
            </span>
          </article>
        ))}
      </div>
      {status === "LoadingFirstPage" && <p>{tr("Cargando cards…")}</p>}
      {status === "CanLoadMore" && (
        <button onClick={() => loadMore(12)}>{tr("Ver más cards")}</button>
      )}
    </section>
  );
}
