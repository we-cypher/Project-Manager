import { NextFunction, Request, Response } from "express";

import db from "../../config/db";
import { ServerResponse } from "../../models/server-response";
import {
  hasInviteSignupIds,
  isPublicSignupDisabled,
  PUBLIC_SIGNUP_DISABLED_MESSAGE,
} from "../../shared/public-signup";

const EXPIRED_INVITE_MESSAGE = "This invitation has expired or is no longer valid.";

export default async function requireInviteSignup(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isPublicSignupDisabled()) return next();

    if (!hasInviteSignupIds(req.body?.team_id, req.body?.team_member_id)) {
      return res.status(403).send(new ServerResponse(false, { reason: "invalid" }, PUBLIC_SIGNUP_DISABLED_MESSAGE));
    }

    const result = await db.query(
      `SELECT 1
       FROM email_invitations
       WHERE team_id = $1
         AND team_member_id = $2
       LIMIT 1`,
      [req.body.team_id, req.body.team_member_id]
    );

    if (!result.rowCount) {
      return res.status(403).send(new ServerResponse(false, { reason: "expired" }, EXPIRED_INVITE_MESSAGE));
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
