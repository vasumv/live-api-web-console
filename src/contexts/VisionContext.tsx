/**
 * Context for handling video frame analysis using Gemini API
 */

import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MultimodalLiveClient } from "../lib/multimodal-live-client";

// Define the shape of our context
interface VisionContextType {
  client: MultimodalLiveClient;
  connected: boolean;
  analyzing: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendFrame: (imageData: string) => void;
  requestAnalysis: (prompt: string) => void;
  lastDescription: string | null;
  isVisionEnabled: boolean;
  setVisionEnabled: (enabled: boolean) => void;
  lastFrameData: string | null;
}

// Create the context
const VisionContext = createContext<VisionContextType | undefined>(undefined);

// Interface for the JSON response from the vision model
interface VisionResponse {
  videoDescription?: string;
}

// Props for the provider component
interface VisionProviderProps {
  children: ReactNode;
  apiKey: string;
}

export const VisionProvider: FC<VisionProviderProps> = ({ children, apiKey }) => {
  // Create a client for vision analysis
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
  const client = useMemo(
    () => new MultimodalLiveClient({ url, apiKey }),
    [url, apiKey]
  );
  
  const [connected, setConnected] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isVisionEnabled, setVisionEnabled] = useState(true);
  const [lastDescription, setLastDescription] = useState<string | null>(null);
  const [lastFrameData, setLastFrameData] = useState<string | null>(null);
  const pendingFramesRef = useRef<{ count: number }>({ count: 0 });
  
  // Buffer for accumulating streamed content
  const streamBufferRef = useRef<string>("");
  // Track if we're waiting for a complete JSON object
  const waitingForJsonRef = useRef<boolean>(false);
  // Last turn ID to track new turns
  const lastTurnIdRef = useRef<string | null>(null);
  
  // Set up event listeners for the client
  useEffect(() => {
    const onClose = () => {
      setConnected(false);
      setAnalyzing(false);
      streamBufferRef.current = ""; // Clear buffer on disconnect
      waitingForJsonRef.current = false;
    };
    
    const onContent = (content: any) => {
      // If this is from a new turn, reset the buffer
      const turnId = content?.modelTurn?.turnId || null;
      if (turnId && turnId !== lastTurnIdRef.current) {
        lastTurnIdRef.current = turnId;
        streamBufferRef.current = "";
      }
      
      if (content?.modelTurn?.parts && content.modelTurn.parts.length > 0) {
        const text = content.modelTurn.parts.map((part: any) => part.text).join('');
        
        if (text) {
          // Add to the buffer
          streamBufferRef.current += text;
          
          try {
            // Try to find a complete JSON object in the buffer
            const cleanedText = streamBufferRef.current.replace(/```json|```/g, '').trim();
            
            // Regular expression to find a JSON object
            const jsonMatch = cleanedText.match(/\{.*\}/s);
            if (jsonMatch) {
              const potentialJson = jsonMatch[0];
              try {
                // See if we can parse it as valid JSON
                const parsed = JSON.parse(potentialJson) as VisionResponse;
                
                // If it has a videoDescription field, use that
                if (parsed.videoDescription) {
                  setLastDescription(parsed.videoDescription);
                  console.log("Vision: Successfully parsed complete JSON response");
                  
                  // Clear the waiting flag
                  waitingForJsonRef.current = false;
                  
                  // Clear buffer since we successfully processed the response
                  streamBufferRef.current = "";
                  
                  // Mark analysis as complete
                  setAnalyzing(false);
                }
              } catch (jsonError) {
                // This JSON object wasn't complete or valid - keep waiting
                console.log("Vision: Found JSON-like structure but it wasn't valid, continuing to accumulate");
                waitingForJsonRef.current = true;
              }
            } else if (waitingForJsonRef.current && !cleanedText.includes('{')) {
              // We were waiting for JSON but got text without any JSON markers
              // This likely means we should just use the text as is
              console.log("Vision: Was waiting for JSON but received plain text");
              waitingForJsonRef.current = false;
              setLastDescription(cleanedText);
              streamBufferRef.current = "";
              setAnalyzing(false);
            } else if (waitingForJsonRef.current && streamBufferRef.current.length > 4000) {
              // This is getting too large, something went wrong - reset
              console.log("Vision: Buffer too large, resetting");
              waitingForJsonRef.current = false;
              streamBufferRef.current = "";
              setAnalyzing(false);
            } else if (cleanedText.includes('{')) {
              // We found an opening brace but no closing one yet - continue accumulating
              waitingForJsonRef.current = true;
            } else if (!waitingForJsonRef.current && streamBufferRef.current.length > 0) {
              // If we have text but aren't waiting for JSON, use it directly
              setLastDescription(streamBufferRef.current);
              streamBufferRef.current = "";
              setAnalyzing(false);
            }
          } catch (error) {
            console.log("Vision: Error processing buffer", error);
            
            // If the buffer is too large, something went wrong - use what we have
            if (streamBufferRef.current.length > 2000) {
              setLastDescription(streamBufferRef.current);
              streamBufferRef.current = "";
              waitingForJsonRef.current = false;
              setAnalyzing(false);
            }
          }
        }
      } else if (content?.turncomplete) {
        // When the turn is complete, process any remaining buffer content
        if (streamBufferRef.current.length > 0) {
          console.log("Vision: Turn complete, processing remaining buffer");
          setLastDescription(streamBufferRef.current);
          streamBufferRef.current = "";
          waitingForJsonRef.current = false;
          setAnalyzing(false);
        }
      }
    };
    
    client
      .on("close", onClose)
      .on("content", onContent)
      .on("turncomplete", () => {
        // Extra handler for turn complete event
        setAnalyzing(false);
        streamBufferRef.current = "";
        waitingForJsonRef.current = false;
      });
      
    return () => {
      client
        .off("close", onClose)
        .off("content", onContent)
        .off("turncomplete", () => {});
      
      // Clear buffer on unmount
      streamBufferRef.current = "";
      waitingForJsonRef.current = false;
    };
  }, [client]);
  
  // Connect to the Gemini API with vision configuration
  const connect = useCallback(async () => {
    if (connected) return;
    
    try {
      await client.connect({
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: "text",
          // temperature: 0.1,      // Lower temperature for more focused output
          // topP: 0.8,
          // topK: 32
        },
        systemInstruction: {
          parts: [
            {
              text: `Describe the video feed.
                `
            }
          ]
        }
      });
      setConnected(true);
      console.log("Vision client connected successfully");
    } catch (error) {
      console.error("Failed to connect vision client:", error);
      setConnected(false);
    }
  }, [client, connected]);
  
  // Disconnect from the API
  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
    setAnalyzing(false);
    streamBufferRef.current = ""; // Clear buffer on disconnect
    waitingForJsonRef.current = false;
  }, [client]);
  
  // Send frame to the vision API with rate limiting
  // We only want to process significant frames, not every single one
  const sendFrame = useCallback((base64: string) => {
    if (!isVisionEnabled || !connected) return;
    
    // Control the rate at which we process frames
    // pendingFramesRef.current.count++;
    
    // Only process every 5th frame to avoid overwhelming the model
    // if (pendingFramesRef.current.count % 5 !== 0) return;
    
    // Clean image data if it's in base64 data URL format
    // if (imageData.startsWith('data:image/jpeg;base64,')) {
    //   imageData = imageData.slice(imageData.indexOf(',') + 1);
    // }

    // Store the frame data for UI display (with data: prefix if needed)
    
    const data = base64.slice(base64.indexOf(",") + 1, Infinity);

    if (!data.startsWith('data:')) {
      setLastFrameData(`data:image/jpeg;base64,${data}`);
    } else {
      setLastFrameData(data);
    }
        
    // Send frame to main LiveAPI
    client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
    // console.log("Vision: Sent frame to vision API"+data);
  }, [client, connected, isVisionEnabled]);

  // Auto-connect and disconnect based on vision enabled state
  useEffect(() => {
    if (isVisionEnabled && !connected) {
      connect();
    } else if (!isVisionEnabled && connected) {
      disconnect();
    }
  }, [isVisionEnabled, connected, connect, disconnect]);

  // Request explicit analysis of the current scene
  const requestAnalysis = useCallback((prompt: string) => {
    if (!isVisionEnabled || !connected) return;
    
    // Reset buffer and flags before new analysis
    streamBufferRef.current = "";
    waitingForJsonRef.current = false;
    setAnalyzing(true);
    console.log("Vision: Requesting new analysis");
    
    // Send the prompt
    client.send([{ text: prompt }], true);
  }, [client, connected, isVisionEnabled]);

  // Export the context value
  const contextValue: VisionContextType = {
    client,
    connected,
    analyzing,
    connect,
    disconnect,
    sendFrame,
    requestAnalysis,
    lastDescription,
    isVisionEnabled,
    setVisionEnabled,
    lastFrameData
  };
  
  return (
    <VisionContext.Provider value={contextValue}>
      {children}
    </VisionContext.Provider>
  );
};

// Hook to use the vision context
export const useVision = () => {
  const context = useContext(VisionContext);
  if (!context) {
    throw new Error("useVision must be used within a VisionProvider");
  }
  return context;
}; 