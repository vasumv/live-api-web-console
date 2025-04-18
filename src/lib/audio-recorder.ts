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

import { audioContext } from "./utils";
import AudioRecordingWorklet from "./worklets/audio-processing";
import VolMeterWorket from "./worklets/vol-meter";

import { createWorketFromSrc } from "./audioworklet-registry";
import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  var binary = "";
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  gainNode: GainNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;
  externalAudioTrack: MediaStreamTrack | null = null;
  volumeBoost: number = 2.5; // Default boost factor (adjust as needed)

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000, volumeBoost = 2.5) {
    super();
    this.volumeBoost = volumeBoost;
  }

  // Method to dynamically adjust volume boost level
  setVolumeBoost(boost: number) {
    this.volumeBoost = boost;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volumeBoost;
      console.log(`AudioRecorder: Volume boost set to ${this.volumeBoost}x`);
    }
  }

  async start(externalAudioStream?: MediaStream) {
    // If already recording, clean up and restart
    if (this.recording) {
      console.log("AudioRecorder: Already recording, stopping first");
      this.stop();
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        console.log("AudioRecorder: Starting with sample rate", this.sampleRate);
        console.log("AudioRecorder: Volume boost factor:", this.volumeBoost);
        
        // Use the external audio stream if provided, otherwise try to get the microphone
        if (externalAudioStream && externalAudioStream.getAudioTracks().length > 0) {
          console.log("AudioRecorder: Using external audio stream with tracks:", 
            externalAudioStream.getAudioTracks().map(t => `${t.label} (enabled: ${t.enabled})`));
            
          // Make sure we enable the audio tracks in case they're disabled
          externalAudioStream.getAudioTracks().forEach(track => {
            if (!track.enabled) {
              console.log(`Enabling audio track: ${track.label}`);
              track.enabled = true;
            }
          });
          
          // Create a new stream with just the audio tracks to avoid potential issues
          this.stream = new MediaStream(externalAudioStream.getAudioTracks());
          this.externalAudioTrack = externalAudioStream.getAudioTracks()[0];
          
          console.log("AudioRecorder: Created new stream with audio tracks:", 
                       this.stream.getAudioTracks().length);
        } else {
          try {
            console.log("AudioRecorder: Trying to get microphone access");
            this.stream = await navigator.mediaDevices.getUserMedia({ 
              audio: { 
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              } 
            });
            console.log("AudioRecorder: Microphone access granted");
          } catch (err) {
            console.warn("Failed to get microphone, using silent audio stream", err);
            // Create a silent audio stream as fallback
            this.audioContext = await audioContext({ sampleRate: this.sampleRate });
            const silentOsc = this.audioContext.createOscillator();
            silentOsc.frequency.value = 440; // Use an audible tone for testing
            const gainNode = this.audioContext.createGain();
            gainNode.gain.value = 0.01; // Very quiet but not completely silent
            silentOsc.connect(gainNode);
            
            const destination = this.audioContext.createMediaStreamDestination();
            gainNode.connect(destination);
            silentOsc.start();
            this.stream = destination.stream;
            console.log("AudioRecorder: Created fallback audio stream");
          }
        }

        if (!this.stream) {
          throw new Error("No audio stream available");
        }

        console.log("AudioRecorder: Creating audio context with sample rate", this.sampleRate);
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        console.log("AudioRecorder: Audio context state:", this.audioContext.state);
        
        if (this.audioContext.state === "suspended") {
          await this.audioContext.resume();
          console.log("AudioRecorder: Resumed audio context");
        }
        
        this.source = this.audioContext.createMediaStreamSource(this.stream);
        console.log("AudioRecorder: Created media stream source");

        // Create gain node to boost volume
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volumeBoost; // Boost factor
        console.log(`AudioRecorder: Created gain node with boost factor ${this.volumeBoost}x`);
        
        // Connect source to gain node
        this.source.connect(this.gainNode);
        console.log("AudioRecorder: Connected source to gain node");

        const workletName = "audio-recorder-worklet";
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        console.log("AudioRecorder: Adding audio worklet module");
        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName,
          {
            // Explicitly set output channel count to 1 (mono)
            outputChannelCount: [1]
          }
        );
        console.log("AudioRecorder: Created recording worklet node");

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // worklet processes recording floats and messages converted buffer
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit("data", arrayBufferString);
          }
        };
        
        // Connect gain node to recording worklet (instead of directly connecting source)
        this.gainNode.connect(this.recordingWorklet);
        console.log("AudioRecorder: Connected gain node to recording worklet");

        // vu meter worklet - connect directly to source for accurate metering
        const vuWorkletName = "vu-meter";
        await this.audioContext.audioWorklet.addModule(
          createWorketFromSrc(vuWorkletName, VolMeterWorket),
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        // Connect the source directly to VU meter to see pre-gain levels
        this.source.connect(this.vuWorklet);
        console.log("AudioRecorder: Connected source to VU meter worklet");
        
        this.recording = true;
        console.log("AudioRecorder: Recording started successfully with volume boost");
        resolve();
        this.starting = null;
      } catch (error) {
        console.error("Error starting audio recorder:", error);
        reject(error);
        this.starting = null;
      }
    });
    
    return this.starting;
  }

  stop() {
    // its plausible that stop would be called before start completes
    // such as if the websocket immediately hangs up
    const handleStop = () => {
      console.log("AudioRecorder: Stopping audio recording");
      if (this.source) {
        this.source.disconnect();
        console.log("AudioRecorder: Disconnected source node");
      }
      
      if (this.gainNode) {
        this.gainNode.disconnect();
        console.log("AudioRecorder: Disconnected gain node");
      }
      
      if (this.recordingWorklet) {
        this.recordingWorklet.disconnect();
        console.log("AudioRecorder: Disconnected recording worklet");
      }
      
      if (this.vuWorklet) {
        this.vuWorklet.disconnect();
        console.log("AudioRecorder: Disconnected VU meter worklet");
      }
      
      if (this.stream && !this.externalAudioTrack) {
        // Don't stop tracks if they came from an external stream
        console.log("AudioRecorder: Stopping internal stream tracks");
        this.stream.getTracks().forEach((track) => track.stop());
      } else {
        console.log("AudioRecorder: Not stopping external audio tracks");
      }
      
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      this.gainNode = undefined;
      this.externalAudioTrack = null;
      this.recording = false;
    };
    
    if (this.starting) {
      this.starting.then(handleStop).catch(() => {
        // If starting failed, just clean up
        handleStop();
      });
      return;
    }
    handleStop();
  }
}