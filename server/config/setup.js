import mongoose from "mongoose";
import { connectDB } from "./db.js";

await connectDB();
const client = mongoose.connection.getClient();

try {
  const db = mongoose.connection.db;

  const command = "collMod";

  // User (Passwordless Authentication, OIDC Ready)
  await db.command({
    [command]: "users",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "rootDirId", "authProvider", "role"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          role: {
            bsonType: "string",
            enum: ["User", "Admin"],
            description: "user authorization role: User or Admin",
          },
          email: {
            bsonType: "string",
            description: "please enter a valid email",
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
          },
          name: {
            bsonType: "string",
            description: "optional display name string",
          },
          profile: {
            bsonType: ["string", "null"],
            description: "user profile avatar URL or SVG string (defaults to null or random SVG)",
          },
          authProvider: {
            bsonType: "object",
            description: "authentication provider client info",
            required: ["emailAuth"],
            properties: {
              emailAuth: {
                bsonType: "bool",
                description: "true if user authenticated via email OTP",
              },
              googleAuth: {
                bsonType: ["string", "null"],
                description: "Google user subject ID",
              },
              githubAuth: {
                bsonType: ["string", "null"],
                description: "GitHub user ID",
              },
            },
            additionalProperties: false,
          },
          integrations: {
            bsonType: "object",
            description: "connected third-party platform integrations",
            properties: {
              googleDrive: {
                bsonType: "object",
                properties: {
                  connected: { bsonType: "bool" },
                  refreshToken: { bsonType: ["string", "null"] },
                  accessToken: { bsonType: ["string", "null"] },
                  expiryDate: { bsonType: ["number", "null"] },
                  email: { bsonType: ["string", "null"] },
                },
                additionalProperties: false,
              },
              googlePhotos: {
                bsonType: "object",
                properties: {
                  connected: { bsonType: "bool" },
                  refreshToken: { bsonType: ["string", "null"] },
                  accessToken: { bsonType: ["string", "null"] },
                  expiryDate: { bsonType: ["number", "null"] },
                  email: { bsonType: ["string", "null"] },
                },
                additionalProperties: false,
              },
            },
            additionalProperties: true,
          },
          rootDirId: {
            bsonType: "objectId",
          },
          preferences: {
            bsonType: "object",
            properties: {
              showAllActionsDirectly: { bsonType: "bool" },
            },
            additionalProperties: true,
          },
          __v: { bsonType: ["int", "number"] },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // Directories
  await db.command({
    [command]: "directories",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "userId", "parentDirId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          name: {
            bsonType: "string",
          },
          userId: {
            bsonType: "objectId",
          },
          parentDirId: {
            bsonType: ["objectId", "null"],
          },
          source: {
            bsonType: "string",
            enum: [
              "meghvault",
              "google-drive",
              "google-photos",
              "github",
              "instagram",
            ],
            description: "platform source owner",
          },
          isTrashed: {
            bsonType: "bool",
            description: "true if directory is in trash",
          },
          trashedAt: {
            bsonType: ["date", "null"],
            description: "timestamp when directory was moved to trash",
          },
          trashedDirectly: {
            bsonType: "bool",
            description: "true if user directly trashed this directory",
          },
          originalParentDirId: {
            bsonType: ["objectId", "null"],
            description: "original parent directory id before trashing",
          },
          __v: { bsonType: ["int", "number"] },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // Files
  await db.command({
    [command]: "files",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "name", "extension", "userId", "parentDirId"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          name: {
            bsonType: "string",
          },
          extension: {
            bsonType: "string",
          },
          userId: {
            bsonType: "objectId",
          },
          parentDirId: {
            bsonType: "objectId",
          },
          source: {
            bsonType: "string",
            enum: [
              "meghvault",
              "google-drive",
              "google-photos",
              "github",
              "instagram",
            ],
            description: "platform source owner",
          },
          isTrashed: {
            bsonType: "bool",
            description: "true if file is in trash",
          },
          trashedAt: {
            bsonType: ["date", "null"],
            description: "timestamp when file was moved to trash",
          },
          trashedDirectly: {
            bsonType: "bool",
            description: "true if user directly trashed this file",
          },
          originalParentDirId: {
            bsonType: ["objectId", "null"],
            description: "original parent directory id before trashing",
          },
          __v: { bsonType: ["int", "number"] },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // Sessions
  await db.command({
    collMod: "sessions",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "createdAt"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          userId: {
            bsonType: "objectId",
            description: "userId must be an ObjectId and is required",
          },
          createdAt: {
            bsonType: "date",
            description: "createdAt must be a valid date and is required",
          },
          __v: {
            bsonType: ["int", "number"],
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // OTP
  await db.command({
    collMod: "otps",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "email", "otp", "createdAt"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          email: {
            bsonType: "string",
            pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
            description: "email must be a valid email string and is required",
          },
          otp: {
            bsonType: "string",
            description: "otp must be a string and is required",
          },
          createdAt: {
            bsonType: "date",
            description: "createdAt must be a valid date and is required",
          },
          __v: {
            bsonType: ["int", "number"],
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // Activities (Audit Trail & Recent Activity Feed)
  const existingCollections = await db.listCollections({ name: "activities" }).toArray();
  if (existingCollections.length === 0) {
    await db.createCollection("activities");
  }
  await db.command({
    collMod: "activities",
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["_id", "userId", "resourceType", "resourceId", "action", "createdAt"],
        properties: {
          _id: {
            bsonType: "objectId",
          },
          userId: {
            bsonType: "objectId",
          },
          resourceType: {
            bsonType: "string",
            enum: ["file", "directory"],
          },
          resourceId: {
            bsonType: "objectId",
          },
          action: {
            bsonType: "string",
            enum: [
              "upload",
              "view",
              "download",
              "rename",
              "share",
              "star",
              "restore",
              "trash",
              "import",
              "move",
            ],
          },
          details: {
            bsonType: "object",
            properties: {
              name: { bsonType: ["string", "null"] },
              previousName: { bsonType: ["string", "null"] },
              sharedWithEmail: { bsonType: ["string", "null"] },
              extension: { bsonType: ["string", "null"] },
              size: { bsonType: ["int", "number", "null"] },
              source: { bsonType: ["string", "null"] },
              fromDirectoryName: { bsonType: ["string", "null"] },
              toDirectoryName: { bsonType: ["string", "null"] },
            },
            additionalProperties: true,
          },
          createdAt: {
            bsonType: "date",
          },
          __v: {
            bsonType: ["int", "number"],
          },
        },
        additionalProperties: false,
      },
    },
    validationAction: "error",
    validationLevel: "strict",
  });

  // Create high-performance compound & 24h TTL indexes on activities
  const activitiesColl = db.collection("activities");
  await activitiesColl.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 24 * 60 * 60 }
  );
  await activitiesColl.createIndex({ userId: 1, createdAt: -1 });
  await activitiesColl.createIndex({ userId: 1, resourceId: 1, action: 1, createdAt: -1 });
} catch (err) {
  console.log("Error setting up the database", err);
} finally {
  await client.close();
}
