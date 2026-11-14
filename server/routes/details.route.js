import express from "express";
import { getResourceDetails } from "../controller/details.controller.js";
import {
  validate,
  resourceDetailsParamValidator,
} from "../validators/index.js";

const router = express.Router();

router.get(
  "/:resourceType/:id",
  validate(resourceDetailsParamValidator),
  getResourceDetails
);

export default router;
