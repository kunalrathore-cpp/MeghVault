import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { directoryApi } from "../api/directoryApi";
import { useUpload } from "../context/UploadContext";

export function useDirectory(dirId = null) {
  const [searchParams] = useSearchParams();
  const ticket = searchParams.get("ticket");
  const [directoryData, setDirectoryData] = useState(null);
  const [files, setFiles] = useState([]);
  const [directories, setDirectories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: "My Drive" }]);

  const { refreshTrigger } = useUpload();
  const breadcrumbHistoryRef = useRef(new Map([["root", { id: null, name: "My Drive" }]]));

  const fetchDirectory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await directoryApi.getDirectory(dirId, ticket);
      setDirectoryData(data);

      // Backend returns formatted files & directories arrays
      // Explicitly mark isDirectory and type so all context menus, rename and delete routes match accurately
      const reversedFiles = (data.files || []).slice().reverse().map((f) => ({
        ...f,
        isDirectory: false,
        type: "file",
      }));
      const reversedDirs = (data.directories || []).slice().reverse().map((d) => ({
        ...d,
        isDirectory: true,
        type: "directory",
      }));

      setFiles(reversedFiles);
      setDirectories(reversedDirs);

      // Track breadcrumb trail (authoritative backend breadcrumbs prioritized)
      if (Array.isArray(data.breadcrumbs) && data.breadcrumbs.length > 0) {
        setBreadcrumbs(data.breadcrumbs);
      } else if (dirId) {
        const currentDirName = data.name || "Folder";
        breadcrumbHistoryRef.current.set(dirId, { id: dirId, name: currentDirName, parentDirId: data.parentDirId });

        // Build path backwards using parentDirId if stored
        const trail = [];
        let currId = dirId;
        const visited = new Set();

        while (currId && breadcrumbHistoryRef.current.has(currId) && !visited.has(currId)) {
          visited.add(currId);
          const node = breadcrumbHistoryRef.current.get(currId);
          trail.unshift({ id: node.id, name: node.name });
          currId = node.parentDirId;
        }

        trail.unshift({ id: null, name: "My Drive" });
        setBreadcrumbs(trail);
      } else {
        setBreadcrumbs([{ id: null, name: "My Drive" }]);
      }
    } catch (err) {
      if (err?.status === 401 || err?.data?.requiresPassword) {
        setError("Password verification required to access this protected folder.");
      } else {
        setError(err.message || "Failed to load directory");
      }
    } finally {
      setIsLoading(false);
    }
  }, [dirId, ticket]);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory, refreshTrigger]);

  return {
    directoryData,
    directoryName: dirId ? directoryData?.name || "Folder" : "My Drive",
    files,
    directories,
    isLoading,
    error,
    breadcrumbs,
    refetch: fetchDirectory,
  };
}
