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
import { useSpeech } from "../../contexts/SpeechContext";

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
  isPolling: boolean;
  isPollingEnabled: boolean;
  onTogglePolling: () => void;
}

function TaskPanelComponent({
  latestResponse,
  latestRawText,
  isPolling,
  isPollingEnabled,
  onTogglePolling
}: TaskPanelProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState<boolean>(true);
  const { speaking, isSpeechEnabled, setSpeechEnabled } = useSpeech();

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
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Speech toggle button */}
          <div 
            onClick={() => setSpeechEnabled(!isSpeechEnabled)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              color: speaking ? colors.primary : isSpeechEnabled ? 'rgba(170, 170, 170, 0.6)' : 'rgba(170, 170, 170, 0.4)',
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "12px",
              transition: "background-color 0.2s ease",
              position: "relative"
            }}
            title={isSpeechEnabled ? "Turn speech off" : "Turn speech on"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path 
                fill="currentColor" 
                d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z" 
              />
            </svg>
            {!isSpeechEnabled && (
              <div style={{
                position: "absolute",
                width: "2px",
                height: "24px",
                backgroundColor: 'rgba(170, 170, 170, 0.6)',
                transform: "rotate(45deg)",
                left: "50%",
                top: "7%"
              }} />
            )}
          </div>
          
          {/* Polling indicator */}
          <div 
            onClick={onTogglePolling}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              color: isPolling ? colors.primary : 'rgba(170, 170, 170, 0.6)',
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "12px",
              transition: "background-color 0.2s ease",
              position: "relative"
            }}
            title={isPollingEnabled ? "Turn polling off" : "Turn polling on"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path 
                fill="currentColor" 
                d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" 
              />
            </svg>
            {!isPollingEnabled && (
              <div style={{
                position: "absolute",
                width: "2px",
                height: "24px",
                backgroundColor: 'rgba(170, 170, 170, 0.6)',
                transform: "rotate(45deg)",
                left: "50%",
                top: "7%"
              }} />
            )}
          </div>
        </div>
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
            color: colors.onBackground,
            position: "relative"
          }}>
            {speaking && (
              <div style={{
                position: "absolute",
                top: "8px",
                right: "8px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: colors.primary,
                animation: "pulse 1s infinite ease-in-out"
              }} />
            )}
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