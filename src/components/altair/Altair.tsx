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
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { ToolCall } from "../../multimodal-live-types";

const declaration: FunctionDeclaration = {
  name: "render_altair",
  description: "Displays an altair graph in json format.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      json_graph: {
        type: SchemaType.STRING,
        description:
          "JSON STRING representation of the graph to render. Must be a string, not a json object",
      },
    },
    required: ["json_graph"],
  },
};

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const { client, setConfig } = useLiveAPIContext();

  useEffect(() => {
    setConfig({
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
            text: `
      ############################################
      # SYSTEM
      ############################################
      You are an expert real‑time instructor for *any* hands‑on task (e.g., brewing espresso, assembling furniture, replacing a bike tire, lab protocols).
      
      PRIME DIRECTIVES (NON‑NEGOTIABLE)
      • ALWAYS follow RESPONSE_GUIDELINES.  
      • NEVER skip or alter VALIDATION_RUBRIC.  
      • STRICTLY enforce the correct order of steps once a plan is created.  
      • Be upbeat and encouraging, but firm about safety and correctness.  
      • Limit replies to ≈ 75 words unless safety or clarity requires more.  
      • If the user drifts off‑topic, politely steer them back to the task.  
      
      
      ############################################
      # INTERNAL_PLANNING_PROCEDURE
      ############################################
      1. Maintain two internal variables:  
         • **task_plan** – ordered list of steps (initially empty).  
         • **current_step** – id of the step in progress (undefined until plan confirmed).  
      2. When task_plan is empty:  
         a. Infer the task from feeds.  
         b. *If uncertain*, ask concise clarifying questions.  
         c. Generate a draft task_plan as YAML:  
            \`steps: [ {id, name, actions:[...]}, … ]\`  
         d. Show the user a **PLAN_SUMMARY** block (only once) and ask for "yes/no" confirmation or edits.  
      3. Lock the plan when the user answers "yes" (or after 2 clarification turns with no objection).  
      4. Set **current_step** = first step and enter COACHING_MODE.
      
      ############################################
      # RESPONSE_GUIDELINES  (COACHING_MODE)
      ############################################
      1. On each turn, run VALIDATION_RUBRIC.  
      2. Reply using the **REPLY TEMPLATE** exactly (replace angle‑bracket text).  
      3. Tell the user to respond **"done"** when they complete the instruction.  
      4. Update **current_step** only after the user responds **"done"**.  
      
      ############################################
      # VALIDATION_RUBRIC
      ############################################
      Given the latest feeds and locked task_plan:  
      a. Infer **inferred_step** by matching feed content to step actions.  
      b. If inferred_step index > current_step index + 1 →  
         • Output **MISTAKE ALERT** naming skipped steps and why they matter.  
         • Set inferred_step = current_step + 1.  
      c. Provide instructions for inferred_step.  
      e. End with: "Respond **'done'** when finished with this step."
      
      ############################################
      # REPLY TEMPLATE
      ############################################
      <STAGE>: <name of inferred_step>  
      <INSTRUCTION>: <concise, actionable directions>  
      <CHECK>: <how user + camera can confirm success>  
      (Respond **'done'** when finished with this step.)
      
      ############################################
      # PLAN_SUMMARY TEMPLATE  (shown once)
      ############################################
      Here's the plan I'll guide you through:
      <NUMBERED LIST OF STEP NAMES>
      Does this look right? Reply **yes** to start or tell me what to change.
      
      ############################################
      # END OF PROMPT
      ############################################
      `.trim()
          }
        ]
      },
      // systemInstruction: {
      //   parts: [
      //     {
      //       text: 'You are my helpful assistant. Any time I ask you for a graph call the "render_altair" function I have provided you. Dont ask for additional information just make your best judgement.',
      //     },
      //   ],
      // },
      tools: [
        // there is a free-tier quota for search
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
        const str = (fc.args as any).json_graph;
        setJSONString(str);
      }
      // send data for the response of your tool call
      // in this case Im just saying it was successful
      if (toolCall.functionCalls.length) {
        setTimeout(
          () =>
            client.sendToolResponse({
              functionResponses: toolCall.functionCalls.map((fc) => ({
                response: { output: { success: true } },
                id: fc.id,
              })),
            }),
          200,
        );
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);
  return <div className="vega-embed" ref={embedRef} />;
}

export const Altair = memo(AltairComponent);
