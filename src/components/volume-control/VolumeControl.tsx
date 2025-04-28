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

import React, { useState, useEffect } from 'react';
import { AudioRecorder } from '../../lib/audio-recorder';

interface VolumeControlProps {
  audioRecorder: AudioRecorder | null;
}

const VolumeControl: React.FC<VolumeControlProps> = ({ audioRecorder }) => {
  const [volumeBoost, setVolumeBoost] = useState<number>(2.5);

  // Update the audio recorder when volume changes
  useEffect(() => {
    if (audioRecorder) {
      audioRecorder.setVolumeBoost(volumeBoost);
    }
  }, [volumeBoost, audioRecorder]);

  const controlStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    background: 'var(--Neutral-15)',
    border: '1px solid var(--Neutral-30)',
    borderRadius: '8px',
    padding: '12px',
    color: 'var(--Neutral-90)',
    fontSize: '14px',
    zIndex: 500,
    width: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  };

  const sliderContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };
  
  const labelStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: 'bold',
    color: 'var(--Blue-500)'
  };
  
  const sliderStyle: React.CSSProperties = {
    flex: 1,
    height: '8px',
    WebkitAppearance: 'none',
    appearance: 'none',
    background: 'var(--Neutral-30)',
    outline: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  };
  
  const valueStyle: React.CSSProperties = {
    minWidth: '40px',
    textAlign: 'right',
    fontSize: '13px'
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setVolumeBoost(newValue);
  };

  return (
    <div style={controlStyle}>
      <div style={{ marginBottom: '4px' }}>
        <span style={labelStyle}>Input Volume Boost</span>
      </div>
      <div style={sliderContainerStyle}>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.1"
          value={volumeBoost}
          onChange={handleVolumeChange}
          style={sliderStyle}
        />
        <span style={valueStyle}>{volumeBoost.toFixed(1)}x</span>
      </div>
    </div>
  );
};

export default VolumeControl;