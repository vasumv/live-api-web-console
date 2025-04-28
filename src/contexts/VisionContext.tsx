/**
 * Context for handling video frame analysis using OpenAI API
 */

import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MultimodalLiveClient } from "../lib/multimodal-live-client";
import { OpenAIVisionClient } from "../lib/openai-vision-client";

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
  isStepCorrect: boolean | null;
  isVisionEnabled: boolean;
  setVisionEnabled: (enabled: boolean) => void;
  lastFrameData: string | null;
  frameBuffer: string[];
  openAIConnected: boolean;
  currentModel: "openai" | "google";
  setCurrentModel: (model: "openai" | "google") => void;
  maxFrames: number;
  setMaxFrames: (frames: number) => void;
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
  // Create a client for vision analysis (still keeping Google client for other functionality)
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`;
  const client = useMemo(
    () => new MultimodalLiveClient({ url, apiKey }),
    [url, apiKey]
  );
  
  // Get OpenAI API key from environment variables
  const openAIApiKey = process.env.REACT_APP_OPENAI_API_KEY || "";
  
  // Model selection state
  const [currentModel, setCurrentModel] = useState<"openai" | "google">("openai");
  
  // OpenAI connection state
  const [openAIConnected, setOpenAIConnected] = useState<boolean>(false);
  
  // Create OpenAI Vision client
  const openAIClient = useMemo(() => {
    if (!openAIApiKey) return null;
    return new OpenAIVisionClient({ 
      apiKey: openAIApiKey,
      model: "gpt-4o"
    });
  }, [openAIApiKey]);
  
  const [connected, setConnected] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isVisionEnabled, setVisionEnabled] = useState(true);
  const [lastDescription, setLastDescription] = useState<string | null>(null);
  const [isStepCorrect, setIsStepCorrect] = useState<boolean | null>(null);
  const [lastFrameData, setLastFrameData] = useState<string | null>(null);
  
  // Store the latest 10 frames
  const framesBufferRef = useRef<string[]>([]);
  const [frameBuffer, setFrameBuffer] = useState<string[]>([]);
  const [maxFrames, setMaxFrames] = useState<number>(10);
  
  // Validate maxFrames
  useEffect(() => {
    if (maxFrames < 5) {
      setMaxFrames(5);
    } else if (maxFrames > 30) {
      setMaxFrames(30);
    }
  }, [maxFrames]);
  
  // Test OpenAI connection when component mounts
  useEffect(() => {
    if (!openAIClient) {
      setOpenAIConnected(false);
      return;
    }
    
    // Test the connection
    const testConnection = async () => {
      try {
        const success = await openAIClient.testConnection();
        setOpenAIConnected(success);
        if (success) {
          console.log("OpenAI GPT-4o connected successfully!");
          
          // If Google isn't connected yet, set a message
          if (!connected) {
            setLastDescription("OpenAI GPT-4o connected successfully! Request analysis to see results.");
          }
        } else {
          // If OpenAI fails but it's the selected model, switch to Google
          if (currentModel === "openai") {
            console.log("Falling back to Google API");
            setCurrentModel("google");
          }
        }
      } catch (error) {
        console.error("Failed to connect to OpenAI:", error);
        setOpenAIConnected(false);
        
        // If OpenAI fails but it's the selected model, switch to Google
        if (currentModel === "openai") {
          console.log("Falling back to Google API");
          setCurrentModel("google");
        }
      }
    };
    
    testConnection();
  }, [openAIClient, connected, currentModel]);
  
  // Set up event listeners for the OpenAI client
  useEffect(() => {
    if (!openAIClient) return;
    
    const onResponse = (data: any) => {
      console.log('OpenAI Vision response:', data);
      if (data.videoDescription) {
        const parsedVisionDescription = JSON.parse(data.videoDescription.replace(/```json|```/g, '').trim());
        setLastDescription(parsedVisionDescription.videoDescription);
        setIsStepCorrect(parsedVisionDescription.isStepCorrect === "true" ? true : false);
        setAnalyzing(false);
      }
    };
    
    const onError = (error: Error) => {
      console.error('OpenAI Vision error:', error);
      setLastDescription(`Error analyzing frames: ${error.message}`);
      setAnalyzing(false);
    };
    
    openAIClient.on('response', onResponse);
    openAIClient.on('error', onError);
    
    return () => {
      openAIClient.off('response', onResponse);
      openAIClient.off('error', onError);
    };
  }, [openAIClient]);
  
  // Remove the interval update of frameBuffer
  useEffect(() => {
    if (!isVisionEnabled) return;
    
    // Only initialize on mount if needed
    if (frameBuffer.length === 0 && framesBufferRef.current.length > 0) {
      setFrameBuffer([...framesBufferRef.current]);
    }
  }, [isVisionEnabled, frameBuffer.length]);
  
  // Set up event listeners for the Google client (kept for compatibility)
  useEffect(() => {
    const onClose = () => {
      setConnected(false);
      setAnalyzing(false);
    };
    
    client
      .on("close", onClose)
      .on("turncomplete", () => {
        setAnalyzing(false);
      });
      
    return () => {
      client
        .off("close", onClose)
        .off("turncomplete", () => {});
    };
  }, [client]);
  
  // Connect to the Google API (kept for compatibility)
  const connect = useCallback(async () => {
    if (connected) return;
    
    try {
      await client.connect({
        model: "models/gemini-2.0-flash-exp",
        generationConfig: {
          responseModalities: "text",
        },
        systemInstruction: {
          parts: [
            {
              text: `Describe the video feed. Example format:
                      {
                        "videoDescription": "<describe the video feed in detail and the action taking place in the 10 frames I have provided>"
                      }
                    Be extremely precise about object positions and actions being performed. Only output the JSON object, no comments or additional text.
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
  }, [client]);
  
  // Store frame in buffer rather than sending immediately
  const sendFrame = useCallback((base64: string) => {
    if (!isVisionEnabled) return;
    
    // Clean image data if it's in base64 data URL format
    const data = base64.indexOf(",") > 0 ? base64 : `data:image/jpeg;base64,${base64}`;
    
    // Store the frame data for UI display
    setLastFrameData(data);
    
    // Add to frames buffer, maintaining max size
    framesBufferRef.current.push(base64);
    if (framesBufferRef.current.length > maxFrames) {
      framesBufferRef.current.shift(); // Remove oldest frame
    }
    
    // Don't update frameBuffer state here - will be updated when requesting analysis
  }, [isVisionEnabled, maxFrames]);

  // Auto-connect and disconnect based on vision enabled state
  useEffect(() => {
    if (isVisionEnabled && !connected) {
      connect();
    } else if (!isVisionEnabled && connected) {
      disconnect();
    }
  }, [isVisionEnabled, connected, connect, disconnect]);

  // Request explicit analysis of the current scene - based on selected model
  const requestAnalysis = useCallback((prompt: string) => {
    if (!isVisionEnabled) return;
    
    // Reset state before new analysis
    setAnalyzing(true);
    console.log("Vision: Requesting new analysis");
    
    // Get frames from buffer
    const frames = framesBufferRef.current;
    if (frames.length === 0) {
      console.log("Vision: No frames available for analysis");
      setLastDescription("No frames available for analysis. Please enable camera access.");
      setAnalyzing(false);
      return;
    }
    
    // Update the frameBuffer state here when requesting analysis
    setFrameBuffer([...framesBufferRef.current]);
    console.log("Vision: Updated frameBuffer state for UI with", framesBufferRef.current.length, "frames");
    
    // Use selected model for analysis
    if (currentModel === "openai" && openAIClient && openAIConnected) {
      console.log("Vision: Using OpenAI GPT-4o for analysis");
      openAIClient.analyzeFrames(frames, prompt)
        .catch(error => {
          console.error("OpenAI analysis error:", error);
          setLastDescription(`Error: ${error.message}`);
          setAnalyzing(false);
        });
    } else if (connected) {
      // Use Google API if selected or if OpenAI is not available
      console.log(`Vision: Using Google API (${currentModel === "google" ? "selected" : "OpenAI not available"})`);
      
      // Send all captured frames to the Google API
      for (const frame of frames) {
        const data = frame.slice(frame.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      
      console.log(`Vision: Sent ${frames.length} frames for analysis to Google API`);
      
      // Send the prompt
      client.send([{ text: prompt }], true);
    } else {
      setLastDescription("Error: No vision API connected. Please check API connections.");
      setAnalyzing(false);
    }
  }, [client, connected, isVisionEnabled, openAIClient, openAIConnected, currentModel]);

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
    isStepCorrect,
    isVisionEnabled,
    setVisionEnabled,
    lastFrameData,
    frameBuffer,
    openAIConnected,
    currentModel,
    setCurrentModel,
    maxFrames,
    setMaxFrames
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