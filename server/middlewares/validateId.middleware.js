import { objectIdSchema } from "../validators/common.validator.js";

export default function (req, res, next, id) {
  const result = objectIdSchema.safeParse(id);
  if (!result.success) {
    return res.status(400).json({
      error: `Invalid ID: ${id}. Must be a 24-character hexadecimal ObjectId.`,
      message: `Invalid ID: ${id}`,
    });
  }
  next();
}
