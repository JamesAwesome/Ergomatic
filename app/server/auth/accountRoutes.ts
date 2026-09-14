import { Router } from "express";
import type { Attempts } from "./attempts.js";
import type { SessionStore } from "./sessions.js";
import { requireUser } from "./middleware.js";
import { failure } from "./frontDoorRoutes.js";
import { AuthFailure } from "./frontDoorErrors.js";

export function createAccountRoutes(deps: {
  attempts: Attempts;
  sessions: SessionStore;
}) {
  const { attempts, sessions } = deps;
  const router = Router();
  router.delete(
    "/api/auth/methods/:provider",
    requireUser(sessions),
    async (req, res) => {
      try {
        const provider = req.params.provider;
        if (provider !== "apple" && provider !== "google")
          throw new AuthFailure("invalid_request");
        res.json(await attempts.unlink(req.user!.id, provider));
      } catch (error) {
        failure(res, error);
      }
    },
  );
  return router;
}
