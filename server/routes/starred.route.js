import express from "express";
import {
  toggleStar,
  getStarredItems,
  getStarredIds,
} from "../controller/starred.controller.js";
import { validate, toggleStarValidator } from "../validators/index.js";

const router = express.Router();

router.post("/toggle", validate(toggleStarValidator), toggleStar);
router.get("/ids", getStarredIds);
router.get("/", getStarredItems);

export default router;
