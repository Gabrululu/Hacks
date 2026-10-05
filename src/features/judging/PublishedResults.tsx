import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/ui/button";
export function PublishedResults({ slug }: { slug: string }) {
  const { t: tr } = useI18n();

  const [cursor, setCursor] = useState<string | null>(null),
    [previous, setPrevious] = useState<(string | null)[]>([]),
    data = useQuery(api.judging.publicRanking, {
      slug,
      paginationOpts: { cursor, numItems: 20 },
    });
  if (!data?.eventName) return null;
  return (
    <section className="published-results" id="resultados">
      <div className="eyebrow">{tr("RESULTADOS PUBLICADOS")}</div>
      <h2>{tr("Así construimos el futuro.")}</h2>
      <p>
        {data.roundName} {tr(" · Puntajes normalizados sobre 100. ")}
        {data.winnerCount} {tr("puestos ganadores.")}
      </p>
      <div className="ranking-table-wrap">
        <table className="ranking-table">
          <thead>
            <tr>
              <th>{tr("Puesto")}</th>
              <th>{tr("Proyecto")}</th>
              <th>{tr("Equipo")}</th>
              <th>{tr("Puntaje")}</th>
            </tr>
          </thead>
          <tbody>
            {data.page.page.map((r) => (
              <tr
                key={r.id}
                className={
                  r.rank !== null && r.rank <= data.winnerCount
                    ? "ranking-winner"
                    : ""
                }
              >
                <td>
                  {r.rank}
                  {r.rank !== null && r.rank <= data.winnerCount && (
                    <small>{tr("Ganador")}</small>
                  )}
                </td>
                <td>
                  <strong>{r.title}</strong>
                  <p>{r.summary}</p>
                  {r.publicFeedback.length > 0 && (
                    <details>
                      <summary>{tr("Feedback del jurado")}</summary>
                      {r.publicFeedback.map((text, i) => (
                        <p key={i}>{text}</p>
                      ))}
                    </details>
                  )}
                </td>
                <td>{r.teamName}</td>
                <td>
                  {r.score.toFixed(2)} / 100
                  <small>
                    {r.reviews} {tr(" evaluaciones")}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="project-actions">
        {!!previous.length && (
          <Button
            className="manage-outline"
            onClick={() => {
              setCursor(previous.at(-1) ?? null);
              setPrevious((old) => old.slice(0, -1));
            }}
          >
            {tr("Resultados anteriores")}
          </Button>
        )}
        {!data.page.isDone && (
          <Button
            className="manage-outline"
            onClick={() => {
              setPrevious((old) => [...old, cursor]);
              setCursor(data.page.continueCursor);
            }}
          >
            {tr("Siguientes resultados")}
          </Button>
        )}
      </div>
    </section>
  );
}
