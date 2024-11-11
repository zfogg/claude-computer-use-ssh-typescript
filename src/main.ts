import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolUseBlock, ToolUseBlockParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import readline from 'readline';
import fetch from 'node-fetch';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Initialize conversation history

//type MessageHistory = { role: 'user' | 'assistant'; content: string }[]
const messageHistory: MessageParam[] = [];

// Function to get user input
const getUserInput = (): Promise<string> => {
  return new Promise((resolve) => {
    rl.question('You: ', (input) => {
      resolve(input);
    });
  });
};

// Function to extract text content from response
const getResponseText = (content: Anthropic.Beta.BetaContentBlock[]): string => {
  const textBlock = content.find(block => 'type' in block && block.type === 'text');
  return textBlock && 'text' in textBlock ? textBlock.text : 'No response text available';
};

interface WeatherAPIResponse {
  current: {
    temp_c: number;
    temp_f: number;
    feelslike_c: number;
    feelslike_f: number;
    humidity: number;
    condition: {
      text: string;
    };
  };
}

// Function to get weather data using free API
async function getWeather(location: string, unit: 'celsius' | 'fahrenheit' = 'fahrenheit') {
  try {
    const apiKey = process.env.WEATHERAPI_API_KEY;
    const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}&aqi=no`);
    
    if (!response.ok) {
      throw new Error('Weather service unavailable');
    }

    const data = await response.json() as WeatherAPIResponse;
    const current = data.current;
    
    // Convert temperature based on unit preference
    const temp = unit === 'celsius' ? current.temp_c : current.temp_f;
    const feelsLike = unit === 'celsius' ? current.feelslike_c : current.feelslike_f;

    return {
      temperature: Math.round(temp),
      feelsLike: Math.round(feelsLike),
      humidity: current.humidity,
      description: current.condition.text,
      unit: unit
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get weather data: ${error.message}`);
    }
    throw new Error('Failed to get weather data: Unknown error');
  }
}

async function chat(messageHistory: MessageHistory) {
  const response = await anthropic.beta.messages.create({
    system: `
      You are a helpful assistant that can use tools to get information.
      If anyone asks you to do something, you should use the tool to do it that makes the most sense.
      If you need to use a tool multiple times, use it in a loop, once for each time you need to use it.
    `,
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: messageHistory,
    tools: [
      {
        type: "computer_20241022",
        name: "computer",
        display_width_px: 1024,
        display_height_px: 768,
        display_number: 1
      },
      {
        name: "get_weather",
        description: "Get the current weather in a given location",
        input_schema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "The city and state, e.g. San Francisco, CA"
            },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description: "The unit of temperature, either 'celsius' or 'fahrenheit'"
            }
          },
          required: ["location"]
        }
      },
    ],
    betas: ["computer-use-2024-10-22"],
  });

  return response;
}

// First, let's add the MessageHistory type at the top with other types
type MessageHistory = MessageParam[];

// Add these new functions after the getWeather function

async function processWeatherTool(
  content: any, 
  messageHistory: MessageHistory
) {
  try {
    const args = content.input as { location: string, unit: 'celsius' | 'fahrenheit' };
    const weatherData: any = await getWeather(args.location, args.unit);
    weatherData.location = args.location
    messageHistory.push({
      role: 'user',
      content: [{
        tool_use_id: content.id,
        type: "tool_result",
        content: JSON.stringify(weatherData),
      }],
    });
    console.log("processed weather data");

    // const response = await chat(messageHistory);
    // const responseText = getResponseText(response.content);
    // messageHistory.push({ role: 'assistant', content: responseText });
    // console.log('\nAssistant:', responseText, '\n');
    // console.log(response, content);
  } catch (error) {
    const errorMessage = `Error getting weather data: ${error instanceof Error ? error.message : 'Unknown error'}`;
    messageHistory.push({
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: content.id,
        content: errorMessage,
        is_error: true,
      }],
    });
    console.log('\nAssistant:', errorMessage, '\n');
  }
}

async function processComputerTool(
  content: any,
  messageHistory: MessageHistory
) {
  const action = (content.input as any).action;
  console.log("computer:action", action);

  // For now, we'll just return a mock screenshot message
  // You can implement actual screenshot functionality later
  if (action === "screenshot") {
    messageHistory.push({
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: content.id,
        content: "Screenshot functionality not implemented",
        is_error: true,
      }],
    });
  }
}

// Then modify the processToolResponse function to use these new functions
async function processToolResponse(content: any, messageHistory: MessageHistory) {
  if (content.type !== 'tool_use') {
    return;
  }

  // Add tool use to the last message's content
  const lastMessage = messageHistory[messageHistory.length - 1];
  if (Array.isArray(lastMessage.content)) {
    lastMessage.content.push(content);
  } else {
    lastMessage.content = [{ type: "text", text: lastMessage.content }, content];
  }

  // Process based on tool type
  switch (content.name) {
    case "get_weather":
      await processWeatherTool(content, messageHistory);
      break;
    case "computer":
      await processComputerTool(content, messageHistory);
      break;
    default:
      console.warn(`Unknown tool type: ${content.name}`);
  }
}

// Then modify the messageLoop function to use the new function
async function messageLoop() {
  try {
    console.log('AI Agent started. Type "exit" to quit.\n');

    while (true) {
      // Get user input
      const userInput = await getUserInput();

      // Check for exit command
      if (userInput.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        break;
      }

      // Add user message to history
      messageHistory.push({ role: 'user', content: userInput });

      // Get AI response
      const response = await chat(messageHistory);

      // Extract text from response
      const responseText = getResponseText(response.content);
      messageHistory.push({ role: 'assistant', content: responseText });
      console.log('\nAssistant:', responseText, '\n');

      // Check for tool calls in the response
      for (const content of response.content) {
        console.log("content", content);
        await processToolResponse(content, messageHistory);
        while (true) {
          const lastMessage = messageHistory[messageHistory.length - 1];
          const lastMessageContent = lastMessage.content[lastMessage.content.length - 1];

          // console.log("lastMessageContent", lastMessage,lastMessageContent);
          console.log("MESSAGE HISTORY");
          for (const message of messageHistory) {
            console.log(message.role, message.content);
          }
          
          if ((lastMessageContent as ToolResultBlockParam).type === "tool_result") {
            console.log("lastMessageContent tool_use");
            const response = await chat(messageHistory);
            const responseText = getResponseText(response.content);
            messageHistory.push({ role: 'assistant', content: responseText });
            console.log('\nAssistant:', responseText, '\n');
          } else {
            console.log("breaking");
            break;
          }
        }
      }

    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    rl.close();
  }
}

// Start the message loop
messageLoop();
