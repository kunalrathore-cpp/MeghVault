import Activity from "../models/activity.model.js";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { getPhysicalFileSize } from "../utils/storagePath.js";

/**
 * GET /api/recent
 * Retrieves chronological recent activities for the authenticated user (within 24 hours)
 */
export const getRecentActivities = async (req, res) => {
  try {
    const userId = req.foundUser._id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    // Strict 24-hour window
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const query = {
      userId,
      createdAt: { $gte: cutoffDate },
    };

    const [activities, totalCount] = await Promise.all([
      Activity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(query),
    ]);

    // Gather unique resource IDs for live status resolution
    const fileIds = [];
    const dirIds = [];
    for (const act of activities) {
      if (act.resourceType === "file") {
        fileIds.push(act.resourceId);
      } else if (act.resourceType === "directory") {
        dirIds.push(act.resourceId);
      }
    }

    const [liveFiles, liveDirs] = await Promise.all([
      File.find({ _id: { $in: fileIds } })
        .select("_id name extension isTrashed source parentDirId")
        .lean(),
      Directory.find({ _id: { $in: dirIds } })
        .select("_id name isTrashed source parentDirId")
        .lean(),
    ]);

    const fileMap = new Map(liveFiles.map((f) => [f._id.toString(), f]));
    const dirMap = new Map(liveDirs.map((d) => [d._id.toString(), d]));

    const formattedActivities = activities.map((act) => {
      const idStr = act.resourceId.toString();
      const liveResource = act.resourceType === "file" ? fileMap.get(idStr) : dirMap.get(idStr);

      let status = "active";
      if (!liveResource) {
        status = "deleted";
      } else if (liveResource.isTrashed) {
        status = "trashed";
      }

      const name = liveResource?.name || act.details?.name || "Untitled";
      const extension = liveResource?.extension ?? act.details?.extension ?? "";
      const isDirectory = act.resourceType === "directory";

      const size =
        !isDirectory && liveResource
          ? getPhysicalFileSize(liveResource._id, liveResource.extension)
          : act.details?.size || 0;

      return {
        id: act._id.toString(),
        activityId: act._id.toString(),
        action: act.action,
        resourceType: act.resourceType,
        resourceId: idStr,
        createdAt: act.createdAt,
        status,
        name,
        extension,
        size,
        source: liveResource?.source || act.details?.source || "meghvault",
        previousName: act.details?.previousName || null,
        sharedWithEmail: act.details?.sharedWithEmail || null,
        isDirectory,
        type: act.resourceType,
        parentDirId: liveResource?.parentDirId || null,
      };
    });

    // De-duplicate activities by resourceId so each unique file/folder appears once with its latest interaction
    const seenResourceIds = new Set();
    const uniqueActivities = [];
    for (const act of formattedActivities) {
      if (!seenResourceIds.has(act.resourceId)) {
        seenResourceIds.add(act.resourceId);
        uniqueActivities.push(act);
      }
    }

    return res.status(200).json({
      activities: uniqueActivities,
      totalCount: uniqueActivities.length,
      page,
      limit,
    });
  } catch (error) {
    console.error("getRecentActivities error:", error);
    return res.status(500).json({ error: "Failed to retrieve recent activities" });
  }
};

/**
 * DELETE /api/recent/clear
 * Clears all recent activity history for the authenticated user
 */
export const clearRecentActivities = async (req, res) => {
  try {
    const userId = req.foundUser._id;
    const result = await Activity.deleteMany({ userId });

    return res.status(200).json({
      message: "Recent activity history cleared successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("clearRecentActivities error:", error);
    return res.status(500).json({ error: "Failed to clear recent activity history" });
  }
};
