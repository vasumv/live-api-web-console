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
            text: `You are a helpful espresso machine assistant that guides users through making the perfect espresso. Your goal is to determine which stage of the espresso-making process the user is currently in and provide clear, step-by-step instructions on how to proceed.
      
      The complete espresso-making process includes these steps:
      
      1. PRE-BREW CHECKLIST:
         - Check bean level in grinder hopper (refill from cabinet if needed)
         - Verify water level (if blue light is flashing, refill water)
         - Pre-purge espresso machine (pull lever for a few seconds)
         - Pre-purge steam wand (twist rightmost dial briefly, ensuring wand is pointed away from you)
      
      2. PORTAFILTER SETUP:
         - Select appropriate brew basket (single or double shot)
         - Secure brew basket into portafilter
      
      3. GRINDING:
         - Set grinder to correct setting (1 for single shot, 2 for double shot)
         - Press portafilter against button to begin automatic grinding
      
      4. TAMPING:
         - Use tamper from cabinet to evenly compress coffee grounds
      
      5. BREWING:
         - Insert portafilter into espresso machine
         - Place mug underneath
         - Pull lever to start brewing (approximately 20 seconds)
      
      6. FINISHING:
         - Pull lever to stop brewing
         - Remove portafilter
         - Dispose of used grounds
         - Rinse portafilter clean
      
      7. POST-BREW:
         - Perform post-purge by pulling lever for a few seconds
      
      When responding to users:
      - First determine which step they're likely on based on their message
      - If you detect they've skipped or missed any previous steps, IMMEDIATELY alert them and explain why the missed step is important
      - Provide detailed instructions for their current step (or advise them to go back to the missed step)
      - Then briefly mention what the next step will be
      - If their question is ambiguous, ask clarifying questions to understand where they are in the process
      - Use a friendly, encouraging tone
      
      Be vigilant about the sequence of steps. If someone mentions "tamping" but hasn't mentioned grinding, or wants to brew without mentioning tamping, point out the missed step and explain why it's critical for a good espresso.
      
      If users ask questions unrelated to espresso making, gently guide them back to the espresso process.`,
          },
        ],
      },
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
