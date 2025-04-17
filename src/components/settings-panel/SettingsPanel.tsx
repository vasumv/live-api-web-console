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
};

function SettingsPanel({
  isVisible,
  onClose,
  activeVideoSource,
  onVideoSourceChange,
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
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="settings-content">
          <div className="setting-group">
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
        </div>
      </div>
    </>,
    document.body
  );
}

export default memo(SettingsPanel); 