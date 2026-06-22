import { forwardRef, useImperativeHandle, useRef } from "react";
import { streamUrl } from "../api/client";
import { VIDEO_FRAME } from "../styles/theme";

interface Props {
  videoId: string;
  onTimeUpdate?: (ms: number) => void;
}

export interface VideoPlayerHandle {
  seekTo: (ms: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(
  ({ videoId, onTimeUpdate }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useImperativeHandle(ref, () => ({
      seekTo(ms: number) {
        if (videoRef.current) {
          videoRef.current.currentTime = ms / 1000;
        }
      },
    }));

    return (
      <video
        ref={videoRef}
        src={streamUrl(videoId)}
        controls
        style={{
          ...VIDEO_FRAME,
          borderRadius: 8,
          background: "#000",
        }}
        onTimeUpdate={() => {
          if (videoRef.current && onTimeUpdate) {
            onTimeUpdate(Math.floor(videoRef.current.currentTime * 1000));
          }
        }}
      />
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
