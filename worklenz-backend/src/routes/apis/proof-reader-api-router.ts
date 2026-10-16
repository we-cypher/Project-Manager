import express from "express";
import multer from "multer";

import ProofReaderController from "../../controllers/proof-reader-controller";
import idParamValidator from "../../middlewares/validators/id-param-validator";
import requireProofReaderAccess from "../../middlewares/validators/require-proof-reader-access";
import teamOwnerOrAdminValidator from "../../middlewares/validators/team-owner-or-admin-validator";
import { ServerResponse } from "../../models/server-response";
import safeControllerFunction from "../../shared/safe-controller-function";

export const MAX_PROOF_READER_IMAGE_BYTES = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_READER_IMAGE_BYTES },
});

const proofReaderApiRouter = express.Router();

const handleUpload = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  upload.single("file")(req, res, err => {
    if (!err) return next();

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .send(new ServerResponse(false, null, "Upload a PNG, JPEG, WebP, or GIF up to 8 MB."));
    }

    return res.status(400).send(new ServerResponse(false, null, "Unable to process the uploaded file"));
  });
};

proofReaderApiRouter.get("/access", safeControllerFunction(ProofReaderController.getMyAccess));
proofReaderApiRouter.get(
  "/access/members",
  teamOwnerOrAdminValidator,
  safeControllerFunction(ProofReaderController.getAccessMembers)
);
proofReaderApiRouter.put(
  "/access",
  teamOwnerOrAdminValidator,
  safeControllerFunction(ProofReaderController.updateAccess)
);

proofReaderApiRouter.use(requireProofReaderAccess);

proofReaderApiRouter.get("/settings", safeControllerFunction(ProofReaderController.getSettings));
proofReaderApiRouter.put(
  "/settings",
  teamOwnerOrAdminValidator,
  safeControllerFunction(ProofReaderController.updateSettings)
);

proofReaderApiRouter.get("/sub-prompts", safeControllerFunction(ProofReaderController.listSubPrompts));
proofReaderApiRouter.post("/sub-prompts", safeControllerFunction(ProofReaderController.createSubPrompt));
proofReaderApiRouter.put(
  "/sub-prompts/:id",
  idParamValidator,
  safeControllerFunction(ProofReaderController.updateSubPrompt)
);
proofReaderApiRouter.delete(
  "/sub-prompts/:id",
  idParamValidator,
  safeControllerFunction(ProofReaderController.deleteSubPrompt)
);

proofReaderApiRouter.get("/", safeControllerFunction(ProofReaderController.listReviews));
proofReaderApiRouter.post(
  "/",
  handleUpload,
  safeControllerFunction(ProofReaderController.createReview)
);

export default proofReaderApiRouter;
