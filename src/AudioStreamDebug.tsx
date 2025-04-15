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

import React, { useEffect, useState } from 'react';

interface AudioStreamDebugProps {
  stream: MediaStream | null;
}

/**
 * Simple component to display debug information about an audio stream
 */
const AudioStreamDebug: React.FC<AudioStreamDebugProps> = ({ stream }) => {
  const [audioInfo, setAudioInfo] = useState<{
    trackCount: number;
    tracks: {
      id: string;
      label: string;
      enabled: boolean;
      muted: boolean;
      readyState: string;
    }[];
  }>({ trackCount: 0, tracks: [] });

  useEffect(() => {
    if (!stream) {
      setAudioInfo({ trackCount: 0, tracks: [] });
      return;
    }

    // Get audio tracks
    const audioTracks = stream.getAudioTracks();
    
    // Map tracks to display format
    const trackInfo = audioTracks.map(track => ({
      id: track.id,
      label: track.label || 'Unnamed track',
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState
    }));
    
    setAudioInfo({
      trackCount: audioTracks.length,
      tracks: trackInfo
    });

    // Listen for track changes
    const handleTrackAdded = () => {
      const updatedTracks = stream.getAudioTracks();
      const updatedInfo = updatedTracks.map(track => ({
        id: track.id,
        label: track.label || 'Unnamed track',
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      }));
      
      setAudioInfo({
        trackCount: updatedTracks.length,
        tracks: updatedInfo
      });
    };

    stream.addEventListener('addtrack', handleTrackAdded);
    stream.addEventListener('removetrack', handleTrackAdded);

    return () => {
      stream.removeEventListener('addtrack', handleTrackAdded);
      stream.removeEventListener('removetrack', handleTrackAdded);
    };
  }, [stream]);

  // Toggle track enabled state
  const toggleTrack = (trackId: string) => {
    if (!stream) return;
    
    const track = stream.getAudioTracks().find(t => t.id === trackId);
    if (track) {
      track.enabled = !track.enabled;
      // Trigger re-render with updated state
      const audioTracks = stream.getAudioTracks();
      const trackInfo = audioTracks.map(track => ({
        id: track.id,
        label: track.label || 'Unnamed track',
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      }));
      
      setAudioInfo({
        trackCount: audioTracks.length,
        tracks: trackInfo
      });
    }
  };

  const debugStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '120px',
    right: '20px',
    background: '#1c1f21',
    border: '1px solid #404547',
    borderRadius: '8px',
    padding: '12px',
    color: '#e1e2e3',
    fontSize: '14px',
    zIndex: 100,
    maxWidth: '300px'
  };

  const headingStyle: React.CSSProperties = {
    fontSize: '16px',
    marginTop: 0,
    marginBottom: '8px',
    color: '#1f94ff'
  };

  const trackItemStyle: React.CSSProperties = {
    marginBottom: '8px',
    padding: '6px',
    background: '#232729',
    borderRadius: '4px'
  };

  const buttonStyle: React.CSSProperties = {
    background: '#0f3557',
    color: '#1f94ff',
    border: 'none',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    cursor: 'pointer',
    marginTop: '4px'
  };

  return (
    <div style={debugStyle}>
      <h3 style={headingStyle}>Audio Stream Debug</h3>
      
      {!stream ? (
        <p>No stream available</p>
      ) : (
        <>
          <p>Audio Tracks: {audioInfo.trackCount}</p>
          
          {audioInfo.trackCount === 0 ? (
            <p style={{ color: '#ff4600' }}>No audio tracks detected!</p>
          ) : (
            <div>
              {audioInfo.tracks.map(track => (
                <div key={track.id} style={trackItemStyle}>
                  <div><strong>Label:</strong> {track.label}</div>
                  <div><strong>Enabled:</strong> {track.enabled ? 'Yes' : 'No'}</div>
                  <div><strong>Muted:</strong> {track.muted ? 'Yes' : 'No'}</div>
                  <div><strong>Ready State:</strong> {track.readyState}</div>
                  <button 
                    style={buttonStyle}
                    onClick={() => toggleTrack(track.id)}
                  >
                    {track.enabled ? 'Disable' : 'Enable'} Track
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AudioStreamDebug;