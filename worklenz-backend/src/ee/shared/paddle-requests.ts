/**
 * Paddle billing proxy - DISABLED
 * This module previously proxied requests to an external billing server.
 * For self-hosted deployments, configure PRODUCTION_SERVER_URL to your own
 * billing server or leave this disabled.
 */

import {log_error} from "../../shared/utils";

const DISABLED_MSG = "Paddle billing proxy is disabled for self-hosted deployment. Set PRODUCTION_SERVER_URL to your own billing server to re-enable.";

async function post(_endpoint: string, _body: Record<string, unknown>) {
  log_error(new Error(DISABLED_MSG), null, false);
  throw new Error(DISABLED_MSG);
}

export async function generatePayLinkRequest(_teamMemberData: any, _plan: string, _owner_id = "", _user_id = "") {
  return post("generate-pay-link", {});
}

export async function updateUsers(_subscription_id: string, _quantity: number) {
  return post("update-subscription-quantity", {});
}

export async function addModifier(_subscription_id: string) {
  return post("purchase-storage", {});
}

export async function changePlan(_plan_id: string, _subscription_id: string) {
  return post("change-plan", {});
}

export async function cancelSubscription(_subscription_id: string, _user_id: string) {
  return post("cancel-subscription", {});
}

export async function pauseOrResumeSubscription(_subscription_id: string, _user_id: string, _pause: boolean) {
  return post("pause-subscription", {});
}
