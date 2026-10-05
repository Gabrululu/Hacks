import { useI18n, formatLocale } from "../../i18n/I18n";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Answers } from "../../../convex/lib/formEngine";
import { DEFAULT_CHECKPOINT_FIELDS } from "../../../convex/lib/projectValidation";
import { FormFields } from "../registration/FormFields";
import { Button } from "../../components/ui/button";
import {
  useProjectOperation,
  useProjectUpload,
  useClock,
  CHECKPOINT_STATUS,
} from "./shared";
type Entry = FunctionReturnType<typeof api.checkpoints.mine>[number];
export function TeamCheckpoints({
  teamId,
  locked,
}: {
  teamId: Id<"teams">;
  locked: boolean;
}) {
  const { t: tr } = useI18n();

  const data = useQuery(api.checkpoints.mine, { teamId });
  return (
    <div className="checkpoint-list">
      {data === undefined ? (
        <p>{tr("Cargando checkpoints…")}</p>
      ) : data.length === 0 ? (
        <p>{tr("La organización todavía no ha definido checkpoints.")}</p>
      ) : (
        data.map((d) => (
          <Checkpoint
            key={d.checkpoint._id}
            entry={d}
            teamId={teamId}
            locked={locked}
          />
        ))
      )}
    </div>
  );
}
function Checkpoint({
  entry: { checkpoint: cp, response: r },
  teamId,
  locked,
}: {
  entry: Entry;
  teamId: Id<"teams">;
  locked: boolean;
}) {
  const { t: tr } = useI18n();

  const [answers, setAnswers] = useState<Answers>(r?.answers ?? {}),
    [revision, setRevision] = useState(r?.revision ?? 0),
    [uploading, setUploading] = useState<Record<string, boolean>>({}),
    submit = useMutation(api.checkpoints.submit),
    upload = useProjectUpload(),
    op = useProjectOperation(),
    now = useClock(),
    closed = locked || now >= cp.dueAt,
    stale = (r?.revision ?? 0) !== revision,
    busy = op.busy || Object.values(uploading).some(Boolean);
  return (
    <article className="profile-panel">
      <div className="manage-title">
        <h3>{cp.title}</h3>
        <span className="manage-badge">
          {r ? tr(CHECKPOINT_STATUS[r.status]) : tr("Pendiente")}
        </span>
      </div>
      <p>{cp.description}</p>
      <p>
        {tr("Hasta ")}
        {new Date(cp.dueAt).toLocaleString(formatLocale())}
      </p>
      {r?.reviewReason && (
        <p className="profile-notice">
          {tr("Revisión: ")}
          {r.reviewReason}
        </p>
      )}
      {closed && (
        <p>
          {locked
            ? tr(
                "Los checkpoints quedan cerrados después de la primera entrega del proyecto.",
              )
            : tr("Este checkpoint ha cerrado.")}
        </p>
      )}
      {stale && (
        <p role="status">
          {tr("El checkpoint cambió. Recarga su respuesta antes de enviarlo.")}
        </p>
      )}
      <Button
        className="manage-outline"
        disabled={busy}
        onClick={() => {
          setAnswers(r?.answers ?? {});
          setRevision(r?.revision ?? 0);
        }}
      >
        {tr("Recargar respuesta guardada")}
      </Button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void op.run(async () => {
            await submit({
              teamId,
              checkpointId: cp._id,
              answers,
              expectedRevision: revision,
            });
            setRevision(revision + 1);
          }, "Checkpoint enviado a revisión.");
        }}
      >
        <fieldset disabled={closed || busy || stale}>
          <FormFields
            eventId={cp.eventId}
            formId={cp.formId}
            fields={cp.fieldSnapshot ?? DEFAULT_CHECKPOINT_FIELDS}
            answers={answers}
            onChange={setAnswers}
            onUploading={(id, busy) =>
              setUploading((old) => ({ ...old, [id]: busy }))
            }
            upload={(file, f) =>
              upload(
                {
                  teamId,
                  kind: "checkpoint",
                  checkpointId: cp._id,
                  fieldId: f.id,
                  ...(cp.formId ? { formId: cp.formId } : {}),
                },
                file,
              )
            }
          />
          <Button type="submit">{tr("Enviar checkpoint")}</Button>
        </fieldset>
      </form>
      {op.message && <p role="status">{tr(op.message)}</p>}
    </article>
  );
}
