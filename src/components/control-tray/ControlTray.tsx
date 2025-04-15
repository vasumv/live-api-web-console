/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from "classnames";

import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWhepStream } from "../../hooks/use-whep-stream";
import { AudioRecorder } from "../../lib/audio-recorder";
import AudioPulse from "../audio-pulse/AudioPulse";
import "./control-tray.scss";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

/**
 * button used for triggering media streams
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    ),
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
}: ControlTrayProps) {
  // Initialize the video streams
  const whepStream = useWhepStream();
  const screenCapture = useScreenCapture();
  const videoStreams = [whepStream, screenCapture];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const { client, connected, connect, disconnect, volume } =
    useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);
  
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`,
    );
  }, [inVolume]);

  // Audio handling - using laptop microphone only
  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: "audio/pcm;rate=16000",
          data: base64,
        },
      ]);
    };
    
    const startAudioRecording = async () => {
      if (connected && !muted && audioRecorder) {
        try {
          console.log("Starting microphone audio recording");
          await audioRecorder.start();
          
          let audioPacketCount = 0;
          const volumeDebugger = (volume: number) => {
            audioPacketCount++;
            if (audioPacketCount % 30 === 0) {
              console.log(`Audio packet #${audioPacketCount}, volume: ${volume.toFixed(4)}`);
            }
            setInVolume(volume);
          };
          
          audioRecorder.on("data", onData).on("volume", volumeDebugger);
        } catch (err) {
          console.error("Failed to start audio recording:", err);
        }
      } else {
        if (audioRecorder.recording) {
          console.log("Stopping audio recording");
          audioRecorder.stop();
        }
      }
    };
    
    startAudioRecording();
    
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  // Video frame capture
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;
    let frameCount = 0;
    let lastFrameTime = Date.now();

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        console.warn("Video or canvas ref is null");
        return;
      }

      const ctx = canvas.getContext("2d")!;
      
      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.warn("Video has zero dimensions, skipping frame capture");
        if (connected) {
          timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
        }
        return;
      }
      
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      
      // Log frame dimensions occasionally
      frameCount++;
      if (frameCount % 10 === 0) {
        const now = Date.now();
        const fps = 10 / ((now - lastFrameTime) / 1000);
        console.log(`Capturing frames: ${canvas.width}x${canvas.height} at ~${fps.toFixed(1)} FPS`);
        lastFrameTime = now;
      }
      
      try {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.8);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      } catch (err) {
        console.error("Error capturing video frame:", err);
      }
      
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    
    if (connected && activeVideoStream !== null) {
      console.log("Starting video frame capture");
      // Wait a moment for the video to initialize
      timeoutId = window.setTimeout(() => {
        if (videoRef.current && videoRef.current.readyState >= 2) { // HAVE_CURRENT_DATA or better
          requestAnimationFrame(sendVideoFrame);
        } else {
          console.warn("Video not ready, delaying frame capture");
          timeoutId = window.setTimeout(() => requestAnimationFrame(sendVideoFrame), 1000);
        }
      }, 500);
    }
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <nav className={cn("actions-nav", { disabled: !connected })}>
        <button
          className={cn("action-button mic-button")}
          onClick={() => setMuted(!muted)}
        >
          {!muted ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="action-button no-action outlined">
          <AudioPulse volume={volume} active={connected} hover={false} />
        </div>

        {supportsVideo && (
          <>
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              onIcon="cancel_presentation"
              offIcon="present_to_all"
            />
            <MediaStreamButton
              isStreaming={whepStream.isStreaming}
              start={changeStreams(whepStream)}
              stop={changeStreams()}
              onIcon="videocam_off"
              offIcon="videocam"
            />
          </>
        )}
        {children}
      </nav>

      <div className={cn("connection-container", { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn("action-button connect-toggle", { connected })}
            onClick={async () => {
              if (connected) {
                disconnect();
              } else {
                try {
                  await connect();
                  
                  // Auto-start the WHEP stream if not already streaming
                  if (!whepStream.isStreaming && !activeVideoStream) {
                    changeStreams(whepStream)();
                  }
                } catch (err) {
                  console.error("Failed to connect:", err);
                }
              }
            }}
          >
            <span className="material-symbols-outlined filled">
              {connected ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
    </section>
  );
}

export default memo(ControlTray);