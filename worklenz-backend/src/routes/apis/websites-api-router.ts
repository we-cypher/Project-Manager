import express from "express";

import WebsitesController from "../../controllers/websites-controller";
import teamOwnerOrAdminValidator from "../../middlewares/validators/team-owner-or-admin-validator";
import safeControllerFunction from "../../shared/safe-controller-function";

const router = express.Router();

router.use(teamOwnerOrAdminValidator);

router.get("/summary", safeControllerFunction(WebsitesController.summary));
router.get("/filters", safeControllerFunction(WebsitesController.filters));
router.get("/settings", safeControllerFunction(WebsitesController.getSettings));
router.put("/settings", safeControllerFunction(WebsitesController.updateSettings));
router.get("/", safeControllerFunction(WebsitesController.list));
router.post("/", safeControllerFunction(WebsitesController.create));
router.post("/:id/renew", safeControllerFunction(WebsitesController.renew));
router.post("/:id/archive", safeControllerFunction(WebsitesController.archive));
router.post("/:id/restore", safeControllerFunction(WebsitesController.restore));
router.get("/:id", safeControllerFunction(WebsitesController.getById));
router.put("/:id", safeControllerFunction(WebsitesController.update));

export default router;
