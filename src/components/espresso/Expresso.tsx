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
import { type FunctionDeclaration, SchemaType } from "@google/generative-ai";
import { useEffect, useState, memo, useRef, useCallback } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { usePolling } from "../../contexts/PollingContext";
import { useSpeech } from "../../contexts/SpeechContext";
import { useVision } from "../../contexts/VisionContext";
import { ToolCall, ServerContent, isModelTurn } from "../../multimodal-live-types";
import { TaskPanel, ResponseJson } from "./TaskPanel";

function ExpressoComponent() {
  const [latestResponse, setLatestResponse] = useState<ResponseJson | null>(null);
  const [latestRawText, setLatestRawText] = useState<string>("");
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const pollingTimerRef = useRef<number | null>(null);
  const lastSpokenResponseRef = useRef<string | null>(null);
  const lastVisionRequestTimeRef = useRef<number>(0);
  
  const { client, setConfig, connect, disconnect } = useLiveAPIContext();
  const { speak, connected: speechConnected, connect: connectSpeech } = useSpeech();
  const { 
    requestAnalysis, 
    lastDescription, 
    connected: visionConnected, 
    connect: connectVision,
    analyzing: visionAnalyzing
  } = useVision();
  
  const { isPollingEnabled, pollingInterval, setIsPollingEnabled } = usePolling();

  useEffect(() => {
    setConfig({
      model: "models/gemini-2.0-flash-exp",
      generationConfig: {
        responseModalities: "text",
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
        },
      },
      systemInstruction: {
        parts: [
          {
            text: 
              `
                You are a hands-on assistant that helps users complete real-world, physical tasks (e.g., espresso brewing, furniture assembly, bike repair, lab protocols). 
                When a new task is requested: 
                (1) Break it into small, atomic steps ("step1", "step2", …). Be thorough and avoid bundling actions. First step should always be to locate the object/instrument that is required for the task.  
                (2) Set all statuses to "todo". 
                (3) Output only the JSON format below. 
                (4) Wait for the user to say "yes" to confirm before proceeding. 
                
                While a task is in progress: Use the video feed to track step completion. 
                A step should go from "todo" → "inprogress" → "done", based solely on visual evidence—not user input. Skip "inprogress" only if completion is visually obvious. 
                For each response, return: 
                (a) steps: All steps and statuses, 
                (b) currentStep: First step with status "todo" or "inprogress", 
                (c) currentStepDetailedDescription: Actionable guidance for that step,
                (d) currentStepExplanation: 2 lines - In the first line describe the video description in great detail espcially covering objects/instruments and actions that are relavant to the task. In the second line explain how the video confirms the current status ENSURE THIS IS ACCURATE AND CONSISTENT WITH THE VIDEO, while deciding the status of the step your goal is to avoid false positives at all costs,
                (e) chatResponse: a friendly response that would be an appropriate response to the user's actions, remember this will be spoken aloud, try to refer to the objects and thir palcement (left, right, top, bottom or prerfeably relative to other objects) in the video feed as much as possible, use the objects in the video feed to guide the user through the steps.
                
                Output only the JSON object—never plain text.
                JSON response format (always output, no extra text):
                {
                "steps": {
                    "step1": { "text": "<label>", "status": "todo" },
                    "step2": { "text": "<label>", "status": "todo" }
                },
                "currentStep": "step1",
                "currentStepDetailedDescription": "<detailed instructions>",
                "currentStepExplanation": "<based on video explain why you chose the status>",
                "chatResponse": "<response  which will be spoken aloud to the user>"
                }
                Example task (do not output—internal guidance): Making a latte → step1: "Fill portafilter", step2: "Tamp grounds", step3: "Start espresso shot", step4: "Steam milk", step5: "Pour milk into espresso". On "Next!", do not advance unless step is visually marked "done". Re-explain if asked. Never output anything except the JSON.
              `
          }
        ]
      }      
      ,
      tools: [
        { googleSearch: {} },
        // { functionDeclarations: [declaration] },
      ],
    });
  }, [setConfig]);

  // Auto-connect vision and speech when main client connects
  useEffect(() => {
    if (isPollingEnabled) {
      if (!visionConnected) {
        connectVision();
      }
      if (!speechConnected) {
        connectSpeech();
      }
    }
  }, [isPollingEnabled, visionConnected, speechConnected, connectVision, connectSpeech]);

  // Function to check status and poll for updates
  const pollForStatusUpdate = useCallback(() => {
    if (!latestResponse || !client || !isPollingEnabled) {
      return;
    }

    setIsPolling(true);
    
    // Only request a new vision analysis if:
    // 1. We're not currently analyzing
    // 2. It's been at least 2 seconds since our last request
    // This prevents request flooding and gives time for response streaming
    const now = Date.now();
    const timeSinceLastRequest = now - lastVisionRequestTimeRef.current;
    const minimumRequestInterval = 2000; // 2 seconds
    
    if (visionConnected && !visionAnalyzing && timeSinceLastRequest > minimumRequestInterval) {
      // Update the last request time
      lastVisionRequestTimeRef.current = now;
      
      // Request the vision analysis
      requestAnalysis(
        `
        Analyze these 10 frames and decide if the current task step: "${latestResponse.currentStepDetailedDescription}" is done, in progress or todo based on the video description.
        `
      );
    }
    
    // Use the vision description if available, otherwise use a placeholder
    // Make sure to trim and clean up any JSON artifacts that might remain
    const visionDescription = lastDescription 
      ? lastDescription.replace(/```json|```/g, '').trim() 
      : "No detailed visual information available yet";
    
    // Send a request to check for status updates
    client.send([{ 
      text: `
          Instructions:
            1. Here is what we see in the video feed now: "${visionDescription}"
            2. The objective of the current step is: "${latestResponse.currentStepDetailedDescription}"
            3. Determine if the status of the current step has changed (to 'done', 'inprogress', or remains 'todo') based on the video description.
            4. If no change is observed, respond with: 'no' (and nothing else).
            5. If a change is observed:
              a. Re-confirm the status change based on the video description.
              b. If the re-confirmation matches the initial observation, respond with the updated JSON containing the new status (and nothing else).
              c. If the re-confirmation does not match, or if you are unsure of the change, respond with: 'no'.
      `
    }]);

    // Reset polling flag after a brief delay to show the indicator
    setTimeout(() => {
      setIsPolling(false);
    }, 1000);
  }, [client, latestResponse, isPollingEnabled, visionConnected, visionAnalyzing, requestAnalysis, lastDescription]);

  // Setup or clear polling timer when polling interval or enabled state changes
  useEffect(() => {
    // Clear existing timer if any
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    // Set up new timer if we have a response to poll about and polling is enabled
    if (latestResponse && pollingInterval > 0 && isPollingEnabled) {
      pollingTimerRef.current = window.setInterval(pollForStatusUpdate, pollingInterval * 1000);
    }

    // Cleanup on unmount
    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [latestResponse, pollingInterval, pollForStatusUpdate, isPollingEnabled]);

  // Toggle polling on/off
  const handleTogglePolling = useCallback(() => {
    setIsPollingEnabled(!isPollingEnabled);
  }, [isPollingEnabled, setIsPollingEnabled]);

  // Handle speaking the chatResponse
  useEffect(() => {
    if (latestResponse && latestResponse.chatResponse) {
      // Always speak the latest response, even if it's the same as before
      // This ensures we restart speech if interrupted by polling updates
      speak(latestResponse.chatResponse);
      lastSpokenResponseRef.current = latestResponse.chatResponse;
    }
  }, [latestResponse, speak]);

  useEffect(() => {
    
    const onContent = (content: ServerContent) => {
      console.log("Received content:", content);
      // Extract text from content if it's a ModelTurn
      if (isModelTurn(content) && content.modelTurn && content.modelTurn.parts) {
        const textParts = content.modelTurn.parts.filter(part => part.text);
        if (textParts.length > 0) {
          const newText = textParts.map(part => part.text).join("\n");
          setLatestRawText(newText);
          try {
            const cleanedText = newText.replace(/```json|```/g, '').trim();
            const parsedJson: ResponseJson = JSON.parse(cleanedText);
            setLatestResponse(parsedJson);
          } catch (error) {
            if (newText.includes("yes") || newText.includes("no")) {
              console.log("Received yes or no response:", newText);
            }
            else {
              console.error("Error parsing JSON response:", error);
            }
          }
        }
      }
    };
    
    const onConnect = () => {
      console.log("Connected to API");
      // Reset responses on new connection
      setLatestResponse(null);
      setLatestRawText("");
      lastSpokenResponseRef.current = null;
    };
    
    client.on("content", onContent);
    client.on("open", onConnect);
    
    return () => {
      client.off("content", onContent);
      client.off("open", onConnect);
    };
  }, [client, latestResponse]);

  return (
    <>
      <TaskPanel
        latestResponse={latestResponse}
        latestRawText={latestRawText}
        isPolling={isPolling}
        isPollingEnabled={isPollingEnabled}
        onTogglePolling={handleTogglePolling}
      />
    </>
  );
}

export const Expresso = memo(ExpressoComponent);