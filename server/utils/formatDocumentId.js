// Helper function to map MongoDB '_id' to frontend 'id' and compute accurate timestamps
export const formatDocument = (doc) => {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  const idStr = _id ? _id.toString() : "";

  // Derive timestamp from document createdAt or MongoDB ObjectId's first 4 bytes
  let createdAt = doc.createdAt;
  if (!createdAt && idStr && idStr.length === 24) {
    try {
      const ts = parseInt(idStr.substring(0, 8), 16) * 1000;
      if (!isNaN(ts) && ts > 0) {
        createdAt = new Date(ts).toISOString();
      }
    } catch {}
  }
  const updatedAt = doc.updatedAt || createdAt;

  return { id: idStr, createdAt, updatedAt, ...rest };
};
