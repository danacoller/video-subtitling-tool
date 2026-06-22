import { useCallback, useEffect, useState } from "react";
import {
  VideoResponse,
  deleteAllVideos,
  deleteVideo,
  listVideos,
} from "../api/client";

export function useLibrary() {
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVideos(await listVideos());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    await deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const removeAll = useCallback(async () => {
    await deleteAllVideos();
    setVideos([]);
  }, []);

  const prepend = useCallback((video: VideoResponse) => {
    setVideos((prev) => [video, ...prev]);
  }, []);

  return { videos, loading, load, remove, removeAll, prepend };
}
