import User from "../models/user.model.js";
import Session from "../models/session.model.js";
import File from "../models/file.model.js";
import Directory from "../models/directory.model.js";
import { deletePhysicalFile, getPhysicalFileSize } from "../utils/storagePath.js";

/**
 * Verify Admin Access Endpoint
 */
export const verifyAdminAccess = async (req, res) => {
  return res.status(200).json({
    authorized: true,
    user: {
      id: req.foundUser._id,
      name: req.foundUser.name,
      email: req.foundUser.email,
      role: req.foundUser.role,
    },
  });
};

/**
 * Get System-wide Admin Telemetry (User and Session counts)
 */
export const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminsCount = await User.countDocuments({ role: "Admin" });

    // Active users: count of distinct users with a live session
    const activeSessionUserIds = await Session.distinct("userId");
    const activeUsers = activeSessionUserIds.length;

    return res.status(200).json({
      totalUsers,
      activeUsers,
      adminsCount,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({ error: "Failed to fetch admin stats" });
  }
};

/**
 * Get all users list with role, status, and zero storage metrics
 */
export const getAllUsers = async (req, res) => {
  try {
    const { filter, search } = req.query;
    const currentAdminId = req.foundUser._id.toString();

    const query = {};

    if (filter === "admins") {
      query.role = "Admin";
    }

    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).lean();
    const activeUserIdsSet = new Set(
      (await Session.distinct("userId")).map((id) => id.toString())
    );

    const usersWithStats = users
      .map((u) => {
        const uId = u._id.toString();
        const isActive = activeUserIdsSet.has(uId);

        if (filter === "active" && !isActive) {
          return null;
        }

        const isCurrentUser = uId === currentAdminId;
        const isAdmin = u.role === "Admin";
        // Check rule: Cannot delete self AND cannot delete other admin
        const canDelete = !isCurrentUser && !isAdmin;

        return {
          id: uId,
          name: u.name || (u.email ? u.email.split("@")[0] : "User"),
          email: u.email,
          avatar: u.profile,
          role: u.role || "User",
          status: isActive ? "Active" : "Logged Out",
          isCurrentUser,
          canDelete,
          createdAt: u.createdAt,
        };
      })
      .filter(Boolean);

    return res.status(200).json(usersWithStats);
  } catch (error) {
    console.error("Admin users list error:", error);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
};

/**
 * Get user by ID
 */
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).lean();

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const activeSession = await Session.findOne({ userId }).lean();

    return res.status(200).json({
      id: user._id.toString(),
      name: user.name || (user.email ? user.email.split("@")[0] : "User"),
      email: user.email,
      avatar: user.profile,
      role: user.role || "User",
      status: activeSession ? "Active" : "Logged Out",
      authProvider: user.authProvider,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Admin getUserById error:", error);
    return res.status(500).json({ error: "Failed to fetch user details" });
  }
};

/**
 * Get target user's files and directories for Admin inspection
 */
export const getUserStorage = async (req, res) => {
  try {
    const { userId } = req.params;
    const { dirId } = req.query;

    const targetUser = await User.findById(userId).lean();
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // 1. Locate or auto-provision root directory for this user
    let rootDir = null;
    if (targetUser.rootDirId) {
      rootDir = await Directory.findOne({
        _id: targetUser.rootDirId,
        userId: targetUser._id,
      }).lean();
    }
    if (!rootDir) {
      rootDir = await Directory.findOne({
        parentDirId: null,
        userId: targetUser._id,
      }).lean();
    }
    if (!rootDir) {
      const newRoot = await Directory.create({
        name: "root",
        parentDirId: null,
        userId: targetUser._id,
      });
      rootDir = newRoot.toObject();
      await User.findByIdAndUpdate(targetUser._id, {
        $set: { rootDirId: rootDir._id },
      });
    }

    // 2. Resolve current target directory
    let currentDir = rootDir;
    if (dirId && dirId !== "root" && dirId !== rootDir._id.toString()) {
      const foundDir = await Directory.findOne({
        _id: dirId,
        userId: targetUser._id,
      }).lean();
      if (foundDir) {
        currentDir = foundDir;
      }
    }

    // 3. Fetch subdirectories and files
    const [rawDirs, rawFiles] = await Promise.all([
      Directory.find({
        parentDirId: currentDir._id,
        userId: targetUser._id,
        isTrashed: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean(),
      File.find({
        parentDirId: currentDir._id,
        userId: targetUser._id,
        isTrashed: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const formattedDirs = rawDirs.map((d) => ({
      id: d._id.toString(),
      name: d.name,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      isDirectory: true,
      type: "directory",
    }));

    const formattedFiles = rawFiles.map((f) => ({
      id: f._id.toString(),
      name: f.name,
      size: getPhysicalFileSize(f._id, f.extension),
      extension: f.extension,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      isDirectory: false,
      type: "file",
    }));

    // 4. Construct navigation breadcrumbs
    const isRoot = currentDir._id.toString() === rootDir._id.toString();
    const breadcrumbs = [];

    if (isRoot) {
      breadcrumbs.push({ id: "root", name: "root" });
    } else {
      let walk = currentDir;
      const visited = new Set();
      while (walk && !visited.has(walk._id.toString())) {
        visited.add(walk._id.toString());
        const atRoot = walk._id.toString() === rootDir._id.toString();
        breadcrumbs.unshift({
          id: atRoot ? "root" : walk._id.toString(),
          name: atRoot ? "root" : walk.name,
        });
        if (atRoot || !walk.parentDirId) break;
        walk = await Directory.findOne({
          _id: walk.parentDirId,
          userId: targetUser._id,
        }).lean();
      }

      if (breadcrumbs.length === 0 || breadcrumbs[0].id !== "root") {
        breadcrumbs.unshift({ id: "root", name: "root" });
      }
    }

    return res.status(200).json({
      user: {
        id: targetUser._id.toString(),
        name:
          targetUser.name ||
          (targetUser.email ? targetUser.email.split("@")[0] : "User"),
        email: targetUser.email,
        avatar: targetUser.profile,
        role: targetUser.role || "User",
        createdAt: targetUser.createdAt,
      },
      currentDirectoryId: isRoot ? "root" : currentDir._id.toString(),
      currentDirectoryName: isRoot ? "root" : currentDir.name,
      breadcrumbs,
      directories: formattedDirs,
      files: formattedFiles,
    });
  } catch (error) {
    console.error("Admin getUserStorage error:", error);
    return res.status(500).json({ error: "Failed to fetch user storage" });
  }
};

/**
 * Update Role for a user (RBAC: "Admin" | "User")
 */
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!["Admin", "User"].includes(role)) {
      return res.status(400).json({ error: 'Role must be either "Admin" or "User"' });
    }

    // Safety check: Prevent admin from demoting themselves if they are the last admin
    if (req.foundUser._id.toString() === userId && role !== "Admin") {
      const adminCount = await User.countDocuments({ role: "Admin" });
      if (adminCount <= 1) {
        return res
          .status(400)
          .json({ error: "Action Denied: Cannot demote the sole system administrator." });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { role } },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.status(200).json({
      message: `User role updated to ${role} successfully`,
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role,
      },
    });
  } catch (error) {
    console.error("Update role error:", error);
    return res.status(500).json({ error: "Failed to update role" });
  }
};

/**
 * Force logout user session(s)
 */
export const forceLogoutUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessionCount = await Session.countDocuments({ userId });
    if (sessionCount === 0) {
      return res.status(200).json({ message: "User does not have any active sessions" });
    }
    await Session.deleteMany({ userId });
    return res.status(200).json({ message: "User session(s) terminated successfully" });
  } catch (error) {
    console.error("Force logout error:", error);
    return res.status(500).json({ error: "Failed to logout user sessions" });
  }
};

/**
 * Delete User Account & Files
 * Checks enforced:
 * 1. Admin cannot delete itself
 * 2. Admin cannot delete other admin
 */
export const deleteUserAccount = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentAdminId = req.foundUser._id.toString();

    // Check 1: Admin cannot delete themselves
    if (currentAdminId === userId) {
      return res.status(400).json({
        error: "Action Denied: You cannot delete your own admin account.",
        code: "CANNOT_DELETE_SELF",
      });
    }

    // Check 2: Admin cannot delete other administrators
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.role === "Admin") {
      return res.status(403).json({
        error: "Action Denied: Administrators cannot delete other administrators.",
        code: "CANNOT_DELETE_ADMIN",
      });
    }

    // Proceed with deletion: Clean physical storage files first
    const userFiles = await File.find({ userId }).lean();
    for (const f of userFiles) {
      try {
        await deletePhysicalFile(f._id, f.extension);
      } catch (err) {
        console.error("Error deleting physical file:", err);
      }
    }

    // Clean MongoDB collections
    await Session.deleteMany({ userId });
    await File.deleteMany({ userId });
    await Directory.deleteMany({ userId });
    await User.findByIdAndDelete(userId);

    return res.status(200).json({ message: "User account and all records deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ error: "Failed to delete user account" });
  }
};
