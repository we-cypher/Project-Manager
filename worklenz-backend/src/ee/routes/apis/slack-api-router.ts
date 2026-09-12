import express from "express";
import { ServerResponse } from "../../../models/server-response";

const slackApiRouter = express.Router();

const disabled = (_req: express.Request, res: express.Response) =>
  res.status(200).send(new ServerResponse(true, { connected: false, channels: [], configs: [] }));

slackApiRouter.all("*", disabled);

export default slackApiRouter;
