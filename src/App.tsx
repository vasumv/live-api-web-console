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

import { useRef, useState } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import SidePanel from "./components/side-panel/SidePanel";
import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import AudioStreamDebug from "./AudioStreamDebug";
import VolumeControl from "./components/volume-control/VolumeControl";
import { AudioRecorder } from "./lib/audio-recorder";
import cn from "classnames";
// import { Expresso } from "./components/espresso/Expresso";
import { Expresso } from "./components/espresso/ExpressoPolling";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const host = "generativelanguage.googleapis.com";
const uri = `wss://${host}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;

function App() {
  // this video reference is used for displaying the active stream, whether that is the WHEP stream or screen capture
  const videoRef = useRef<HTMLVideoElement>(null);
  // either the screen capture, the WHEP stream or null, if null we hide it
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  // Debug mode for audio diagnostics
  const [showAudioDebug, setShowAudioDebug] = useState(false);
  // Show volume control
  const [showVolumeControl, setShowVolumeControl] = useState(false);
  // Create a shared audio recorder with initial boost factor of 2.5
  const [audioRecorder] = useState(() => new AudioRecorder(16000, 2.5));

  return (
    <div className="App">
      <LiveAPIProvider url={uri} apiKey={API_KEY}>
        <div className="streaming-console">
          <SidePanel />
          <main>
            <div className="main-app-area">
              {/* APP goes here */}
              {/* <Altair /> */}
              <Expresso /> 
              <video
                className={cn("stream", {
                  hidden: !videoRef.current || !videoStream,
                })}
                ref={videoRef}
                autoPlay
                playsInline
                muted={true} /* Mute the video element so we don't hear the stream audio */
              />
              
              {/* Audio debug overlay (conditional) */}
              {showAudioDebug && videoStream && (
                <AudioStreamDebug stream={videoStream} />
              )}
              
              {/* Volume control overlay (conditional) */}
              {showVolumeControl && (
                <VolumeControl audioRecorder={audioRecorder} />
              )}
            </div>

            <ControlTray
              videoRef={videoRef}
              supportsVideo={true}
              onVideoStreamChange={setVideoStream}
              audioRecorder={audioRecorder}
            >
              {/* Audio debug toggle button */}
              <button 
                className="action-button"
                onClick={() => setShowAudioDebug(!showAudioDebug)}
                title={showAudioDebug ? "Hide audio debug" : "Show audio debug"}
              >
                <span className="material-symbols-outlined">
                  {showAudioDebug ? "hearing" : "hearing_disabled"}
                </span>
              </button>
              
              {/* Volume control toggle button */}
              <button 
                className="action-button"
                onClick={() => setShowVolumeControl(!showVolumeControl)}
                title={showVolumeControl ? "Hide volume control" : "Show volume control"}
              >
                <span className="material-symbols-outlined">
                  {showVolumeControl ? "volume_up" : "volume_off"}
                </span>
              </button>
            </ControlTray>
          </main>
        </div>
      </LiveAPIProvider>
    </div>
  );
}

export default App;