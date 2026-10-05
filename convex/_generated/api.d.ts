/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminMetrics from "../adminMetrics.js";
import type * as announcements from "../announcements.js";
import type * as auth from "../auth.js";
import type * as authData from "../authData.js";
import type * as checkpoints from "../checkpoints.js";
import type * as communication from "../communication.js";
import type * as communicationEmailData from "../communicationEmailData.js";
import type * as communicationEmails from "../communicationEmails.js";
import type * as communicationJobs from "../communicationJobs.js";
import type * as communicationWorkflow from "../communicationWorkflow.js";
import type * as content from "../content.js";
import type * as crons from "../crons.js";
import type * as domains from "../domains.js";
import type * as emailData from "../emailData.js";
import type * as emailDelivery from "../emailDelivery.js";
import type * as emailUnsubscribe from "../emailUnsubscribe.js";
import type * as emailUnsubscribeData from "../emailUnsubscribeData.js";
import type * as emailWebhook from "../emailWebhook.js";
import type * as emails from "../emails.js";
import type * as emails_templates_EventEmail from "../emails/templates/EventEmail.js";
import type * as eventContentData from "../eventContentData.js";
import type * as events from "../events.js";
import type * as forms from "../forms.js";
import type * as gallery from "../gallery.js";
import type * as galleryHttp from "../galleryHttp.js";
import type * as hackerPass from "../hackerPass.js";
import type * as http from "../http.js";
import type * as judging from "../judging.js";
import type * as judgingJobs from "../judgingJobs.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authValidators from "../lib/authValidators.js";
import type * as lib_contentValidators from "../lib/contentValidators.js";
import type * as lib_emailConfig from "../lib/emailConfig.js";
import type * as lib_emailContent from "../lib/emailContent.js";
import type * as lib_emailQuota from "../lib/emailQuota.js";
import type * as lib_emailValidators from "../lib/emailValidators.js";
import type * as lib_eventTemplates from "../lib/eventTemplates.js";
import type * as lib_formEngine from "../lib/formEngine.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_judgingAccess from "../lib/judgingAccess.js";
import type * as lib_judgingMath from "../lib/judgingMath.js";
import type * as lib_judgingValidators from "../lib/judgingValidators.js";
import type * as lib_manageValidators from "../lib/manageValidators.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_pageView from "../lib/pageView.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as lib_presentation from "../lib/presentation.js";
import type * as lib_projectAccess from "../lib/projectAccess.js";
import type * as lib_projectValidation from "../lib/projectValidation.js";
import type * as lib_projectValidators from "../lib/projectValidators.js";
import type * as lib_projectView from "../lib/projectView.js";
import type * as lib_registrationValidators from "../lib/registrationValidators.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_walletProof from "../lib/walletProof.js";
import type * as manage from "../manage.js";
import type * as mcp from "../mcp.js";
import type * as media from "../media.js";
import type * as mediaHttp from "../mediaHttp.js";
import type * as mentorship from "../mentorship.js";
import type * as model_auditLog from "../model/auditLog.js";
import type * as model_authChallenges from "../model/authChallenges.js";
import type * as model_authSessions from "../model/authSessions.js";
import type * as model_campaigns from "../model/campaigns.js";
import type * as model_checkpointSubmissions from "../model/checkpointSubmissions.js";
import type * as model_checkpoints from "../model/checkpoints.js";
import type * as model_contentShared from "../model/contentShared.js";
import type * as model_emailAudience from "../model/emailAudience.js";
import type * as model_emailDeliveries from "../model/emailDeliveries.js";
import type * as model_emailVerifications from "../model/emailVerifications.js";
import type * as model_eventAssets from "../model/eventAssets.js";
import type * as model_eventStaff from "../model/eventStaff.js";
import type * as model_events from "../model/events.js";
import type * as model_forms from "../model/forms.js";
import type * as model_judgeAssignments from "../model/judgeAssignments.js";
import type * as model_judgingAuto from "../model/judgingAuto.js";
import type * as model_judgingResults from "../model/judgingResults.js";
import type * as model_judgingRounds from "../model/judgingRounds.js";
import type * as model_mentorBookings from "../model/mentorBookings.js";
import type * as model_mentors from "../model/mentors.js";
import type * as model_organizerApplications from "../model/organizerApplications.js";
import type * as model_projectUploads from "../model/projectUploads.js";
import type * as model_registrationNotifications from "../model/registrationNotifications.js";
import type * as model_registrationTotals from "../model/registrationTotals.js";
import type * as model_registrationUploads from "../model/registrationUploads.js";
import type * as model_registrations from "../model/registrations.js";
import type * as model_resources from "../model/resources.js";
import type * as model_scores from "../model/scores.js";
import type * as model_staffInvites from "../model/staffInvites.js";
import type * as model_submissionVersions from "../model/submissionVersions.js";
import type * as model_submissions from "../model/submissions.js";
import type * as model_teamMembers from "../model/teamMembers.js";
import type * as model_teamMergeRequests from "../model/teamMergeRequests.js";
import type * as model_teams from "../model/teams.js";
import type * as model_testCleanup from "../model/testCleanup.js";
import type * as model_tracks from "../model/tracks.js";
import type * as model_users from "../model/users.js";
import type * as organizations from "../organizations.js";
import type * as organizers from "../organizers.js";
import type * as projectFiles from "../projectFiles.js";
import type * as projectFilesHttp from "../projectFilesHttp.js";
import type * as projects from "../projects.js";
import type * as registrationData from "../registrationData.js";
import type * as registrationEmailData from "../registrationEmailData.js";
import type * as registrationEmails from "../registrationEmails.js";
import type * as registrationFiles from "../registrationFiles.js";
import type * as registrationFilesHttp from "../registrationFilesHttp.js";
import type * as registrations from "../registrations.js";
import type * as seed from "../seed.js";
import type * as socialCardFilesHttp from "../socialCardFilesHttp.js";
import type * as socialCardMediaHttp from "../socialCardMediaHttp.js";
import type * as socialCards from "../socialCards.js";
import type * as staff from "../staff.js";
import type * as staffActions from "../staffActions.js";
import type * as staffData from "../staffData.js";
import type * as teams from "../teams.js";
import type * as testCleanup from "../testCleanup.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminMetrics: typeof adminMetrics;
  announcements: typeof announcements;
  auth: typeof auth;
  authData: typeof authData;
  checkpoints: typeof checkpoints;
  communication: typeof communication;
  communicationEmailData: typeof communicationEmailData;
  communicationEmails: typeof communicationEmails;
  communicationJobs: typeof communicationJobs;
  communicationWorkflow: typeof communicationWorkflow;
  content: typeof content;
  crons: typeof crons;
  domains: typeof domains;
  emailData: typeof emailData;
  emailDelivery: typeof emailDelivery;
  emailUnsubscribe: typeof emailUnsubscribe;
  emailUnsubscribeData: typeof emailUnsubscribeData;
  emailWebhook: typeof emailWebhook;
  emails: typeof emails;
  "emails/templates/EventEmail": typeof emails_templates_EventEmail;
  eventContentData: typeof eventContentData;
  events: typeof events;
  forms: typeof forms;
  gallery: typeof gallery;
  galleryHttp: typeof galleryHttp;
  hackerPass: typeof hackerPass;
  http: typeof http;
  judging: typeof judging;
  judgingJobs: typeof judgingJobs;
  "lib/audit": typeof lib_audit;
  "lib/authValidators": typeof lib_authValidators;
  "lib/contentValidators": typeof lib_contentValidators;
  "lib/emailConfig": typeof lib_emailConfig;
  "lib/emailContent": typeof lib_emailContent;
  "lib/emailQuota": typeof lib_emailQuota;
  "lib/emailValidators": typeof lib_emailValidators;
  "lib/eventTemplates": typeof lib_eventTemplates;
  "lib/formEngine": typeof lib_formEngine;
  "lib/functions": typeof lib_functions;
  "lib/judgingAccess": typeof lib_judgingAccess;
  "lib/judgingMath": typeof lib_judgingMath;
  "lib/judgingValidators": typeof lib_judgingValidators;
  "lib/manageValidators": typeof lib_manageValidators;
  "lib/metrics": typeof lib_metrics;
  "lib/pageView": typeof lib_pageView;
  "lib/permissions": typeof lib_permissions;
  "lib/presentation": typeof lib_presentation;
  "lib/projectAccess": typeof lib_projectAccess;
  "lib/projectValidation": typeof lib_projectValidation;
  "lib/projectValidators": typeof lib_projectValidators;
  "lib/projectView": typeof lib_projectView;
  "lib/registrationValidators": typeof lib_registrationValidators;
  "lib/resend": typeof lib_resend;
  "lib/types": typeof lib_types;
  "lib/validators": typeof lib_validators;
  "lib/walletProof": typeof lib_walletProof;
  manage: typeof manage;
  mcp: typeof mcp;
  media: typeof media;
  mediaHttp: typeof mediaHttp;
  mentorship: typeof mentorship;
  "model/auditLog": typeof model_auditLog;
  "model/authChallenges": typeof model_authChallenges;
  "model/authSessions": typeof model_authSessions;
  "model/campaigns": typeof model_campaigns;
  "model/checkpointSubmissions": typeof model_checkpointSubmissions;
  "model/checkpoints": typeof model_checkpoints;
  "model/contentShared": typeof model_contentShared;
  "model/emailAudience": typeof model_emailAudience;
  "model/emailDeliveries": typeof model_emailDeliveries;
  "model/emailVerifications": typeof model_emailVerifications;
  "model/eventAssets": typeof model_eventAssets;
  "model/eventStaff": typeof model_eventStaff;
  "model/events": typeof model_events;
  "model/forms": typeof model_forms;
  "model/judgeAssignments": typeof model_judgeAssignments;
  "model/judgingAuto": typeof model_judgingAuto;
  "model/judgingResults": typeof model_judgingResults;
  "model/judgingRounds": typeof model_judgingRounds;
  "model/mentorBookings": typeof model_mentorBookings;
  "model/mentors": typeof model_mentors;
  "model/organizerApplications": typeof model_organizerApplications;
  "model/projectUploads": typeof model_projectUploads;
  "model/registrationNotifications": typeof model_registrationNotifications;
  "model/registrationTotals": typeof model_registrationTotals;
  "model/registrationUploads": typeof model_registrationUploads;
  "model/registrations": typeof model_registrations;
  "model/resources": typeof model_resources;
  "model/scores": typeof model_scores;
  "model/staffInvites": typeof model_staffInvites;
  "model/submissionVersions": typeof model_submissionVersions;
  "model/submissions": typeof model_submissions;
  "model/teamMembers": typeof model_teamMembers;
  "model/teamMergeRequests": typeof model_teamMergeRequests;
  "model/teams": typeof model_teams;
  "model/testCleanup": typeof model_testCleanup;
  "model/tracks": typeof model_tracks;
  "model/users": typeof model_users;
  organizations: typeof organizations;
  organizers: typeof organizers;
  projectFiles: typeof projectFiles;
  projectFilesHttp: typeof projectFilesHttp;
  projects: typeof projects;
  registrationData: typeof registrationData;
  registrationEmailData: typeof registrationEmailData;
  registrationEmails: typeof registrationEmails;
  registrationFiles: typeof registrationFiles;
  registrationFilesHttp: typeof registrationFilesHttp;
  registrations: typeof registrations;
  seed: typeof seed;
  socialCardFilesHttp: typeof socialCardFilesHttp;
  socialCardMediaHttp: typeof socialCardMediaHttp;
  socialCards: typeof socialCards;
  staff: typeof staff;
  staffActions: typeof staffActions;
  staffData: typeof staffData;
  teams: typeof teams;
  testCleanup: typeof testCleanup;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  eventsMetrics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"eventsMetrics">;
  registrationsMetrics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"registrationsMetrics">;
  submissionsMetrics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"submissionsMetrics">;
  emailDeliveriesMetrics: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"emailDeliveriesMetrics">;
};
