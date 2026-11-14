import "dotenv/config";
import { connectDB } from "../config/db.js";
import User from "../models/user.model.js";

const email = process.argv[2];
const role = process.argv[3] || "Admin";

if (!email) {
  console.log("Usage: node server/scripts/setRole.js <email> [Admin|User]");
  process.exit(1);
}

if (!["Admin", "User"].includes(role)) {
  console.log('Role must be either "Admin" or "User"');
  process.exit(1);
}

await connectDB();

try {
  const cleanEmail = email.toLowerCase().trim();
  const user = await User.findOneAndUpdate(
    { email: cleanEmail },
    { $set: { role } },
    { returnDocument: "after", runValidators: true }
  );

  if (!user) {
    console.log(`User not found with email: ${cleanEmail}`);
  } else {
    console.log(`Success! Updated ${user.email} (${user.name}) role to: ${user.role}`);
  }
} catch (err) {
  console.error("Error setting role:", err);
} finally {
  process.exit(0);
}
