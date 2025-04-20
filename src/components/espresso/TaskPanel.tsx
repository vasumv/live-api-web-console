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
import { memo, useState } from "react";

// Define the response structure based on the JSON format
export interface StepInfo {
  text: string;
  status: "todo" | "inprogress" | "done";
}

export interface ResponseJson {
  steps: Record<string, StepInfo>;
  currentStep: string;
  currentStepDetailedDescription: string;
  chatResponse: string;
  currentStepExplanation: string;
}

// Dark mode color palette
export const colors = {
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

interface TaskPanelProps {
  latestResponse: ResponseJson | null;
  latestRawText: string;
}

function TaskPanelComponent({
  latestResponse,
  latestRawText
}: TaskPanelProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState<boolean>(true);

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

export const TaskPanel = memo(TaskPanelComponent); 