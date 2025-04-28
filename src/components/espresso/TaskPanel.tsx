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
import { memo, useState, useEffect, useCallback, FormEvent } from "react";
import { useSpeech } from "../../contexts/SpeechContext";
import { useVision } from "../../contexts/VisionContext";

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
  taskTitle?: string;
}

// Dark mode color palette
// export const colors = {
//   background: '#202124',
//   surface: '#2a2b2e',
//   surfaceVariant: '#35363a',
//   primary: '#8ab4f8',
//   primaryDark: '#669df6',
//   onBackground: '#e8eaed',
//   onSurface: '#bdc1c6',
//   onSurfaceVariant: '#9aa0a6',
//   success: '#81c995',
//   border: 'rgba(232, 234, 237, 0.12)',
//   shadow: 'rgba(0, 0, 0, 0.3)',
//   overlay: 'rgba(32, 33, 36, 0.85)',
// };

export const colors = {
  background: '#211D1B', // Dark brown background
  surface: '#2D2520', // Darker espresso surface
  surfaceVariant: '#3A2E25', // Richer brown surface variant
  primary: '#C87941', // Richer, warmer brown
  primaryDark: '#8B4513', // Classic saddlebrown
  onBackground: '#E8D9C9', // Warm cream text color
  onSurface: '#D2BEA9', // Light brown text
  onSurfaceVariant: '#BEA68F', // Muted brown text
  success: '#8BC176', // Slightly warmer green
  border: 'rgba(226, 215, 201, 0.12)', // Warmer border
  shadow: 'rgba(20, 12, 5, 0.3)', // Brown-tinted shadow
  overlay: 'rgba(33, 29, 27, 0.85)', // Brown overlay
  accent: '#E6C095', // Creamy latte color
  accentDark: '#D2A76A', // Caramel color
};

interface TaskPanelProps {
  latestResponse: ResponseJson | null;
  latestRawText: string;
  isPolling: boolean;
  isPollingEnabled: boolean;
  onTogglePolling: () => void;
  onCustomInstructionsChange?: (instructions: string) => void;
  customInstructions?: string;
}

function TaskPanelComponent({
  latestResponse,
  latestRawText,
  isPolling,
  isPollingEnabled,
  onTogglePolling,
  onCustomInstructionsChange,
  customInstructions: propCustomInstructions = ''
}: TaskPanelProps) {
  const [isExplanationExpanded, setIsExplanationExpanded] = useState<boolean>(true);
  const [isVisionDescriptionExpanded, setIsVisionDescriptionExpanded] = useState<boolean>(true);
  const [isVisionFrameExpanded, setIsVisionFrameExpanded] = useState<boolean>(false);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [showModeDropdown, setShowModeDropdown] = useState<boolean>(false);
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState<boolean>(false);
  const [localCustomInstructions, setLocalCustomInstructions] = useState<string>(propCustomInstructions);
  const [showInstructionsPopup, setShowInstructionsPopup] = useState<boolean>(false);
  const { speaking, isSpeechEnabled, setSpeechEnabled } = useSpeech();
  const { 
    lastDescription, 
    analyzing, 
    frameBuffer
  } = useVision();

  // Update local instructions when prop changes
  useEffect(() => {
    setLocalCustomInstructions(propCustomInstructions);
  }, [propCustomInstructions]);

  // Auto-rotate frames only if there are frames
  useEffect(() => {
    if (!isVisionFrameExpanded || !frameBuffer || frameBuffer.length === 0) return;
    
    console.log("Frame buffer in TaskPanel:", frameBuffer);
    
    const intervalId = setInterval(() => {
      setCurrentFrameIndex((prevIndex) => 
        prevIndex === frameBuffer.length - 1 ? 0 : prevIndex + 1
      );
    }, 2000);
    
    return () => clearInterval(intervalId);
  }, [isVisionFrameExpanded, frameBuffer]);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showModeDropdown) return;
    
    const handleOutsideClick = (e: MouseEvent) => {
      if ((e.target as Element).closest('.mode-dropdown-container') === null) {
        setShowModeDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showModeDropdown]);
  
  // Close instructions popup when clicking outside
  useEffect(() => {
    if (!showInstructionsPopup) return;
    
    const handleOutsideClick = (e: MouseEvent) => {
      if ((e.target as Element).closest('.instructions-popup') === null && 
          (e.target as Element).closest('.instructions-button') === null) {
        setShowInstructionsPopup(false);
      }
    };
    
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showInstructionsPopup]);
  
  // Frame navigation handlers - only if frames are available
  const goToPrevFrame = useCallback(() => {
    if (!frameBuffer || frameBuffer.length === 0) return;
    
    setCurrentFrameIndex((prevIndex) => 
      prevIndex === 0 ? frameBuffer.length - 1 : prevIndex - 1
    );
  }, [frameBuffer]);
  
  const goToNextFrame = useCallback(() => {
    if (!frameBuffer || frameBuffer.length === 0) return;
    
    setCurrentFrameIndex((prevIndex) => 
      prevIndex === frameBuffer.length - 1 ? 0 : prevIndex + 1
    );
  }, [frameBuffer]);

  const handleCustomInstructionsChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalCustomInstructions(e.target.value);
  }, []);
  
  const toggleInstructionsPopup = useCallback(() => {
    setShowInstructionsPopup(!showInstructionsPopup);
  }, [showInstructionsPopup]);
  
  const saveCustomInstructions = useCallback(() => {
    // Pass the instructions up to the parent component
    if (onCustomInstructionsChange) {
      onCustomInstructionsChange(localCustomInstructions);
    }
    setShowInstructionsPopup(false);
  }, [localCustomInstructions, onCustomInstructionsChange]);

  return (
    <div className="expresso-container" style={{
      fontFamily: "'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
      color: colors.onBackground,
      position: "absolute",
      right: "16px",
      top: "0px",
      height: "calc(100vh - 150px)",
      overflowY: "auto",
      backgroundColor: "transparent",
      // backdropFilter: "blur(10px)",
      borderRadius: "10px",
      border: `1px solid ${colors.border}`,
      // boxShadow: `0 4px 12px ${colors.shadow}`,
      zIndex: 100,
      letterSpacing: "0.01em"
    }}>
      {/* Add pulse animation */}
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 1; }
            100% { opacity: 0.4; }
          }
        `}
      </style>
      <div className="header" style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
        borderBottom: `1px solid ${colors.border}`,
        padding: "12px 16px"
      }}>
        <div>
          
          {latestResponse?.taskTitle && (
            <h2 style={{ 
              margin: 0, 
              fontWeight: 500, 
              fontSize: "24px", 
              color: colors.onBackground,
              letterSpacing: "-0.02em",
              lineHeight: 1.3
            }}>
              {latestResponse.taskTitle}
            </h2>
          )}
          <div style={{ 
            fontSize: "17px", 
            color: colors.onSurfaceVariant, 
            marginTop: "4px",
            fontWeight: 400
          }}>Task Assistant</div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {/* Custom Instructions Button */}
          <div 
            className="instructions-button"
            onClick={toggleInstructionsPopup}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              color: localCustomInstructions ? colors.primary : 'rgba(170, 170, 170, 0.6)',
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "12px",
              transition: "background-color 0.2s ease",
              position: "relative"
            }}
            title="Custom Instructions"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path 
                fill="currentColor" 
                d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" 
              />
            </svg>
          </div>
          
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
          
          {/* Explanation toggle button */}
          <div 
            onClick={() => setIsDebugPanelExpanded(!isDebugPanelExpanded)}
            style={{ 
              display: "flex", 
              alignItems: "center", 
              color: isDebugPanelExpanded ? colors.primary : 'rgba(170, 170, 170, 0.6)',
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "12px",
              transition: "background-color 0.2s ease",
              position: "relative"
            }}
            title="Explanation"
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="rgba(170, 170, 170, 0.6)" d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
            </svg>
          </div>
          
          {/* Mode dropdown chip */}
          <div className="mode-dropdown-container" style={{ position: "relative" }}>
            <div 
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              style={{ 
                display: "flex", 
                alignItems: "center",
                color: isPolling ? colors.primary : colors.onSurfaceVariant,
                cursor: "pointer",
                padding: "6px 12px",
                borderRadius: "10px",
                border: `1px solid rgba(170, 170, 170, 0.2)`,
                fontSize: "14px",
                fontWeight: 500,
                transition: "all 0.2s ease",
                gap: "6px"
              }}
            >
              {/* Mode icon - eye for proactive, dot for passive */}
              {isPollingEnabled ? (
                <svg width="18" height="18" viewBox="0 0 24 24" style={{ 
                  color: isPolling ? colors.primary : colors.onSurfaceVariant
                }}>
                  <path 
                    fill="currentColor" 
                    d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" 
                  />
                </svg>
              ) : (
                <div style={{
                  width: "9px",
                  height: "9px",
                  borderRadius: "50%",
                  backgroundColor: 'currentColor',
                  marginLeft: "4px",
                  marginRight: "4px"
                }} />
              )}
              <span>{isPollingEnabled ? "Espresso Mode" : "Brewed Mode"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ 
                transform: showModeDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}>
                <path 
                  fill="currentColor" 
                  d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" 
                />
              </svg>
            </div>
            
            {/* Dropdown menu */}
            {showModeDropdown && (
              <div style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                backgroundColor: colors.surface,
                borderRadius: "8px",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
                overflow: "hidden",
                zIndex: 10,
                width: "280px"
              }}>
                <div 
                  onClick={() => {
                    if (!isPollingEnabled) onTogglePolling();
                    setShowModeDropdown(false);
                  }}
                  style={{
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: isPollingEnabled ? colors.primary : colors.onBackground,
                    backgroundColor: isPollingEnabled ? 'rgba(138, 180, 248, 0.1)' : 'transparent',
                    cursor: "pointer",
                    fontWeight: isPollingEnabled ? 500 : 'normal',
                    borderLeft: isPollingEnabled ? `2px solid ${colors.primary}` : '2px solid transparent',
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px"
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ 
                    color: isPollingEnabled ? colors.primary : colors.onSurfaceVariant,
                    marginTop: "2px",
                    flexShrink: 0
                  }}>
                    <path 
                      fill="currentColor" 
                      d="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z" 
                    />
                  </svg>
                  <div>
                    <div style={{ fontWeight: isPollingEnabled ? 500 : 'normal' }}>Espresso Mode</div>
                    <div style={{ 
                      fontSize: "13px", 
                      color: colors.onSurfaceVariant,
                      marginTop: "2px", 
                      lineHeight: "1.3",
                      opacity: 0.8 
                    }}>
                      Proactively tracks and updates your progress, strong and fast, like an espresso shot.
                    </div>
                  </div>
                </div>
                <div 
                  onClick={() => {
                    if (isPollingEnabled) onTogglePolling();
                    setShowModeDropdown(false);
                  }}
                  style={{
                    padding: "12px 14px",
                    fontSize: "14px",
                    color: !isPollingEnabled ? colors.primary : colors.onBackground,
                    backgroundColor: !isPollingEnabled ? 'rgba(138, 180, 248, 0.1)' : 'transparent',
                    cursor: "pointer",
                    fontWeight: !isPollingEnabled ? 500 : 'normal',
                    borderLeft: !isPollingEnabled ? `2px solid ${colors.primary}` : '2px solid transparent',
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px"
                  }}
                >
                  <div style={{
                    width: "9px",
                    height: "9px",
                    borderRadius: "50%",
                    backgroundColor: !isPollingEnabled ? colors.primary : colors.onSurfaceVariant,
                    marginLeft: "4px",
                    marginRight: "4px",
                    marginTop: "6px",
                    flexShrink: 0
                  }} />
                  <div>
                    <div style={{ fontWeight: !isPollingEnabled ? 500 : 'normal' }}>Brewed Mode</div>
                    <div style={{ 
                      fontSize: "13px", 
                      color: colors.onSurfaceVariant,
                      marginTop: "2px", 
                      lineHeight: "1.3",
                      opacity: 0.8 
                    }}>
                      Guides and updates you on demand, deliberate like a slow-brewed coffee.
                    </div>
                  </div>
                </div>
              </div>
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
            backgroundColor: "transparent",
            borderRadius: "12px",
            padding: "18px 22px",
            marginBottom: "24px",
            // border: `1px solid ${colors.border}`,
            fontSize: "18px",
            lineHeight: "1.6",
            color: colors.onBackground,
            position: "relative",
            // boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            fontWeight: 600,
            transition: "all 0.3s ease"
          }}>
            {speaking && (
              <div style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: colors.primary,
                animation: "pulse 1s infinite ease-in-out"
              }} />
            )}
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
              backgroundColor: "transparent",
              borderRadius: "8px",
              padding: "14px",
              // border: `1px solid ${colors.border}`
            }}>
              <h3 style={{ 
                margin: "0 0 10px 0", 
                fontSize: "17px", 
                color: colors.onSurfaceVariant,
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.03em"
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
                        padding: "8px 6px",
                        borderRadius: "4px",
                        marginBottom: "6px",
                        backgroundColor: "transparent",
                        transition: "all 0.2s ease",
                        borderLeft: isCurrent ? `2px solid ${colors.primary}` : '2px solid transparent',
                        transform: isCurrent ? 'translateX(4px)' : 'none',
                        opacity: status === "done" ? 0.7 : 1
                      }}
                    >
                      <div 
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          width: "22px",
                          height: "22px",
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
                        fontSize: "17px",
                        lineHeight: 1.5,
                        color: isCurrent ? colors.primary : 
                              status === "done" ? colors.onBackground : 
                              status === "inprogress" ? "#FFC107" : 
                              colors.onSurface,
                        fontWeight: isCurrent ? 600 : 400,
                        opacity: status === "done" ? 0.87 : 1,
                        letterSpacing: isCurrent ? "0.01em" : "normal",
                        transition: "all 0.2s ease"
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
              padding: "14px",
              border: `1px solid ${colors.border}`
            }}>
              <h3 style={{ 
                margin: "0 0 12px 0", 
                fontSize: "17px", 
                color: colors.primary,
                fontWeight: 600,
                letterSpacing: "0.01em",
                textTransform: "uppercase"
              }}>
                {latestResponse.steps[latestResponse.currentStep]?.text}
              </h3>
              <p style={{ 
                margin: 0, 
                fontSize: "17px",
                lineHeight: 1.6,
                color: colors.onBackground
              }}>
                {latestResponse.currentStepDetailedDescription}
              </p>
            </div>
          </div>
          
          {/* Debug Panel Content - positioned at bottom right of the viewport */}
          {isDebugPanelExpanded && (
            <div style={{
              position: "fixed",
              bottom: "60px",
              right: "16px",
              width: "500px",
              maxHeight: "400px",
              overflowY: "auto",
              backgroundColor: 'rgba(42, 43, 46, 0.95)',
              borderRadius: "10px",
              padding: "16px",
              border: `1px solid rgba(154, 160, 166, 0.2)`,
              zIndex: 110,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              backdropFilter: "blur(5px)",
              fontFamily: "'Google Sans', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif"
            }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
                paddingBottom: "8px",
                borderBottom: `1px solid rgba(154, 160, 166, 0.2)`
              }}>
                <h4 style={{ 
                  margin: 0, 
                  fontWeight: 500, 
                  fontSize: "16px",
                  color: colors.onBackground,
                  letterSpacing: "0.01em"
                }}>Explaination</h4>
                <div 
                  onClick={() => setIsDebugPanelExpanded(false)}
                  style={{
                    cursor: "pointer",
                    opacity: 0.7,
                    transition: "opacity 0.2s ease",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "24px",
                    height: "24px"
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                  </svg>
                </div>
              </div>

              {/* Video Frames section */}
            {frameBuffer && frameBuffer.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                <div 
                  onClick={() => setIsVisionFrameExpanded(!isVisionFrameExpanded)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                      fontSize: "15px",
                      fontWeight: 500,
                    color: colors.onSurfaceVariant,
                      marginBottom: "8px",
                      letterSpacing: "0.01em"
                  }}
                >
                  <span style={{ 
                    marginRight: "6px",
                    transform: isVisionFrameExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    display: "inline-block"
                  }}>▶</span>
                  <span>
                    Video Frames ({frameBuffer.length})
                  </span>
                </div>
                {isVisionFrameExpanded && frameBuffer.length > 0 && (
                  <div style={{
                    marginTop: "8px",
                    textAlign: "center",
                    position: "relative"
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      position: "relative"
                    }}>
                      {/* Left navigation button */}
                      <button 
                        onClick={goToPrevFrame}
                        style={{
                          position: "absolute",
                          left: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ◀
                      </button>
                      
                      {/* Current frame */}
                      <img 
                        src={frameBuffer[currentFrameIndex]} 
                        alt={`Frame ${currentFrameIndex + 1} of ${frameBuffer.length}`} 
                        style={{
                          maxWidth: "100%",
                          maxHeight: "200px",
                          borderRadius: "8px",
                          border: `1px solid ${colors.border}`
                        }}
                      />
                      
                      {/* Right navigation button */}
                      <button 
                        onClick={goToNextFrame}
                        style={{
                          position: "absolute",
                          right: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ▶
                      </button>
                    </div>
                    
                    {/* Frame indicator dots */}
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "6px",
                      marginTop: "8px"
                    }}>
                      {frameBuffer.map((_, index) => (
                        <div
                          key={index}
                          onClick={() => setCurrentFrameIndex(index)}
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: index === currentFrameIndex ? colors.primary : colors.onSurfaceVariant,
                            cursor: "pointer",
                            opacity: index === currentFrameIndex ? 1 : 0.5
                          }}
                        />
                      ))}
                    </div>
                    
                    {/* Frame counter */}
                    <div style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      color: colors.onSurfaceVariant
                    }}>
                      Frame {currentFrameIndex + 1} of {frameBuffer.length}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Vision description section */}
            {lastDescription && (
                <div style={{ marginBottom: "16px" }}>
                <div 
                  onClick={() => setIsVisionDescriptionExpanded(!isVisionDescriptionExpanded)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                      fontSize: "15px",
                      fontWeight: 500,
                    color: analyzing ? colors.primary : colors.onSurfaceVariant,
                      letterSpacing: "0.01em"
                  }}
                >
                  <span style={{ 
                    marginRight: "6px",
                    transform: isVisionDescriptionExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    display: "inline-block"
                  }}>▶</span>
                  <span>
                    Video Description
                    {analyzing && <span style={{ marginLeft: "4px", color: colors.primary }}>(analyzing...)</span>}
                  </span>
                </div>
                {isVisionDescriptionExpanded && (
                  <div style={{
                      marginTop: "8px",
                    paddingLeft: "16px",
                      fontSize: "14px",
                    color: colors.primary,
                      opacity: 0.9,
                      fontWeight: 400,
                      lineHeight: 1.5
                  }}>
                    {lastDescription}
                  </div>
                )}
              </div>
            )}
            
            {/* Explanation section */}
            {latestResponse.currentStepExplanation && (
                <div>
                <div 
                  onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                      fontSize: "15px",
                      fontWeight: 500,
                    color: colors.onSurfaceVariant,
                      letterSpacing: "0.01em"
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
                      marginTop: "8px",
                    paddingLeft: "16px",
                      fontSize: "14px",
                    color: colors.onSurfaceVariant,
                      opacity: 0.9,
                      fontWeight: 400,
                      lineHeight: 1.5
                  }}>
                    {latestResponse.currentStepExplanation}
                  </div>
                )}
              </div>
            )}
          </div>
          )}
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
              
              {/* Add frame display even when no valid response */}
              {frameBuffer && frameBuffer.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ 
                    margin: "0 0 8px 0", 
                    fontSize: "14px", 
                    color: colors.onSurfaceVariant 
                  }}>
                    Video Frames:
                  </h4>
                  <div style={{
                    marginTop: "8px",
                    textAlign: "center",
                    position: "relative"
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      position: "relative"
                    }}>
                      {/* Left navigation button */}
                      <button 
                        onClick={goToPrevFrame}
                        style={{
                          position: "absolute",
                          left: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ◀
                      </button>
                      
                      {/* Current frame */}
                      <img 
                        src={frameBuffer[currentFrameIndex]} 
                        alt={`Frame ${currentFrameIndex + 1} of ${frameBuffer.length}`} 
                        style={{
                          maxWidth: "100%",
                          maxHeight: "200px",
                          borderRadius: "8px",
                          border: `1px solid ${colors.border}`
                        }}
                      />
                      
                      {/* Right navigation button */}
                      <button 
                        onClick={goToNextFrame}
                        style={{
                          position: "absolute",
                          right: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ▶
                      </button>
                    </div>
                    
                    {/* Frame indicator dots */}
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "6px",
                      marginTop: "8px"
                    }}>
                      {frameBuffer.map((_, index) => (
                        <div
                          key={index}
                          onClick={() => setCurrentFrameIndex(index)}
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: index === currentFrameIndex ? colors.primary : colors.onSurfaceVariant,
                            cursor: "pointer",
                            opacity: index === currentFrameIndex ? 1 : 0.5
                          }}
                        />
                      ))}
                    </div>
                    
                    {/* Frame counter */}
                    <div style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      color: colors.onSurfaceVariant
                    }}>
                      Frame {currentFrameIndex + 1} of {frameBuffer.length}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              
                <div style={{
                  alignItems: "center",
                  marginBottom: "16px",
                  width: "100%",
                  textAlign: "center",
                  marginTop: "30%"
                }}>
                  <img 
                    src="/favicon.ico" 
                    alt="Espresso AI" 
                    style={{
                      width: "36px",
                      height: "36px",
                      marginRight: "12px"
                    }}
                  />
                  <h3 style={{ 
                    margin: 0, 
                    fontWeight: 500, 
                    fontSize: "22px", 
                    color: colors.primary 
                  }}>
                    Espresso AI
                  </h3>
                </div>
                <p style={{
                  textAlign: "center",
                  color: colors.onSurface,
                  fontSize: "15px",
                  lineHeight: "1.5"
                }}>
                  I'm your intelligent assistant ready to help with tasks. Ask me anything, and I'll guide you through it step by step.
                </p>
              
              {/* Add frame display in initial state */}
              {frameBuffer && frameBuffer.length > 0 && (
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ 
                    margin: "0 0 8px 0", 
                    fontSize: "14px", 
                    color: colors.onSurfaceVariant 
                  }}>
                    Video Frames:
                  </h4>
                  <div style={{
                    marginTop: "8px",
                    textAlign: "center",
                    position: "relative"
                  }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      position: "relative"
                    }}>
                      {/* Left navigation button */}
                      <button 
                        onClick={goToPrevFrame}
                        style={{
                          position: "absolute",
                          left: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ◀
                      </button>
                      
                      {/* Current frame */}
                      <img 
                        src={frameBuffer[currentFrameIndex]} 
                        alt={`Frame ${currentFrameIndex + 1} of ${frameBuffer.length}`} 
                        style={{
                          maxWidth: "100%",
                          maxHeight: "200px",
                          borderRadius: "8px",
                          border: `1px solid ${colors.border}`
                        }}
                      />
                      
                      {/* Right navigation button */}
                      <button 
                        onClick={goToNextFrame}
                        style={{
                          position: "absolute",
                          right: "0",
                          zIndex: 2,
                          background: "rgba(32, 33, 36, 0.7)",
                          border: "none",
                          borderRadius: "50%",
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          cursor: "pointer",
                          color: colors.onBackground
                        }}
                      >
                        ▶
                      </button>
                    </div>
                    
                    {/* Frame indicator dots */}
                    <div style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: "6px",
                      marginTop: "8px"
                    }}>
                      {frameBuffer.map((_, index) => (
                        <div
                          key={index}
                          onClick={() => setCurrentFrameIndex(index)}
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            backgroundColor: index === currentFrameIndex ? colors.primary : colors.onSurfaceVariant,
                            cursor: "pointer",
                            opacity: index === currentFrameIndex ? 1 : 0.5
                          }}
                        />
                      ))}
                    </div>
                    
                    {/* Frame counter */}
                    <div style={{
                      marginTop: "4px",
                      fontSize: "12px",
                      color: colors.onSurfaceVariant
                    }}>
                      Frame {currentFrameIndex + 1} of {frameBuffer.length}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Custom Instructions Popup */}
      {showInstructionsPopup && (
        <div className="instructions-popup" style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "600px",
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          backgroundColor: colors.background,
          borderRadius: "10px",
          boxShadow: `0 4px 20px ${colors.shadow}`,
          border: `1px solid ${colors.border}`,
          padding: "24px",
          zIndex: 1000,
          overflowY: "auto"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            borderBottom: `1px solid ${colors.border}`,
            paddingBottom: "12px"
          }}>
            <h3 style={{ 
              margin: 0, 
              fontWeight: 500, 
              fontSize: "20px", 
              color: colors.onBackground 
            }}>
              Custom Instructions
            </h3>
            <div 
              onClick={() => setShowInstructionsPopup(false)}
              style={{
                cursor: "pointer",
                opacity: 0.7,
                transition: "opacity 0.2s ease",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "32px",
                height: "32px"
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
              </svg>
            </div>
          </div>
          
          <p style={{ 
            fontSize: "15px", 
            color: colors.onSurfaceVariant, 
            marginBottom: "16px",
            lineHeight: 1.5 
          }}>
            Add custom instructions to personalize how the assistant helps with your tasks. These instructions can be as detailed as you need them to be.
          </p>
          
          {/* Large text area instead of input field */}
          <textarea
            value={localCustomInstructions}
            onChange={handleCustomInstructionsChange}
            placeholder="Enter your custom instructions here. You can provide detailed preferences, specific requirements, or any particular way you'd like the assistant to guide you through tasks..."
            style={{
              width: "100%",
              minHeight: "200px",
              padding: "14px 16px",
              borderRadius: "8px",
              border: `1px solid ${colors.border}`,
              backgroundColor: colors.background,
              color: colors.onBackground,
              fontSize: "15px",
              lineHeight: "1.5",
              outline: "none",
              marginBottom: "20px",
              fontFamily: "'Google Sans', 'Roboto', sans-serif",
              boxSizing: "border-box",
              resize: "vertical"
            }}
            onFocus={(e) => e.target.style.borderColor = colors.primary}
            onBlur={(e) => e.target.style.borderColor = colors.border}
          />
          
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "8px"
          }}>
            <button
              onClick={() => setShowInstructionsPopup(false)}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "transparent",
                color: colors.onSurfaceVariant,
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 500
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveCustomInstructions}
              style={{
                padding: "10px 24px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: colors.primary,
                color: "#fff",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: 500
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const TaskPanel = memo(TaskPanelComponent);