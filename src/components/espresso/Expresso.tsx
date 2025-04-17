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
import { useEffect, useState, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall, ServerContent, isModelTurn } from "../../multimodal-live-types";

// Define the response structure based on the JSON format
interface StepInfo {
  text: string;
  isComplete: boolean;
}

interface ResponseJson {
  steps: Record<string, StepInfo>;
  currentStep: string;
  currentStepDetailedDescription: string;
  chatResponse: string;
}

const declaration: FunctionDeclaration = {
  name: "update_task_progress",
  description: "Updates the progress of a specific task step. Only call this function when the user explicitly says 'done', 'finished', or 'completed' for a step.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      stepId: {
        type: SchemaType.STRING,
        description: "The ID of the step to update (e.g., 'step1', 'step2')",
      },
      isComplete: {
        type: SchemaType.BOOLEAN,
        description: "Whether the step is complete or not",
      },
    },
    required: ["stepId", "isComplete"],
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
  const { client, setConfig, connect, disconnect } = useLiveAPIContext();

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
      You are a helpful task assistant that can guide users through any multi-step hands-on process (e.g. brewing espresso, assembling furniture, replacing a bike tire, lab protocols).
      
      When a user asks for help with a task, break it down into clear steps. For example, making a cup of coffee might yield:
      - step1: Grind the coffee beans
      - step2: Add water to the coffee machine
      - step3: Turn on the coffee machine
      - step4: Wait for the coffee to brew
      - step5: Pour the coffee into a cup
      
      Your job is to:
      1. Based on the user's speech and video feed, decide which step the user is on.  
      2. Provide detailed instructions for that step.  
      3. Move to the next step only when the user has completed the current one.

############################################
# STEP_COMPLETION_RULE
############################################
Only call the function 'update_task_progress' when the user explicitly says “done”, “I'm finished”, or “I've completed this step.”  
If the user says anything else—questions, confusion, color commentary—do NOT call 'update_task_progress'. Instead, respond with a 'chatResponse' that clarifies or repeats instructions for the *same* 'currentStep'.

      
      ONLY respond in the following JSON format (no extra text):
      
      {
        "steps": {
          "step1": { "text": "First step description",  "isComplete": false },
          "step2": { "text": "Second step description", "isComplete": false },
          "step3": { "text": "Third step description",  "isComplete": false }
          // …as many steps as needed
        },
        "currentStep": "step1" | "step2" | "step3" | /* … */,
        "currentStepDetailedDescription": "Detailed instructions for the current step",
        "chatResponse": "A conversational response to address the user"
      }
      
      - Initialize **isComplete** to **false** for every step.  
      - **currentStep** must be the first incomplete step.  
      - **currentStepDetailedDescription** is your full, actionable guidance.  
      - **chatResponse** is a friendly, conversational message (e.g. “Great, let me know when you're done!”).
      
      After you emit the plan, wait for the user to reply “yes” to confirm. Once confirmed, only ever emit the JSON object on each turn (updating **isComplete**, **currentStep**, **currentStepDetailedDescription**, and **chatResponse**), and never send any plain text outside the JSON.`
          }
        ]
      }      
      ,
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [declaration] },
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
        const isComplete = (fc.args as any).isComplete;
        
        // Update the step status in our local state
        if (latestResponse && stepId && typeof isComplete === 'boolean') {
          const updatedResponse = {...latestResponse};
          if (updatedResponse.steps[stepId]) {
            updatedResponse.steps[stepId].isComplete = isComplete;
            
            // Find the next incomplete step to set as current
            const stepKeys = Object.keys(updatedResponse.steps);
            const nextIncompleteStep = stepKeys.find(key => !updatedResponse.steps[key].isComplete);
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
      // Extract text from content if it's a ModelTurn
      if (isModelTurn(content) && content.modelTurn && content.modelTurn.parts) {
        const textParts = content.modelTurn.parts.filter(part => part.text);
        if (textParts.length > 0) {
          const newText = textParts.map(part => part.text).join("\n");
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
  
  const handleClearConversation = async () => {
    // Disconnect and reconnect to reset the conversation
    await disconnect();
    setLatestResponse(null);
    setLatestRawText("");
    setTimeout(() => {
      connect();
    }, 500);
  };

  const handleMarkStepComplete = (stepKey: string) => {
    if (!latestResponse || !latestResponse.steps[stepKey]) return;
    
    // Send a text message to mark the step as complete
    client.sendRealtimeInput([
      {
        mimeType: "text/plain",
        data: `I've completed step "${latestResponse.steps[stepKey].text}". What's next?`
      }
    ]);
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
                  const isCompleted = stepInfo.isComplete;
                  
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
                          color: isCompleted ? colors.success : isCurrent ? colors.primary : colors.onSurfaceVariant,
                          backgroundColor: isCompleted ? 'rgba(129, 201, 149, 0.15)' : isCurrent ? 'rgba(138, 180, 248, 0.15)' : 'transparent',
                          border: isCompleted ? 'none' : isCurrent ? 'none' : `1px solid ${colors.border}`,
                          cursor: isCurrent && !isCompleted ? "pointer" : "default"
                        }}
                        onClick={() => isCurrent && !isCompleted ? handleMarkStepComplete(stepKey) : null}
                        title={isCurrent && !isCompleted ? "Mark as complete" : ""}
                      >
                        {isCompleted ? '✓' : isCurrent ? '•' : ''}
                      </div>
                      <div style={{
                        fontSize: "14px",
                        lineHeight: 1.4,
                        color: isCurrent ? colors.primary : isCompleted ? colors.onBackground : colors.onSurface,
                        fontWeight: isCurrent ? 500 : 'normal',
                        opacity: isCompleted ? 0.87 : 1
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
              
              {!latestResponse.steps[latestResponse.currentStep]?.isComplete && (
                <button
                  onClick={() => handleMarkStepComplete(latestResponse.currentStep)}
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                    border: "none",
                    borderRadius: "4px",
                    padding: "6px 12px",
                    marginTop: "12px",
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
