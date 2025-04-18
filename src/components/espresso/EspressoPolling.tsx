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
import { ToolCall, ServerContent, isModelTurn } from "../../multimodal-live-types";

// Define the response structure based on the JSON format
interface StepInfo {
  text: string;
  status: "todo" | "inprogress" | "done";
}

interface ResponseJson {
  steps: Record<string, StepInfo>;
  currentStep: string;
  currentStepDetailedDescription: string;
  chatResponse: string;
  currentStepExplanation: string; // Added explanation field
}

const declaration: FunctionDeclaration = {
  name: "update_task_progress",
  description: `
This function is used to Updates the completion status of a task step. If you have determined
that the user has completed a step, call this function with the value \`done\` for \`status\`,
along with an explanation of what was completed for \`explanation\`. If you have determined 
that the user has not finished the step, call this function with the value \`inprogress\` and an 
explanation.

**→ CRITICAL RULE - CALL THIS FUNCTION ONLY WHEN THE USER'S EXACT WORDS CLEARLY SIGNAL COMPLETION.**  
A call is allowed *only* if the entire user utterance (case-insensitive) contains **one** of the exact phrases below
—or an equivalent that explicitly names the step (e.g. "step 2 done"):

  • "done"              • "i am done"           • "i'm done"
  • "finished"          • "i am finished"       • "i'm finished"
  • "completed"         • "i have completed…"   • "i've completed…"  
  • "step <n> done"

If you are even slightly unsure, **do not call** this function; instead reply with \`chatResponse\`
and keep the same \`currentStep\`.`,
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      stepId: {
        type: SchemaType.STRING,
        description: "The ID of the step to update (e.g., 'step1', 'step2')",
      },
      status: {
        type: SchemaType.STRING,
        description: "The status of the step",
      },
    },
    required: ["stepId", "status"],
  },
};

// Dark mode color palette
const colors = {
  background: '#202124',
  surface: '#2a2b2e',
  surfaceVariant: '#35363a',
  primary: '#8ab4f8',
  primaryDark: '#669df6',
  onBackground: '#e8eaed',
  onSurface: '#bdc1c6',
  onSurfaceVariant: '#9aa0a6',
  success: '#81c995',
  border: 'rgba(232, 234, 237, 0.12)',
  shadow: 'rgba(0, 0, 0, 0.3)',
  overlay: 'rgba(32, 33, 36, 0.85)',
};

function ExpressoComponent() {
  const [latestResponse, setLatestResponse] = useState<ResponseJson | null>(null);
  const [latestRawText, setLatestRawText] = useState<string>("");
  const [isExplanationExpanded, setIsExplanationExpanded] = useState<boolean>(true);
  const { client, setConfig, connect, disconnect } = useLiveAPIContext();
  // Add polling state and ref
  const [isPollingEnabled, setIsPollingEnabled] = useState<boolean>(true);
  const [pollingInterval, setPollingInterval] = useState<number>(5000); // 5 seconds default
  const pollingTimerRef = useRef<number | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const lastPollTimeRef = useRef<number>(0);

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
            text: `
          You are a hands-on assistant that guides people through real-world, multi-step procedures (espresso brewing, furniture assembly, bike-tire repairs, lab protocols, etc.).

          ════════════════════════════════════════════════════════════
          WHEN A NEW TASK IS REQUESTED
          ════════════════════════════════════════════════════════════
          1. Break the task into clear, fine-grained steps (step1, step2, …). Be very thorough and don't make the steps too large. 
          2. Return *only* the JSON object described below.  
          3. Wait for the user to say **"yes"** to confirm the plan before you proceed.
          ════════════════════════════════════════════════════════════
          WHEN A STEP IS BEING WORKED ON  
          ════════════════════════════════════════════════════════════
          1. Use the video feed to reason about the status of the step.
          2. The status should go from "todo" to "inprogress" to "done" based on the video input. Usually you should not skip the "inprogress" status, but if you do ensure i.e. you are 100% sure that the step is completed from the video stream.
          3. Only return status: "done" if from the video you identify the step was done and has been completed.   
          ════════════════════════════════════════════════════════════
          JSON RESPONSE FORMAT (Always—no extra text!)
          ════════════════════════════════════════════════════════════
          {
            "currentStepExplanation": <explanation of whether the current step was completed based on the video> 
            "steps": {
              "step1": { "text": "<short label>", "status": "todo"},
              "step2": { "text": "<short label>", "status": "todo"},
              …
            },
            "currentStep": "step1" | "step2" | …  // the first step marked "todo" or "inprogress"
            "currentStepDetailedDescription": "<detailed instructions for currentStep>",
            "chatResponse": "<friendly sentence to the user>"
          }

          • Initialize **every** \`status\` to \`"todo"\`.  
          • \`currentStepDetailedDescription\` is your actionable guidance.  
          • \`chatResponse\` is short and conversational ("Great—tell me when you're done!").


          ════════════════════════════════════════════════════════════
          EXAMPLES (Do NOT output these—just guidance for you)
          ════════════════════════════════════════════════════════════

          User: "Can you repeat that?" → Do not call; re-explain.

          User: "Next!" → Ensure step is completed first, by using the video, do not rely on the user's words.

          ════════════════════════════════════════════════════════════
          Remember: after confirmation, **only** emit the JSON object on each turn —
          never plain text outside it.
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

  useEffect(() => {
    const onToolCall = (toolCall: ToolCall) => {
      console.log(`got toolcall`, toolCall);
      const fc = toolCall.functionCalls.find(
        (fc) => fc.name === declaration.name,
      );
      if (fc) {
        const stepId = (fc.args as any).stepId;
        const status = (fc.args as any).status;
        
        // Update the step status in our local state
        if (latestResponse && stepId && typeof status === "string") {
          const updatedResponse = {...latestResponse};
          if (updatedResponse.steps[stepId]) {
            updatedResponse.steps[stepId].status = status as "todo" | "inprogress" | "done";
            
            // Find the next incomplete step to set as current
            const stepKeys = Object.keys(updatedResponse.steps);
            const nextIncompleteStep = stepKeys.find(key => updatedResponse.steps[key].status !== "done");
            if (nextIncompleteStep) {
              updatedResponse.currentStep = nextIncompleteStep;
              updatedResponse.currentStepDetailedDescription = 
                `Let's move on to ${updatedResponse.steps[nextIncompleteStep].text}. ${updatedResponse.currentStepDetailedDescription}`;
              updatedResponse.chatResponse = `Great! You've completed ${updatedResponse.steps[stepId].text}. Now let's move on to ${updatedResponse.steps[nextIncompleteStep].text}.`;
            } else {
              updatedResponse.chatResponse = `Excellent! You've completed all the steps. Is there anything else you'd like help with?`;
            }
            
            setLatestResponse(updatedResponse);
          }
        }
      }
      
      // Send response for the tool call
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                response: { output: { success: true }},
                id: fc.id,
              })),
            }),
          200,
        );
      }
    };
    
    const onContent = (content: ServerContent) => {
      console.log("Received content:", content);
      
      // Reset polling state when we get any content
      setIsPolling(false);
      
      // Extract text from content if it's a ModelTurn
      if (isModelTurn(content) && content.modelTurn && content.modelTurn.parts) {
        const textParts = content.modelTurn.parts.filter(part => part.text);
        if (textParts.length > 0) {
          const newText = textParts.map(part => part.text).join("\n");
          
          // Ignore status check responses to avoid UI disruption
          if (newText.includes("_status_check_")) {
            console.log("Ignoring status check response");
            return;
          }
          
          setLatestRawText(newText);
          try {
            // Try to parse the JSON response
            // Remove backticks and language markers that might be in the response
            const cleanedText = newText.replace(/```json|```/g, '').trim();
            const parsedJson: ResponseJson = JSON.parse(cleanedText);
            
            // Add chatResponse if it doesn't exist (for backward compatibility)
            if (!parsedJson.chatResponse) {
              parsedJson.chatResponse = `I'll help you with ${parsedJson.steps[parsedJson.currentStep].text}.`;
            }
            
            setLatestResponse(parsedJson);
          } catch (error) {
            console.error("Error parsing JSON response:", error);
          }
        }
      }
    };
    
    const onConnect = () => {
      console.log("Connected to API");
      // Reset responses on new connection
      setLatestResponse(null);
      setLatestRawText("");
    };
    
    client.on("toolcall", onToolCall);
    client.on("content", onContent);
    client.on("open", onConnect);
    
    return () => {
      client.off("toolcall", onToolCall);
      client.off("content", onContent);
      client.off("open", onConnect);
    };
  }, [client, latestResponse]);
  
  // Add the polling function
  const pollForUpdates = useCallback(() => {
    if (!client) return;
    
    // Don't poll if:
    // 1. Currently polling
    // 2. No active conversation yet
    // 3. Last poll was less than 1 second ago (debounce)
    if (isPolling || 
        (!latestResponse && !latestRawText) || 
        (Date.now() - lastPollTimeRef.current < 1000)) {
      return;
    }
    
    try {
      setIsPolling(true);
      lastPollTimeRef.current = Date.now();
      
      // Send a lightweight status check message
      client.send({
        text: "_status_check_"
      }, false); // Set turnComplete to false to avoid creating a new turn
      
      console.log("Polling for updates...");
      
      // Reset polling state after a timeout (in case we don't get a response)
      setTimeout(() => {
        setIsPolling(false);
      }, 3000);
    } catch (error) {
      console.error("Error during status poll:", error);
      setIsPolling(false);
    }
  }, [client, latestResponse, latestRawText, isPolling]);

  // Setup polling interval
  useEffect(() => {
    // Clear any existing polling timer
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    
    // Set up new polling if enabled
    if (isPollingEnabled && pollingInterval > 0) {
      pollingTimerRef.current = window.setInterval(pollForUpdates, pollingInterval);
    }
    
    // Cleanup function
    return () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current);
        pollingTimerRef.current = null;
      }
    };
  }, [isPollingEnabled, pollingInterval, pollForUpdates]);

  // Modify the handleClearConversation to reset polling
  const handleClearConversation = async () => {
    // Disconnect and reconnect to reset the conversation
    await disconnect();
    setLatestResponse(null);
    setLatestRawText("");
    
    // Restart polling timer if needed
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    
    if (isPollingEnabled) {
      pollingTimerRef.current = window.setInterval(pollForUpdates, pollingInterval);
    }
    
    setTimeout(() => {
      connect();
    }, 500);
  };

  const handleMarkStepComplete = (stepKey: string) => {
    if (!latestResponse || !latestResponse.steps[stepKey]) return;
    
    try {
      // First update local state
      const updatedResponse = {...latestResponse};
      updatedResponse.steps[stepKey].status = "done";
      setLatestResponse(updatedResponse);
      
      // Use the correct send method for text content
      client.send({
        text: `I've completed step "${latestResponse.steps[stepKey].text}". What's next?`
      });
      
    } catch (error) {
      console.error("Error marking step as complete:", error);
      // Revert the state change if message sending failed
      const revertedResponse = {...latestResponse};
      revertedResponse.steps[stepKey].status = "inprogress";
      setLatestResponse(revertedResponse);
    }
  };

  const handleMarkStepInProgress = (stepKey: string) => {
    if (!latestResponse || !latestResponse.steps[stepKey]) return;
    
    try {
      // Update local state to show step as in progress
      const updatedResponse = {...latestResponse};
      updatedResponse.steps[stepKey].status = "inprogress";
      updatedResponse.currentStep = stepKey;
      setLatestResponse(updatedResponse);
      
      // Use the correct send method for text content
      client.send({
        text: `I'm now working on step "${latestResponse.steps[stepKey].text}".`
      });
      
    } catch (error) {
      console.error("Error marking step as in progress:", error);
      // No need to revert state here since being "in progress" is just UI state
    }
  };
  
  return (
    <div className="expresso-container" style={{
      fontFamily: "'Google Sans', Arial, sans-serif",
      color: colors.onBackground,
      position: "absolute",
      right: "16px",
      top: "16px",
      width: "480px",
      maxHeight: "calc(100vh - 180px)",
      overflowY: "auto",
      backgroundColor: colors.overlay,
      backdropFilter: "blur(10px)",
      borderRadius: "12px",
      boxShadow: `0 4px 12px ${colors.shadow}`,
      zIndex: 100
    }}>
      <div className="header" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
        borderBottom: `1px solid ${colors.border}`,
        padding: "12px 16px"
      }}>
        <h2 style={{ margin: 0, fontWeight: 500, fontSize: "18px", color: colors.onBackground }}>Task Assistant</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {/* Polling interval dropdown */}
          {isPollingEnabled && (
            <select
              value={pollingInterval}
              onChange={(e) => setPollingInterval(Number(e.target.value))}
              style={{
                backgroundColor: colors.surface,
                color: colors.onBackground,
                border: `1px solid ${colors.border}`,
                borderRadius: "4px",
                padding: "6px 8px",
                fontSize: "13px",
                cursor: "pointer"
              }}
              title="Set polling frequency"
            >
              <option value="2000">2s</option>
              <option value="5000">5s</option>
              <option value="10000">10s</option>
              <option value="30000">30s</option>
            </select>
          )}
          
          {/* Manual refresh button - always visible */}
          <button 
            onClick={pollForUpdates} 
            disabled={isPolling}
            style={{
              backgroundColor: colors.surface,
              color: isPolling ? colors.onSurfaceVariant : colors.onBackground,
              border: `1px solid ${colors.border}`,
              borderRadius: "4px",
              padding: "6px 12px",
              cursor: isPolling ? "default" : "pointer",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              opacity: isPolling ? 0.7 : 1
            }}
            title="Refresh now"
          >
            <span className="material-symbols-outlined" style={{ 
              fontSize: "16px",
              animation: isPolling ? "spin 1s linear infinite" : "none" 
            }}>
              {isPolling ? "sync" : "refresh"}
            </span>
          </button>
          
          {/* Add polling toggle button */}
          <button 
            onClick={() => {
              const newValue = !isPollingEnabled;
              setIsPollingEnabled(newValue);
              
              // If enabling, immediately poll once
              if (newValue) {
                pollForUpdates();
              }
            }} 
            style={{
              backgroundColor: isPollingEnabled ? colors.primary : colors.surface,
              color: isPollingEnabled ? colors.background : colors.onSurfaceVariant,
              border: `1px solid ${isPollingEnabled ? colors.primary : colors.border}`,
              borderRadius: "4px",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              display: "flex",
              alignItems: "center"
            }}
            title={isPollingEnabled ? "Disable auto-refresh" : "Enable auto-refresh"}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px", marginRight: "4px" }}>
              {isPollingEnabled ? "sync" : "sync_disabled"}
            </span>
            {isPollingEnabled ? "Live" : "Manual"}
          </button>
          <button 
            onClick={handleClearConversation} 
            style={{
              backgroundColor: colors.primary,
              color: colors.background,
              border: "none",
              borderRadius: "4px",
              padding: "6px 12px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500
            }}
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Add CSS for the spin animation */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      
      {latestResponse ? (
        <div className="response-container" style={{
          padding: "0 16px 16px"
        }}>
          {/* Chat response bubble */}
          <div style={{
            backgroundColor: colors.surfaceVariant,
            borderRadius: "12px",
            padding: "12px 16px",
            marginBottom: "16px",
            border: `1px solid ${colors.border}`,
            fontSize: "14px",
            lineHeight: "1.5",
            color: colors.onBackground
          }}>
            {latestResponse.chatResponse}
            {latestResponse.currentStepExplanation && (
              <div style={{ marginTop: "8px" }}>
                <div 
                  onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                    fontSize: "12px",
                    color: colors.onSurfaceVariant,
                    paddingTop: "8px",
                    borderTop: `1px solid ${colors.border}`
                  }}
                >
                  <span style={{ 
                    marginRight: "6px",
                    transform: isExplanationExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    display: "inline-block"
                  }}>▶</span>
                  <span>Reasoning</span>
                </div>
                {isExplanationExpanded && (
                  <div style={{
                    marginTop: "4px",
                    paddingLeft: "16px",
                    fontSize: "12px",
                    color: colors.onSurfaceVariant,
                    opacity: 0.6
                  }}>
                    {latestResponse.currentStepExplanation}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Two-column layout */}
          <div style={{
            display: "flex",
            gap: "16px"
          }}>
            {/* Left column: Steps list */}
            <div style={{
              flex: "0 0 40%",
              backgroundColor: colors.surface,
              borderRadius: "8px",
              padding: "12px",
              border: `1px solid ${colors.border}`
            }}>
              <h3 style={{ 
                margin: "0 0 8px 0", 
                fontSize: "14px", 
                color: colors.onSurfaceVariant,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}>
                Steps
              </h3>
              <div className="steps-list">
                {Object.entries(latestResponse.steps).map(([stepKey, stepInfo]) => {
                  const isCurrent = latestResponse.currentStep === stepKey;
                  const status = stepInfo.status;
                  
                  return (
                    <div 
                      key={stepKey} 
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "8px 4px",
                        borderRadius: "4px",
                        marginBottom: "4px",
                        backgroundColor: isCurrent ? 'rgba(138, 180, 248, 0.15)' : 'transparent',
                        transition: "all 0.2s ease"
                      }}
                    >
                      <div 
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          marginRight: "8px",
                          fontSize: "12px",
                          flexShrink: 0,
                          color: status === "done" ? colors.success : 
                                status === "inprogress" ? colors.primary :
                                colors.onSurfaceVariant,
                          backgroundColor: status === "done" ? 'rgba(129, 201, 149, 0.15)' : 
                                           status === "inprogress" ? colors.primary : 
                                           'transparent',
                          border: status === "todo" ? `1px solid ${colors.border}` : 'none',
                          cursor: status !== "done" ? "pointer" : "default"
                        }}
                        onClick={() => {
                          if (status === "todo") {
                            handleMarkStepInProgress(stepKey);
                          } else if (status === "inprogress") {
                            handleMarkStepComplete(stepKey);
                          }
                        }}
                        title={status === "todo" ? "Mark as in progress" : 
                               status === "inprogress" ? "Mark as complete" : ""}
                      >
                        {status === "done" ? '✓' : 
                         status === "inprogress" ? '•' : 
                         ''}
                      </div>
                      <div style={{
                        fontSize: "14px",
                        lineHeight: 1.4,
                        color: isCurrent ? colors.primary : 
                              status === "done" ? colors.onBackground : 
                              status === "inprogress" ? "#FFC107" : 
                              colors.onSurface,
                        fontWeight: isCurrent ? 500 : 'normal',
                        opacity: status === "done" ? 0.87 : 1
                      }}>
                        {stepInfo.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Right column: Current step details */}
            <div style={{
              flex: "1",
              backgroundColor: colors.surface,
              borderRadius: "8px",
              padding: "12px",
              border: `1px solid ${colors.border}`
            }}>
              <h3 style={{ 
                margin: "0 0 8px 0", 
                fontSize: "14px", 
                color: colors.primary,
                fontWeight: 500
              }}>
                {latestResponse.steps[latestResponse.currentStep]?.text}
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: "14px",
                lineHeight: 1.5,
                color: colors.onBackground
              }}>
                {latestResponse.currentStepDetailedDescription}
              </p>
              
              {latestResponse.steps[latestResponse.currentStep]?.status !== "done" && (
                <div style={{ 
                  display: "flex", 
                  gap: "8px", 
                  marginTop: "12px" 
                }}>
                  {latestResponse.steps[latestResponse.currentStep]?.status === "todo" && (
                    <button
                      onClick={() => handleMarkStepInProgress(latestResponse.currentStep)}
                      style={{
                        backgroundColor: colors.primaryDark,
                        color: colors.background,
                        border: `1px solid ${colors.primary}`,
                        borderRadius: "4px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ marginRight: "4px" }}>Mark as in progress</span>
                      <span style={{ fontSize: "18px"}}>•</span>
                    </button>
                  )}
                  
                  {latestResponse.steps[latestResponse.currentStep]?.status === "inprogress" && (
                    <button
                      onClick={() => handleMarkStepComplete(latestResponse.currentStep)}
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.background,
                        border: "none",
                        borderRadius: "4px",
                        padding: "6px 12px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 500,
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <span style={{ marginRight: "4px" }}>Completed</span>
                      <span style={{ fontSize: "18px" }}>✓</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: "16px",
          color: colors.onSurface,
          textAlign: "center"
        }}>
          {latestRawText ? (
            <div style={{
              textAlign: "left",
              maxHeight: "300px",
              overflowY: "auto"
            }}>
              <p>Response couldn't be parsed as JSON. Raw response:</p>
              <pre style={{
                backgroundColor: colors.surface,
                padding: "12px",
                borderRadius: "4px",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                fontSize: "12px",
                color: colors.onSurface,
                border: `1px solid ${colors.border}`
              }}>
                {latestRawText}
              </pre>
            </div>
          ) : (
            <p>Ask the assistant to help with a task, and I'll guide you through the steps.</p>
          )}
        </div>
      )}
    </div>
  );
}

export const Expresso = memo(ExpressoComponent);
