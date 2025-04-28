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

import { memo, useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useVision } from "../../contexts/VisionContext";
import "./settings-panel.scss";

// Video source types
export type VideoSource = "webcam" | "whep" | null;

// Extend window interface to include our toggleSidePanel function
declare global {
  interface Window {
    toggleSidePanel?: (isOpen?: boolean) => void;
  }
}

export type SettingsPanelProps = {
  isVisible: boolean;
  onClose: () => void;
  activeVideoSource: VideoSource | null;
  onVideoSourceChange: (source: VideoSource) => void;
  pollingInterval: number;
  onPollingIntervalChange: (interval: number) => void;
  isPollingEnabled: boolean;
  onPollingEnabledChange: (enabled: boolean) => void;
  // Vision settings
  frameRate: number;
  onFrameRateChange: (rate: number) => void;
  maxFrames: number;
  onMaxFramesChange: (frames: number) => void;
  // Audio and debug settings
  showAudioDebug: boolean;
  onShowAudioDebugChange: (show: boolean) => void;
  showVolumeControl: boolean;
  onShowVolumeControlChange: (show: boolean) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
};

function SettingsPanel({
  isVisible,
  onClose,
  activeVideoSource,
  onVideoSourceChange,
  pollingInterval,
  onPollingIntervalChange,
  isPollingEnabled,
  onPollingEnabledChange,
  // Vision settings
  frameRate,
  onFrameRateChange,
  maxFrames,
  onMaxFramesChange,
  // Audio and debug settings
  showAudioDebug,
  onShowAudioDebugChange,
  showVolumeControl,
  onShowVolumeControlChange,
  muted,
  onMutedChange
}: SettingsPanelProps) {
  // Get vision context for model selection
  const { 
    openAIConnected, 
    currentModel,
    setCurrentModel 
  } = useVision();
  
  // State for console panel visibility
  const [isSidePanelVisible, setIsSidePanelVisible] = useState<boolean>(false);
  
  // Update local state based on actual side panel state when settings open
  useEffect(() => {
    if (isVisible) {
      // Check if side panel is open
      const sidePanel = document.querySelector('.side-panel');
      setIsSidePanelVisible(sidePanel?.classList.contains('open') || false);
    }
  }, [isVisible]);

  // Set initial state of side panel when component mounts
  useEffect(() => {
    // Ensure the side panel is initialized to match our settings
    if (window.toggleSidePanel) {
      window.toggleSidePanel(isSidePanelVisible);
    }
  }, [isSidePanelVisible]);

  // Toggle side panel visibility
  const toggleSidePanel = (visible: boolean) => {
    setIsSidePanelVisible(visible);
    if (window.toggleSidePanel) {
      window.toggleSidePanel(visible);
    }
  };
  
  // Close on escape key
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape" && isVisible) {
        onClose();
      }
    },
    [isVisible, onClose]
  );

  useEffect(() => {
    // Add event listener for escape key
    document.addEventListener("keydown", handleKeyDown);
    
    // Lock scrolling when panel is open
    if (isVisible) {
      document.body.style.overflow = "hidden";
    }
    
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isVisible, handleKeyDown]);

  if (!isVisible) return null;

  // Render the panel in a portal to make it independent of the DOM hierarchy
  return createPortal(
    <>
      <div className="settings-backdrop" onClick={onClose} />
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose} aria-label="Close settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="settings-content">
          
          <div className="setting-group">
            <h3 className="setting-section-title">Espresso Mode Polling Settings</h3>
            
            <div style={{ 
              opacity: isPollingEnabled ? 1 : 0.5, 
              pointerEvents: isPollingEnabled ? "auto" : "none",
              marginTop: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%"
            }}>
              <label htmlFor="polling-interval">Check interval (seconds):</label>
              <input
                id="polling-interval"
                type="number"
                min="1"
                max="60"
                style={{ width: "100px" }}
                value={pollingInterval}
                onChange={(e) => onPollingIntervalChange(Number(e.target.value))}
                disabled={!isPollingEnabled}
              />
            </div>
          </div>
          
          <div className="setting-group">
            <h3 className="setting-section-title">Video Settings</h3>
            <label htmlFor="video-source">Video Stream Source:</label>
            <select
              id="video-source"
              value={activeVideoSource || ""}
              onChange={(e) => onVideoSourceChange(e.target.value as VideoSource)}
            >
              <option value="" disabled>
                Select a video source
              </option>
              <option value="webcam">Device Camera Feed</option>
              <option value="whep">Neckband Camera Feed</option>
            </select>
          </div>
          
          {/* Model Configuration Section */}
          <div className="setting-group">
            <h3 className="setting-section-title">Vision Setting</h3>

            <div className="setting-row">
              <label htmlFor="vision-frame-rate" className="row-label">Frame Rate (FPS) to capture for the Vision Models:</label>
              <input
                id="vision-frame-rate"
                type="number"
                min="1"
                max="30"
                style={{ width: "80px" }}
                value={frameRate}
                onChange={(e) => onFrameRateChange(Number(e.target.value))}
              />
            </div>

            <div className="setting-row" style={{ marginTop: "10px" }}>
              <label htmlFor="max-frames" className="row-label">Number ofFrames to Send to the Vision Model:</label>
              <input
                id="max-frames"
                type="number"
                min="5"
                max="30"
                style={{ width: "80px" }}
                value={maxFrames}
                onChange={(e) => onMaxFramesChange(Number(e.target.value))}
              />
            </div>

            <div className="model-selection">
              {/* OpenAI Option */}
              <div 
                className={`model-option ${currentModel === "openai" ? "active" : ""}`}
                onClick={() => setCurrentModel("openai")}
              >
                <div className={`model-indicator ${openAIConnected ? "connected" : ""}`} />
                <div className="model-details">
                  <div className="model-name">OpenAI GPT-4o</div>
                  <div className="model-status">
                    {openAIConnected ? "Connected" : "Not connected"}
                  </div>
                </div>
              </div>
              
              {/* Google Option */}
              <div 
                className={`model-option ${currentModel === "google" ? "active" : ""}`}
                onClick={() => setCurrentModel("google")}
              >
                <div className="model-indicator google" />
                <div className="model-details">
                  <div className="model-name">Google Gemini</div>
                  <div className="model-status">Default model</div>
                </div>
              </div>
            </div>
            
            <p className="model-note">
              {openAIConnected 
                ? "OpenAI API key detected from environment variables." 
                : "OpenAI API key not found or invalid. Add REACT_APP_OPENAI_API_KEY to your .env file."
              }
            </p>
          </div>
          
          <div className="setting-group">
            <h3 className="setting-section-title">Debug Panel Settings</h3>
            <div className="setting-row">
              <label htmlFor="show-volume-control" className="row-label">Show Input Volume Control:</label>
              <input
                id="show-volume-control"
                type="checkbox"
                checked={showVolumeControl}
                onChange={(e) => onShowVolumeControlChange(e.target.checked)}
              />
            </div>
            
            <div className="setting-row">
              <label htmlFor="show-audio-debug" className="row-label">Show Audio Debug:</label>
              <input
                id="show-audio-debug"
                type="checkbox"
                checked={showAudioDebug}
                onChange={(e) => onShowAudioDebugChange(e.target.checked)}
              />
            </div>
          </div>

           {/* UI Panel Settings */}
           <div className="setting-group">
            <h3 className="setting-section-title">UI Panels</h3>
            <div className="setting-row">
              <label htmlFor="show-console-panel" className="row-label">Show Console Panel:</label>
              <input
                id="show-console-panel"
                type="checkbox"
                checked={isSidePanelVisible}
                onChange={(e) => toggleSidePanel(e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

export default SettingsPanel;