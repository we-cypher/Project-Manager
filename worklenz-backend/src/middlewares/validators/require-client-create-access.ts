import { NextFunction } from "express";

import { IWorkLenzRequest } from "../../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../../interfaces/worklenz-response";
import projectManagerValidator from "./project-manager-validator";
import { userHasSalesAccess } from "./require-sales-access";

// Client create stays with owners, admins, team leads, and project managers,
// and also anyone granted Sales access.
export default async function requireClientCreateAccess(
  req: IWorkLenzRequest,
  res: IWorkLenzResponse,
  next: NextFunction
): Promise<IWorkLenzResponse | void> {
  if (await userHasSalesAccess(req.user?.id, req.user?.team_id)) {
    return next();
  }

  return projectManagerValidator(req, res, next);
}
