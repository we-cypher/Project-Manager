import { NextFunction } from "express";

import db from "../../config/db";
import { IWorkLenzRequest } from "../../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../../interfaces/worklenz-response";
import { ServerResponse } from "../../models/server-response";
import { hasTeamAdminPrivileges } from "../../shared/team-permissions";

export default async function requireSalesAccess(
  req: IWorkLenzRequest,
  res: IWorkLenzResponse,
  next: NextFunction
): Promise<IWorkLenzResponse | void> {
  const userId = req.user?.id;
  const teamId = req.user?.team_id;

  if (!userId || !teamId) {
    return res.status(400).send(new ServerResponse(false, null, "Team not found"));
  }

  if (hasTeamAdminPrivileges(req.user)) {
    return next();
  }

  try {
    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1
         FROM sales_access
         WHERE team_id = $1::UUID
           AND user_id = $2::UUID
       ) AS granted`,
      [teamId, userId]
    );

    if (result.rows[0]?.granted) {
      return next();
    }

    return res.status(403).send(new ServerResponse(false, null, "You do not have access to Sales"));
  } catch (error) {
    return next(error);
  }
}
