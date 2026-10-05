import { TableAggregate } from "@convex-dev/aggregate";
import { Triggers } from "convex-helpers/server/triggers";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
export const eventMetrics = new TableAggregate<{
  DataModel: DataModel;
  TableName: "events";
  Key: string;
}>(components.eventsMetrics, { sortKey: (d) => d.status });
export const registrationMetrics = new TableAggregate<{
  DataModel: DataModel;
  TableName: "registrations";
  Key: string;
}>(components.registrationsMetrics, { sortKey: (d) => d.status });
export const projectMetrics = new TableAggregate<{
  DataModel: DataModel;
  TableName: "submissions";
  Key: string;
}>(components.submissionsMetrics, { sortKey: (d) => d.status });
export const emailMetrics = new TableAggregate<{
  DataModel: DataModel;
  TableName: "emailDeliveries";
  Key: string;
}>(components.emailDeliveriesMetrics, { sortKey: (d) => d.status });
export const metricTriggers = new Triggers<DataModel>();
metricTriggers.register("events", eventMetrics.idempotentTrigger());
metricTriggers.register(
  "registrations",
  registrationMetrics.idempotentTrigger(),
);
metricTriggers.register("submissions", projectMetrics.idempotentTrigger());
metricTriggers.register("emailDeliveries", emailMetrics.idempotentTrigger());
