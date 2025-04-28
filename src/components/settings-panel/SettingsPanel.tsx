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

import { memo, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import "./settings-panel.scss";

export type VideoSource = "webcam" | "whep";

export type SettingsPanelProps = {
  isVisible: boolean;
  onClose: () => void;
  activeVideoSource: VideoSource | null;
  onVideoSourceChange: (source: VideoSource) => void;
  pollingInterval: number;
  onPollingIntervalChange: (interval: number) => void;
  isPollingEnabled: boolean;
  onPollingEnabledChange: (enabled: boolean) => void;
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
  // Audio and debug settings
  showAudioDebug,
  onShowAudioDebugChange,
  showVolumeControl,
  onShowVolumeControlChange,
  muted,
  onMutedChange
}: SettingsPanelProps) {
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
          
          <div className="setting-group">
            <h3 className="setting-section-title">Status Update Settings</h3>
            <div className="setting-row">
              <label htmlFor="polling-enabled" className="row-label">Auto-check status updates:</label>
              <input
                id="polling-enabled"
                type="checkbox"
                checked={isPollingEnabled}
                onChange={(e) => onPollingEnabledChange(e.target.checked)}
              />
            </div>
            
            <div style={{ 
              opacity: isPollingEnabled ? 1 : 0.5, 
              pointerEvents: isPollingEnabled ? "auto" : "none",
              marginTop: "20px"
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
        </div>
      </div>
    </>,
    document.body
  );
}

export default memo(SettingsPanel); 