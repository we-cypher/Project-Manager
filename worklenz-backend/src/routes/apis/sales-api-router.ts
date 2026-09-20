import express from "express";

import SalesController from "../../controllers/sales-controller";
import idParamValidator from "../../middlewares/validators/id-param-validator";
import safeControllerFunction from "../../shared/safe-controller-function";

const salesApiRouter = express.Router();

salesApiRouter.get("/deals", safeControllerFunction(SalesController.getDeals));
salesApiRouter.post("/deals", safeControllerFunction(SalesController.createDeal));
salesApiRouter.get("/owners", safeControllerFunction(SalesController.getOwners));
salesApiRouter.get("/projects-lookup", safeControllerFunction(SalesController.getProjectsLookup));
salesApiRouter.get("/products", safeControllerFunction(SalesController.getProducts));
salesApiRouter.post("/products", safeControllerFunction(SalesController.createProduct));
salesApiRouter.put("/products/:id", idParamValidator, safeControllerFunction(SalesController.updateProduct));
salesApiRouter.delete("/products/:id", idParamValidator, safeControllerFunction(SalesController.deleteProduct));
salesApiRouter.put(
  "/products/:id/onboarding-steps",
  idParamValidator,
  safeControllerFunction(SalesController.replaceOnboardingSteps)
);

salesApiRouter.get("/deals/:id", idParamValidator, safeControllerFunction(SalesController.getDealById));
salesApiRouter.put("/deals/:id", idParamValidator, safeControllerFunction(SalesController.updateDeal));
salesApiRouter.patch("/deals/:id/stage", idParamValidator, safeControllerFunction(SalesController.updateDealStage));
salesApiRouter.delete("/deals/:id", idParamValidator, safeControllerFunction(SalesController.deleteDeal));

salesApiRouter.get("/deals/:id/activities", idParamValidator, safeControllerFunction(SalesController.getActivities));
salesApiRouter.post("/deals/:id/activities", idParamValidator, safeControllerFunction(SalesController.createActivity));
salesApiRouter.post(
  "/deals/:id/create-project",
  idParamValidator,
  safeControllerFunction(SalesController.createProjectFromDeal)
);
salesApiRouter.post("/deals/:id/link-project", idParamValidator, safeControllerFunction(SalesController.linkProject));
salesApiRouter.post(
  "/deals/:id/apply-onboarding",
  idParamValidator,
  safeControllerFunction(SalesController.applyOnboarding)
);

salesApiRouter.patch("/activities/:activityId", safeControllerFunction(SalesController.updateActivity));
salesApiRouter.delete("/activities/:activityId", safeControllerFunction(SalesController.deleteActivity));

export default salesApiRouter;
