/**
 * OpenAI Vision API Client
 * A client for sending frames to OpenAI's GPT-4 Vision API
 */

import { EventEmitter } from 'eventemitter3';

// Define the events that this client will emit
interface OpenAIVisionClientEventTypes {
  response: (data: any) => void;
  error: (error: Error) => void;
}

export interface OpenAIVisionClientOptions {
  apiKey: string;
  model: string;
}

export class OpenAIVisionClient extends EventEmitter<OpenAIVisionClientEventTypes> {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(options: OpenAIVisionClientOptions) {
    super();
    this.apiKey = options.apiKey;
    this.model = options.model || 'gpt-4o';
    
    // Verify API key format - basic sanity check
    if (!this.apiKey.startsWith('sk-')) {
      console.warn('Warning: OpenAI API key does not start with "sk-". This may not be a valid key.');
    }
  }

  /**
   * Analyze frames using the OpenAI Vision API
   * @param frames Array of base64-encoded image data
   * @param prompt Text prompt to send along with the images
   */
  async analyzeFrames(frames: string[], prompt: string) {
    if (!frames.length) {
      this.emit('error', new Error('No frames provided for analysis'));
      return;
    }

    try {
      console.log(`OpenAI Vision: Analyzing ${frames.length} frames with prompt: ${prompt}`);

      // Prepare the message content with multiple images
      const content: any[] = [
        {
          type: "text",
          text: prompt
        }
      ];

      // Add each frame as an image
      for (const frame of frames) {
        // Extract base64 data (remove data:image/jpeg;base64, if present)
        const base64Data = frame.includes('base64,') 
          ? frame.split('base64,')[1] 
          : frame;

        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${base64Data}`
          }
        });
      }

      // Prepare the API request
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: `
                You are a helpful assistant that analyzes video frames and provides a description of the video feed.
                Describe the 10 frames in detail and the action taking place in them.
              `
            },
            {
              role: "user",
              content
            }
          ]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log('OpenAI Vision: Received response', data);
      
      // Extract the response text
      const responseText = data.choices?.[0]?.message?.content;
      if (responseText) {
        this.emit('response', { 
          videoDescription: responseText 
        });
      } else {
        throw new Error('No response text received from OpenAI');
      }
    } catch (error) {
      console.error('OpenAI Vision API error:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Test the API key to verify it's valid
   * @returns Promise that resolves with success status
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing OpenAI connection...');
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(errorData)}`);
      }
      
      const data = await response.json();
      console.log('OpenAI connection test successful');
      return true;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
} 