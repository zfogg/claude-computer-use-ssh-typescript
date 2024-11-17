import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'readline';
import fetch from 'node-fetch';
import { exec } from 'child_process';
// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
// Initialize conversation history
let messageHistory = [];
// Grab the user's input from the console
const getUserInput = () => {
    return new Promise((resolve) => {
        rl.question('You: ', (input) => {
            resolve(input);
        });
    });
};
// Function to extract text content from response
const getResponseText = (content) => {
    const textBlock = content.find(block => 'type' in block && block.type === 'text');
    return textBlock && 'text' in textBlock ? textBlock.text : 'No response text available';
};
// Function to get weather data using free API
async function getWeather(location, unit = 'fahrenheit') {
    try {
        const apiKey = process.env.WEATHERAPI_API_KEY;
        const response = await fetch(`https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}&aqi=no`);
        if (!response.ok) {
            throw new Error('Weather service unavailable');
        }
        const data = await response.json();
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
    }
    catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to get weather data: ${error.message}`);
        }
        throw new Error('Failed to get weather data: Unknown error');
    }
}
async function shell(command) {
    return new Promise((resolve, reject) => {
        exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Shell command failed: ${error.message}`));
                return;
            }
            else if (stderr) {
                reject(new Error(`Shell command failed: ${stderr}`));
                return;
            }
            else {
                resolve(stdout.toString().trim());
            }
        });
    });
}
async function takeScreenshot() {
    const screenshot = await shell(`ssh claude-testing-do "DISPLAY=:0 scrot -o /tmp/ss.png && cat /tmp/ss.png | base64 -w 0"`);
    return screenshot;
}
async function moveMouse(x, y) {
    await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool mousemove --sync ${x} ${y}"`);
}
async function cursorPosition() {
    const position = await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool getmouselocation | cut -d' ' -f1,2"`);
    return position;
}
async function mouseClick(button) {
    let buttonNumber;
    switch (button) {
        case 'left':
            buttonNumber = 1;
            break;
        case 'middle':
            buttonNumber = 2;
            break;
        case 'right':
            buttonNumber = 3;
            break;
        default: throw new Error(`Unknown button: ${button}`);
    }
    await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool click ${buttonNumber}"`);
}
async function doubleClick() {
    await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool click 1 click 1"`);
}
async function keypress(key) {
    await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool key ${key}"`);
}
async function typeText(text) {
    await shell(`ssh claude-testing-do "DISPLAY=:0 xdotool type --delay 100 \"${text}\""`);
}
async function chat(messageHistory) {
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
// Add these new functions after the getWeather function
async function processWeatherTool(content, messageHistory) {
    try {
        const args = content.input;
        const weatherData = await getWeather(args.location, args.unit);
        weatherData.location = args.location;
        messageHistory.push({
            role: 'user',
            content: [{
                    tool_use_id: content.id,
                    type: "tool_result",
                    content: JSON.stringify(weatherData),
                }],
        });
    }
    catch (error) {
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
async function processComputerTool(content, messageHistory) {
    const action = content.input.action;
    try {
        if (action === "screenshot") {
            const screenshot = await takeScreenshot();
            const base64Data = screenshot;
            messageHistory.push({
                role: 'user',
                content: [{
                        type: "tool_result",
                        tool_use_id: content.id,
                        content: [{
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/png",
                                    data: base64Data,
                                },
                            }],
                    }],
            });
        }
        else if (action === "cursor_position") {
            const position = await cursorPosition();
            messageHistory.push({
                role: 'user',
                content: [{
                        type: "tool_result",
                        tool_use_id: content.id,
                        content: position,
                    }],
            });
        }
        else if (action === "mouse_move") {
            await moveMouse(content.input.coordinate[0], content.input.coordinate[1]);
        }
        else if (action === "left_click") {
            await mouseClick("left");
        }
        else if (action === "middle_click") {
            await mouseClick("middle");
        }
        else if (action === "right_click") {
            await mouseClick("right");
        }
        else if (action === "double_click") {
            await doubleClick();
        }
        else if (action === "key") {
            await keypress(content.input.text);
        }
        else if (action === "type") {
            await typeText(content.input.text);
        }
        // if the action is an action that doesn't return anything, we need an empty tool result
        if (["mouse_move", "left_click", "middle_click", "right_click", "double_click", "key", "type"].includes(action)) {
            messageHistory.push({
                role: 'user',
                content: [{
                        type: "tool_result",
                        tool_use_id: content.id,
                    }],
            });
        }
    }
    catch (error) {
        // Handle screenshot errors
        messageHistory.push({
            role: 'user',
            content: [{
                    type: "tool_result",
                    tool_use_id: content.id,
                    content: `Error with computer tool: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    is_error: true,
                }],
        });
    }
}
// Then modify the processToolResponse function to use these new functions
async function processToolResponse(content, messageHistory) {
    // Add tool use to the last message's content
    const lastMessage = messageHistory[messageHistory.length - 1];
    if (Array.isArray(lastMessage.content)) {
        lastMessage.content.push(content);
    }
    else {
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
    }
    catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        rl.close();
    }
}
// Start the message loop
//messageLoop();
agentLoop();
