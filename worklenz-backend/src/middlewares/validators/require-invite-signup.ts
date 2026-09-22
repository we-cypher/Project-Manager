import { NextFunction, Request, Response } from "express";

import { ServerResponse } from "../../models/server-response";
import {
  hasInviteSignupIds,
  isPublicSignupDisabled,
  PUBLIC_SIGNUP_DISABLED_MESSAGE,
} from "../../shared/public-signup";

export default function requireInviteSignup(req: Request, res: Response, next: NextFunction) {
  if (!isPublicSignupDisabled()) return next();

  if (hasInviteSignupIds(req.body?.team_id, req.body?.team_member_id)) {
    return next();
  }

  return res.status(403).send(new ServerResponse(false, null, PUBLIC_SIGNUP_DISABLED_MESSAGE));
}
