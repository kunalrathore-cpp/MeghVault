import express from "express";
import {
  getRecentActivities,
  clearRecentActivities,
} from "../controller/activity.controller.js";
import {
  validate,
  recentActivitiesQueryValidator,
} from "../validators/index.js";

const router = express.Router();

router.get("/", validate(recentActivitiesQueryValidator), getRecentActivities);
router.delete("/clear", clearRecentActivities);
router.delete("/", clearRecentActivities);

export default router;
