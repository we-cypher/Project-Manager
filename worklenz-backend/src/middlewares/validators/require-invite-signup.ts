import { NextFunction, Request, Response } from "express";

import { ServerResponse } from "../../models/server-response";
import {
  hasInviteSignupIds,
  isPublicSignupDisabled,
  PUBLIC_SIGNUP_DISABLED_MESSAGE,
} from "../../shared/public-signup";
import { hasActiveEmailInvite } from "../../shared/invitation-link";

const EXPIRED_INVITE_MESSAGE = "This invitation has expired or is no longer valid.";

export default async function requireInviteSignup(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isPublicSignupDisabled()) return next();

    if (!hasInviteSignupIds(req.body?.team_id, req.body?.team_member_id)) {
      return res.status(403).send(new ServerResponse(false, { reason: "invalid" }, PUBLIC_SIGNUP_DISABLED_MESSAGE));
    }

    const isActive = await hasActiveEmailInvite(req.body.team_id, req.body.team_member_id);

    if (!isActive) {
      return res.status(403).send(new ServerResponse(false, { reason: "expired" }, EXPIRED_INVITE_MESSAGE));
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
