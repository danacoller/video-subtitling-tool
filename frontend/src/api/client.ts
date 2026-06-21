import axios from "axios";

const api = axios.create({ baseURL: "/api/v1" });

export interface VideoResponse {
  id: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface JobResponse {
  id: string;
  video_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CueResponse {
  id: string;
  video_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CueCreate {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface CuePatch {
  start_ms?: number;
  end_ms?: number;
  text?: string;
}

export async function listVideos(): Promise<VideoResponse[]> {
  const { data } = await api.get<VideoResponse[]>("/videos");
  return data;
}

export async function deleteVideo(id: string): Promise<void> {
  await api.delete(`/videos/${id}`);
}

export async function deleteAllVideos(): Promise<void> {
  await api.delete("/videos");
}

export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void
): Promise<VideoResponse> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<VideoResponse>("/videos", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  });
  return data;
}

export async function getVideo(id: string): Promise<VideoResponse> {
  const { data } = await api.get<VideoResponse>(`/videos/${id}`);
  return data;
}

export function streamUrl(id: string): string {
  return `/api/v1/videos/${id}/stream`;
}

export async function transcribeVideo(id: string): Promise<JobResponse> {
  const { data } = await api.post<JobResponse>(`/videos/${id}/transcribe`);
  return data;
}

export async function getJob(videoId: string): Promise<JobResponse> {
  const { data } = await api.get<JobResponse>(`/videos/${videoId}/job`);
  return data;
}

export async function listCues(videoId: string): Promise<CueResponse[]> {
  const { data } = await api.get<CueResponse[]>(`/videos/${videoId}/subtitles`);
  return data;
}

export async function addCue(
  videoId: string,
  cue: CueCreate
): Promise<CueResponse> {
  const { data } = await api.post<CueResponse>(
    `/videos/${videoId}/subtitles`,
    cue
  );
  return data;
}

export async function updateCue(
  id: string,
  patch: CuePatch
): Promise<CueResponse> {
  const { data } = await api.patch<CueResponse>(`/subtitles/${id}`, patch);
  return data;
}

export async function deleteCue(id: string): Promise<void> {
  await api.delete(`/subtitles/${id}`);
}

export async function bulkReplaceCues(
  videoId: string,
  cues: CueCreate[]
): Promise<CueResponse[]> {
  const { data } = await api.put<CueResponse[]>(
    `/videos/${videoId}/subtitles`,
    { cues }
  );
  return data;
}

export function exportVttUrl(videoId: string): string {
  return `/api/v1/videos/${videoId}/subtitles.vtt`;
}
