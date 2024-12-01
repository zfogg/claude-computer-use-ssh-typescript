// INFO: Suppress deprecation warning terminal output (punycody)
process.removeAllListeners('warning');

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolUseBlockParam, ContentBlock } from '@anthropic-ai/sdk/resources/messages' with { 'resolution-mode': 'import' };
import readline from 'readline';
import { stripIndents } from 'common-tags';
import { processWeatherTool } from './weather.ts';
import { processComputerTool } from './computer.ts';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Initialize empty conversation history
let messageHistory: MessageParam[] = [];

// Grab the user's input from the console
const getUserInput = (): Promise<string> => {
  return new Promise((resolve) => {
    rl.question('You: ', (input) => {
      resolve(input);
    });
  });
};

// Extract text content from chat API response data
const getResponseText = (content: ContentBlock[]): string => {
  const textBlock = content.find(block => 'type' in block && block.type === 'text');
  return textBlock && 'text' in textBlock ? textBlock.text : 'No response text available';
};


async function chat(messageHistory: MessageParam[]) {
  const response = await anthropic.beta.messages.create({
    system: stripIndents`
      You are a helpful assistant that can use tools to get information.
      If anyone asks you to do something, you should use the tool to do it that makes the most sense.

      Additional instructions for the computer tool:
      As you use your computer tool and take screenshots to navigate around it.
      * make sure you try to understand where your cursor is before trying to click before clicking.
      * Try to predict where text will be input when you type with the computer tool. If you don't,
      the computer may be focused on the wrong text box or window as you enter text, which is undesirable for
      you.
      * You may need to click a window or input box to give it focus before typing text into it. Feel encouraged
      to do this. For example, when solving a problem with the computer tool and a computer browser, you
      may need to click into the browser's address bar to give it focus before typing in the adress you want to navigate to.
    `,
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    messages: messageHistory,
    tools: [
      {
        type: "computer_20241022",
        name: "computer",
        // display_width_px: 1024,
        // display_height_px: 768,
        display_width_px: 1360,
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

// Then modify the processToolResponse function to use these new functions
async function processToolResponse(content: ToolUseBlockParam, messageHistory: MessageParam[]): Promise<boolean> {
  // Add tool use to the last message's content
  const lastMessage = messageHistory[messageHistory.length - 1];
  if (Array.isArray(lastMessage.content)) {
    lastMessage.content.push(content);
  } else {
    lastMessage.content = [{ type: "text", text: lastMessage.content }, content];
  }

  console.log("tool use", content.input);

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
  return true;
}

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function agentLoop() {
  // 1. ask the user for input
  // 2. send the convo to the ai
  // 3. display the AI's response
  // 4. if the AI's response contains a tool call, execute the tool call and loop to step 2 or break
  // 5. loop to step 1

  try {
    console.log('AI Agent started. Type "exit" to quit.\n');

    while (true) {

      // 1. ask the user for input
      const userInput = await getUserInput();
      if (userInput.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        break;
      }

      if (userInput.toLowerCase() === 'reset') {
        console.log('Resetting conversation history...');
        messageHistory = [];
        continue;
      }

      if (userInput.toLowerCase() === 'log') {
        console.log('Logging conversation history...');
        for (const message of messageHistory) {
          console.log(`role=${message.role}`, message.content);
        }
        continue;
      }

      // Add user message to history
      messageHistory.push({ role: 'user', content: userInput });

      // 2. send the convo to the ai
      while (true) {
        // console.log("MESSAGE HISTORY");
        // for (const message of messageHistory) {
        //   console.log(message.role, message.content);
        // }
        const response = await chat(messageHistory);
        const responseText = getResponseText(response.content);
        messageHistory.push({ role: 'assistant', content: responseText });
        // 3. display the AI's response
        console.log('\nAssistant:', responseText);

        // 4. if the AI's response contains a tool call, execute the tool call and loop to step 2 or break
        let processedToolResponse = false;
        for (const content of response.content) {
          if (content.type !== 'tool_use') {
            continue;
          }
          processedToolResponse = processedToolResponse || await processToolResponse(content, messageHistory);
        }
        if (!processedToolResponse) {
          // console.log("❗ breaking");
          break;
        }
        // console.log("✅ looping");
      }
      // 5. loop to step 1
    }

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    rl.close();
  }
}

// Start the message loop
//messageLoop();
agentLoop();
