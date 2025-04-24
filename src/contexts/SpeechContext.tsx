/**
 * Context for handling speech synthesis using Gemini API
 */

import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MultimodalLiveClient } from "../lib/multimodal-live-client";
import { AudioStreamer } from "../lib/audio-streamer";
import { audioContext } from "../lib/utils";
import VolMeterWorket from "../lib/worklets/vol-meter";

// Define the shape of our context
interface SpeechContextType {
  client: MultimodalLiveClient;
  connected: boolean;
  speaking: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  speak: (text: string) => Promise<void>;
  volume: number;
  isSpeechEnabled: boolean;
  setSpeechEnabled: (enabled: boolean) => void;
}

// Create the context
const SpeechContext = createContext<SpeechContextType | undefined>(undefined);

// Props for the provider component
interface SpeechProviderProps {
  children: ReactNode;
  apiKey: string;
}

export const SpeechProvider: FC<SpeechProviderProps> = ({ children, apiKey }) => {
  // Create a client for speech synthesis
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
  const client = useMemo(
    () => new MultimodalLiveClient({ url, apiKey }),
    [url, apiKey]
  );
  
  const [connected, setConnected] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isSpeechEnabled, setSpeechEnabled] = useState(true);
  const [volume, setVolume] = useState(0);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const speakQueueRef = useRef<string[]>([]);
  const processingRef = useRef<boolean>(false);
  
  // Initialize audio streamer for output
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: "speech-out" }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>("vumeter-speech", VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            console.log("Speech audio worklet added successfully");
          });
      });
    }
  }, []);
  
  // Set up event listeners for the client
  useEffect(() => {
    const onClose = () => {
      setConnected(false);
      setSpeaking(false);
    };
    
    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
      setSpeaking(false);
    };
    
    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current && isSpeechEnabled) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };
    
    const onComplete = () => {
      setSpeaking(false);
      processNextInQueue();
    };
    
    client
      .on("close", onClose)
      .on("interrupted", stopAudioStreamer)
      .on("audio", onAudio)
      .on("turncomplete", onComplete);
      
    return () => {
      client
        .off("close", onClose)
        .off("interrupted", stopAudioStreamer)
        .off("audio", onAudio)
        .off("turncomplete", onComplete);
    };
  }, [client, isSpeechEnabled]);
  
  // Connect to the Gemini API with speech configuration
  const connect = useCallback(async () => {
    if (connected) return;
    
    try {
      await client.connect({
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: "audio",
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
          },
        },
        systemInstruction: {
          parts: [
            {
              text: "Your only task is to speak the exact text provided to you. Don't add anything or change the text in any way."
            }
          ]
        }
      });
      setConnected(true);
    } catch (error) {
      console.error("Failed to connect speech client:", error);
      setConnected(false);
    }
  }, [client, connected]);
  
  // Disconnect from the API
  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
    setSpeaking(false);
    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
    }
  }, [client]);
  
  // Process the next item in the speech queue
  const processNextInQueue = useCallback(() => {
    if (processingRef.current || speakQueueRef.current.length === 0 || !connected || !isSpeechEnabled) {
      processingRef.current = false;
      return;
    }
    
    processingRef.current = true;
    const nextText = speakQueueRef.current.shift();
    
    if (nextText) {
      setSpeaking(true);
      client.send([{ text: "Repeat the following: \n" + nextText }], true);
    } else {
      processingRef.current = false;
    }
  }, [client, connected, isSpeechEnabled]);
  
  // Add text to the speech queue and process it
  const speak = useCallback(async (text: string) => {
    if (!isSpeechEnabled) return;
    
    if (!connected) {
      try {
        await connect();
      } catch (error) {
        console.error("Failed to connect for speech:", error);
        return;
      }
    }
    
    speakQueueRef.current.push(text);
    
    if (!processingRef.current) {
      processNextInQueue();
    }
  }, [connect, connected, isSpeechEnabled, processNextInQueue]);
  
  // When speech is completed, process the next item
  useEffect(() => {
    if (!speaking && processingRef.current) {
      processingRef.current = false;
      // Add a small delay before processing the next item
      setTimeout(processNextInQueue, 300);
    }
  }, [speaking, processNextInQueue]);

  // Export the context value
  const contextValue: SpeechContextType = {
    client,
    connected,
    speaking,
    connect,
    disconnect,
    speak,
    volume,
    isSpeechEnabled,
    setSpeechEnabled
  };
  
  return (
    <SpeechContext.Provider value={contextValue}>
      {children}
    </SpeechContext.Provider>
  );
};

// Hook to use the speech context
export const useSpeech = () => {
  const context = useContext(SpeechContext);
  if (!context) {
    throw new Error("useSpeech must be used within a SpeechProvider");
  }
  return context;
};