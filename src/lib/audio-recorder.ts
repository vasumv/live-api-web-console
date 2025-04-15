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
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;

  private starting: Promise<void> | null = null;

  constructor(public sampleRate = 16000) {
    super();
  }

  async start() {
    if (this.recording) {
      console.log("AudioRecorder: Already recording, stopping first");
      this.stop();
    }

    this.starting = new Promise(async (resolve, reject) => {
      try {
        console.log("AudioRecorder: Attempting to start microphone recording");
        
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log("AudioRecorder: Got microphone access");
        } catch (err) {
          console.warn("AudioRecorder: Failed to get microphone, using silent audio stream", err);
          // Create a silent audio stream as fallback
          this.audioContext = await audioContext({ sampleRate: this.sampleRate });
          const silentOsc = this.audioContext.createOscillator();
          silentOsc.frequency.value = 0; // Essentially silent
          const gainNode = this.audioContext.createGain();
          gainNode.gain.value = 0.0001; // Nearly muted
          silentOsc.connect(gainNode);
          
          const destination = this.audioContext.createMediaStreamDestination();
          gainNode.connect(destination);
          silentOsc.start();
          this.stream = destination.stream;
          console.log("AudioRecorder: Created silent fallback stream");
        }

        console.log("AudioRecorder: Creating audio context with sample rate:", this.sampleRate);
        this.audioContext = await audioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        const workletName = "audio-recorder-worklet";
        const src = createWorketFromSrc(workletName, AudioRecordingWorklet);

        console.log("AudioRecorder: Adding audio worklet module");
        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName,
        );

        console.log("AudioRecorder: Setting up worklet message handling");
        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          // worklet processes recording floats and messages converted buffer
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit("data", arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // vu meter worklet
        const vuWorkletName = "vu-meter";
        console.log("AudioRecorder: Adding VU meter worklet");
        await this.audioContext.audioWorklet.addModule(
          createWorketFromSrc(vuWorkletName, VolMeterWorket),
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
        console.log("AudioRecorder: Started successfully");
        resolve();
        this.starting = null;
      } catch (error) {
        console.error("AudioRecorder: Error starting audio recorder:", error);
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
      this.source?.disconnect();
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
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