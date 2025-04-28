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
import { useVision } from "../../contexts/VisionContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWhepStream } from "../../hooks/use-whep-stream";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import AudioPulse from "../audio-pulse/AudioPulse";
import SettingsPanel, { VideoSource } from "../settings-panel/SettingsPanel";
import "./control-tray.scss";
import { usePolling } from "../../contexts/PollingContext";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  audioRecorder?: AudioRecorder | null;
  // Audio and debug settings
  showAudioDebug: boolean;
  onShowAudioDebugChange: (show: boolean) => void;
  showVolumeControl: boolean;
  onShowVolumeControlChange: (show: boolean) => void;
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
  audioRecorder: providedAudioRecorder = null,
  // Audio and debug settings
  showAudioDebug,
  onShowAudioDebugChange,
  showVolumeControl,
  onShowVolumeControlChange,
}: ControlTrayProps) {
  // Initialize the video streams
  const whepStream = useWhepStream();
  const webcam = useWebcam();
  const screenCapture = useScreenCapture();
  const videoStreams = [whepStream, webcam, screenCapture];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [inVolume, setInVolume] = useState(0);
  // Use provided audioRecorder or create a new one if not provided
  const [audioRecorder] = useState(() => providedAudioRecorder || new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const audioStartedRef = useRef<boolean>(false);
  
  // Get vision context to send frames
  const { sendFrame, connected: visionConnected, maxFrames, setMaxFrames } = useVision();
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [activeVideoSource, setActiveVideoSource] = useState<VideoSource | null>(null);
  const [frameRate, setFrameRate] = useState<number>(5);
  // Use polling context instead of local state
  const { pollingInterval, isPollingEnabled, setPollingInterval, setIsPollingEnabled } = usePolling();

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

  // Validate frame rate
  useEffect(() => {
    if (frameRate < 1) {
      setFrameRate(1);
    } else if (frameRate > 30) {
      setFrameRate(30);
    }
  }, [frameRate]);

  // Main audio streaming effect
  useEffect(() => {
    // Make sure we don't try to start recording multiple times
    if (audioStartedRef.current) {
      return;
    }

    const onData = (base64: string) => {
      if (connected && !muted) {
        client.sendRealtimeInput([
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64,
          },
        ]);
      }
    };
    
    
    const startAudioRecording = async () => {
      if (connected && !muted && audioRecorder) {
        try {
          console.log("Starting audio recorder...");
          audioStartedRef.current = true;
          
          // If there's an active video stream with audio tracks, use that
          if (activeVideoStream && activeVideoStream.getAudioTracks().length > 0) {
            console.log("Using audio tracks from video stream:", 
                         activeVideoStream.getAudioTracks().map(t => `${t.label} (enabled: ${t.enabled})`));
            
            // Ensure tracks are enabled
            activeVideoStream.getAudioTracks().forEach(track => {
              track.enabled = true;
              console.log(`Track ${track.label} enabled status: ${track.enabled}`);
            });
            
            await audioRecorder.start(activeVideoStream);
          } else {
            // Otherwise try to get microphone or use fallback
            console.log("No video stream audio tracks found, using microphone");
            await audioRecorder.start();
          }
          
          audioRecorder
            .on("data", onData)
            .on("volume", setInVolume);
            
          console.log("Audio recorder started successfully");
        } catch (err) {
          console.error("Failed to start audio recording:", err);
          audioStartedRef.current = false;
        }
      } else if (!connected || muted) {
        audioRecorder.stop();
        audioStartedRef.current = false;
      }
    };
    
    startAudioRecording();
    
    return () => {
      audioRecorder.off("data", onData).off("volume", setInVolume);
      if (audioStartedRef.current) {
        audioRecorder.stop();
        audioStartedRef.current = false;
      }
    };
  }, [connected, client, muted, audioRecorder, activeVideoStream]);

  // Reset audio started ref when connection state changes
  useEffect(() => {
    if (!connected) {
      audioStartedRef.current = false;
    }
  }, [connected]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
      
      // Keep the video element muted - we don't want to hear the stream audio
      // Only the Gemini audio output should be heard
      if (!videoRef.current.muted) {
        videoRef.current.muted = true;
      }
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        
        // Send frame to main LiveAPI
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
        
        // Also send to vision context if connected and polling is enabled
        if (visionConnected && isPollingEnabled) {
          sendFrame(base64);
        }
      }
      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / frameRate);
      }
    }
    if (connected && activeVideoStream !== null) {
      requestAnimationFrame(sendVideoFrame);
    }
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef, visionConnected, isPollingEnabled, sendFrame, frameRate]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    try {
      // First stop current audio recording if active
      if (audioStartedRef.current) {
        audioRecorder.stop();
        audioStartedRef.current = false;
      }
      
      if (next) {
        const mediaStream = await next.start();
        
        // Log audio tracks in the stream
        const audioTracks = mediaStream.getAudioTracks();
        console.log(`Media stream has ${audioTracks.length} audio tracks:`, 
                     audioTracks.map(t => `${t.label} (enabled: ${t.enabled})`));
        
        // Make sure audio tracks are enabled
        audioTracks.forEach(track => {
          if (!track.enabled) {
            console.log(`Enabling audio track: ${track.label}`);
            track.enabled = true;
          }
        });
        
        setActiveVideoStream(mediaStream);
        onVideoStreamChange(mediaStream);
        if (next.type === "webcam") {
          setActiveVideoSource("webcam");
        } else if (next.type === "whep") {
          setActiveVideoSource("whep");
        } else {
          setActiveVideoSource(null);
        }
        
        // Start audio recorder after setting the new stream
        if (connected && !muted) {
          setTimeout(() => {
            if (audioStartedRef.current) {
              audioRecorder.stop();
            }
            audioStartedRef.current = false;
            audioRecorder.start(mediaStream);
            audioStartedRef.current = true;
          }, 500);
        }
      } else {
        setActiveVideoStream(null);
        onVideoStreamChange(null);
        setActiveVideoSource(null);
      }

      videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
    } catch (error) {
      console.error("Error changing streams:", error);
    }
  };

  // Handle video source selection from settings panel
  const handleVideoSourceChange = (source: VideoSource) => {
    if (source === "webcam") {
      changeStreams(webcam)();
    } else if (source === "whep") {
      changeStreams(whepStream)();
    }
    
    // Keep settings open
  };

  // Toggle settings panel
  const toggleSettingsPanel = () => {
    setShowSettings(!showSettings);
  };

  return (
    <>
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
                isStreaming={whepStream.isStreaming || webcam.isStreaming}
                start={changeStreams(activeVideoSource === "webcam" ? webcam : whepStream)}
                stop={changeStreams()}
                onIcon="videocam_off"
                offIcon="videocam"
              />
              <button
                className="action-button settings-button"
                onClick={toggleSettingsPanel}
                aria-label="Settings"
              >
                <span className="material-symbols-outlined">settings</span>
              </button>
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
                    if (!whepStream.isStreaming && !webcam.isStreaming && !activeVideoStream) {
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

      <SettingsPanel
        isVisible={showSettings}
        onClose={() => setShowSettings(false)}
        activeVideoSource={activeVideoSource}
        onVideoSourceChange={handleVideoSourceChange}
        pollingInterval={pollingInterval}
        onPollingIntervalChange={setPollingInterval}
        isPollingEnabled={isPollingEnabled}
        onPollingEnabledChange={setIsPollingEnabled}
        frameRate={frameRate}
        onFrameRateChange={setFrameRate}
        maxFrames={maxFrames}
        onMaxFramesChange={setMaxFrames}
        muted={muted}
        onMutedChange={setMuted}
        showAudioDebug={showAudioDebug}
        onShowAudioDebugChange={onShowAudioDebugChange}
        showVolumeControl={showVolumeControl}
        onShowVolumeControlChange={onShowVolumeControlChange}
      />
    </>
  );
}

export default memo(ControlTray);