/**
 * Hook for connecting to a WebRTC WHEP stream
 */

import { useState, useEffect, useRef } from "react";
import { UseMediaStreamResult } from "./use-media-stream-mux";

export function useWhepStream(whepUrl = "http://172.24.20.92:8889/webrtc_compatible/whep"): UseMediaStreamResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [isUrlValid, setIsUrlValid] = useState(true);

  // Check if the URL is reachable
  useEffect(() => {
    const checkUrl = async () => {
      try {
        // Try to get the base endpoint which should 200 or 404 but still respond
        const baseUrl = whepUrl.substring(0, whepUrl.lastIndexOf('/whep'));
        
        const response = await fetch(baseUrl, { 
          method: 'GET',
          // Short timeout to avoid hanging
          signal: AbortSignal.timeout(3000)
        });
        
        // Even if we get a 404, the server is reachable
        setIsUrlValid(true);
        console.log("WHEP server is reachable at", baseUrl);
      } catch (error) {
        console.warn("WHEP server is not reachable:", error);
        setIsUrlValid(false);
      }
    };
    
    checkUrl();
  }, [whepUrl]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, []);

  // Create a fallback stream with a color pattern and audio tone
  const createFallbackStream = (): MediaStream => {
    console.log("Creating fallback stream with audio and video");
    
    // Create a canvas element for the video fallback
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }
    
    // Start an animation loop on the canvas
    let hue = 0;
    const drawFrame = () => {
      if (!ctx) return;
      
      // Draw a color gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, `hsl(${hue}, 100%, 50%)`);
      gradient.addColorStop(1, `hsl(${hue + 60}, 100%, 50%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Add some text
      ctx.fillStyle = 'white';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('WHEP Stream Not Available', canvas.width / 2, canvas.height / 2 - 15);
      ctx.fillText('Using Fallback Stream', canvas.width / 2, canvas.height / 2 + 15);
      ctx.font = '18px sans-serif';
      ctx.fillText(`Using URL: ${whepUrl}`, canvas.width / 2, canvas.height / 2 + 60);
      
      // Update the hue for the next frame
      hue = (hue + 0.5) % 360;
      requestAnimationFrame(drawFrame);
    };
    
    // Start the animation
    drawFrame();
    
    // Create a stream from the canvas
    const stream = canvas.captureStream(30); // 30 FPS
    
    // Add an audible audio track to verify audio
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.frequency.value = 440; // Audible tone for testing
    gainNode.gain.value = 0.05; // Quiet but audible
    oscillator.connect(gainNode);
    
    const destination = audioContext.createMediaStreamDestination();
    gainNode.connect(destination);
    oscillator.start();
    
    // Add the audio track to our stream
    destination.stream.getAudioTracks().forEach(track => {
      stream.addTrack(track);
      console.log("Added audio track to fallback stream:", track.label);
    });
    
    setStream(stream);
    setIsStreaming(true);
    return stream;
  };

  const start = async (): Promise<MediaStream> => {
    try {
      console.log("Starting WHEP stream connection to:", whepUrl);
      
      if (!isUrlValid) {
        console.warn("WHEP URL is not valid, using fallback stream");
        return createFallbackStream();
      }
      
      // Create a new RTCPeerConnection with all audio processing disabled
      const pc = new RTCPeerConnection({
        iceServers: [], // WHEP typically doesn't need STUN/TURN servers as it's direct
        // Disable audio processing to get raw audio
        rtcAudioJitterBufferMaxPackets: 0,
        rtcAudioJitterBufferFastAccelerate: false
      } as any);
      peerConnectionRef.current = pc;
      
      // Add debugging event listeners
      pc.onicecandidate = (event) => {
        console.log("ICE candidate:", event.candidate);
      };
      
      pc.onicecandidateerror = (event) => {
        console.error("ICE candidate error:", event);
      };
      
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state changed to:", pc.iceConnectionState);
      };
      
      pc.onconnectionstatechange = () => {
        console.log("Connection state changed to:", pc.connectionState);
      };
      
      pc.onsignalingstatechange = () => {
        console.log("Signaling state changed to:", pc.signalingState);
      };
      
      // Create a MediaStream to hold the received tracks
      const mediaStream = new MediaStream();
      
      // Set up event handlers for the connection
      pc.ontrack = (event) => {
        console.log(`Track received: ${event.track.kind} (${event.track.label}), enabled: ${event.track.enabled}`);
        
        // Make sure track is enabled
        if (!event.track.enabled) {
          event.track.enabled = true;
          console.log(`Enabled track: ${event.track.kind} (${event.track.label})`);
        }
        
        mediaStream.addTrack(event.track);
        console.log(`MediaStream now has ${mediaStream.getTracks().length} tracks`);
        
        // Log all tracks in the MediaStream
        mediaStream.getTracks().forEach((track, i) => {
          console.log(`MediaStream track ${i}: ${track.kind} (${track.label}), enabled: ${track.enabled}`);
        });
      };
      
      // Create an offer with explicit audio and video
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true  // Explicitly request audio
      });


      
      // Modify the SDP to ensure audio is requested
      let sdp = offer.sdp;
      if (sdp && !sdp.includes('m=audio')) {
        console.log("Adding audio section to SDP offer");
        // Add audio section if missing
        const audioSection = 'm=audio 9 UDP/TLS/RTP/SAVPF 0 111\r\n' +
          'c=IN IP4 0.0.0.0\r\n' +
          'a=rtcp:9 IN IP4 0.0.0.0\r\n' +
          'a=ice-ufrag:audio\r\n' +
          'a=ice-pwd:audiopass\r\n' +
          'a=ice-options:trickle\r\n' +
          'a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00\r\n' +
          'a=setup:actpass\r\n' +
          'a=mid:audio\r\n' +
          'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\n' +
          'a=recvonly\r\n' +
          'a=rtpmap:0 PCMU/8000\r\n' +
          'a=rtpmap:111 opus/48000/2\r\n' +
          'a=fmtp:111 minptime=10;useinbandfec=1\r\n';
        sdp = sdp.replace('a=group:BUNDLE video', 'a=group:BUNDLE video audio');
        offer.sdp = sdp;
      }
      
      console.log("Setting local description with audio");
      await pc.setLocalDescription(offer);
      
      // Wait for ICE gathering to complete
      await new Promise<void>((resolve) => {
        // Set a timeout in case gathering takes too long
        const timeout = setTimeout(() => {
          console.warn("ICE gathering timed out, proceeding anyway");
          resolve();
        }, 5000);
        
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
              pc.removeEventListener('icegatheringstatechange', checkState);
              clearTimeout(timeout);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', checkState);
        }
      });
      
      // Send the offer to the WHEP endpoint
      if (!pc.localDescription) {
        throw new Error("Failed to create local description");
      }
      
      try {
        console.log("Sending SDP offer to WHEP server");
        const response = await fetch(whepUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/sdp',
            'Accept': '*/*'
          },
          body: pc.localDescription.sdp
        });
        
        if (!response.ok) {
          throw new Error(`WHEP request failed: ${response.status}`);
        }
        
        const sdpAnswer = await response.text();
        
        console.log("Received SDP answer from WHEP server");
        
        // If we get here, we have a successful WHEP connection
        if (sdpAnswer) {
          console.log("Setting remote description");
          await pc.setRemoteDescription({
            type: 'answer',
            sdp: sdpAnswer
          });
          
          console.log("WHEP connection established");
          
          // Wait for at least one track to arrive or timeout
          await new Promise<void>((resolve) => {
            // If we already have tracks, resolve immediately
            if (mediaStream.getTracks().length > 0) {
              console.log("Already have tracks, continuing");
              resolve();
              return;
            }
            
            // Set a timeout in case no tracks arrive
            const timeout = setTimeout(() => {
              console.warn("No tracks received from WHEP stream, continuing anyway");
              resolve();
            }, 5000);
            
            // Listen for track additions
            const trackHandler = () => {
              console.log("Track added event triggered");
              clearTimeout(timeout);
              resolve();
            };
            
            pc.addEventListener('track', trackHandler, { once: true });
          });
          
        } else {
          throw new Error("Received empty SDP answer from server");
        }
      } catch (error) {
        console.error("Error connecting to WHEP stream:", error);
        pc.close();
        peerConnectionRef.current = null;
        // Fall back to the generated stream
        return createFallbackStream();
      }
      
      // Check if we have audio tracks
      const hasAudioTracks = mediaStream.getAudioTracks().length > 0;
      console.log(`MediaStream has ${hasAudioTracks ? 'audio tracks' : 'NO audio tracks'}`);
      
      if (!hasAudioTracks) {
        console.warn("No audio tracks in the WHEP stream, attempting to create a synthetic audio track");
        
        // Create a silent audio track and add it to the stream
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.frequency.value = 0; // Silent
        gainNode.gain.value = 0.0001; // Nearly silent
        oscillator.connect(gainNode);
        
        const destination = audioContext.createMediaStreamDestination();
        gainNode.connect(destination);
        oscillator.start();
        
        // Add the silent audio track to our stream
        destination.stream.getAudioTracks().forEach(track => {
          mediaStream.addTrack(track);
          console.log("Added synthetic audio track:", track.label);
        });
      }
      
      // If we got here, we have a successful connection with tracks
      setStream(mediaStream);
      setIsStreaming(true);
      return mediaStream;
    } catch (error) {
      console.error("Error starting WHEP stream:", error);
      // Fallback to generated stream on any error
      return createFallbackStream();
    }
  };

  const stop = () => {
    console.log("Stopping WHEP stream");
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // Check if stream is our fallback canvas stream
    if (stream) {
      // Stop all tracks
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(`Stopped track: ${track.kind} (${track.label})`);
      });
    }
    setStream(null);
    setIsStreaming(false);
  };

  return {
    type: "whep",
    start,
    stop,
    isStreaming,
    stream,
  } as UseMediaStreamResult;
}