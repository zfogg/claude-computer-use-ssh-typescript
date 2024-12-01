import { exec } from 'child_process';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages' with { 'resolution-mode': 'import' };

async function shell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Shell command failed: ${error.message}`));
        return;
      } else if (stderr) {
        reject(new Error(`Shell command failed: ${stderr}`));
        return;
      } else {
        resolve(stdout.toString().trim())
      }
    });
  });
}

async function ssh(command: string): Promise<string> {
  const SSH_HOST = process.env.COMPUTER_USE_SSH_HOST;
  return await shell(`ssh ${SSH_HOST} "DISPLAY=:0 ${command}"`);
}

async function takeScreenshot(): Promise<string> {
  return await ssh("scrot -o /tmp/ss.png && cat /tmp/ss.png | base64 -w 0");
}

async function moveMouse(x: number, y: number): Promise<void> {
  await ssh(`xdotool mousemove --sync ${x} ${y}`);
}

async function cursorPosition(): Promise<string> {
  return await ssh("xdotool getmouselocation | cut -d' ' -f1,2");
}

async function mouseClick(button: "left" | "right" | "middle"): Promise<void> {
  let buttonNumber;
  switch (button) {
    case "left": buttonNumber = 1; break;
    case "middle": buttonNumber = 2; break;
    case "right": buttonNumber = 3; break;
    default: throw new Error(`Unknown button: ${button}`);
  }
  await ssh(`xdotool click ${buttonNumber}`);
}

async function doubleClick(): Promise<void> {
  await ssh("xdotool click 1 click 1");
}

async function keypress(key: string): Promise<void> {
  await ssh(`xdotool key ${key}`);
}

async function typeText(text: string): Promise<void> {
  await ssh(`xdotool type --delay 100 "${text}"`);
}

export async function processComputerTool(
  content: any,
  messageHistory: MessageParam[]
) {
  const action = (content.input as any).action;

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
      await moveMouse((content.input as any).coordinate[0], (content.input as any).coordinate[1]);
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
      await keypress((content.input as any).text);
    }

    else if (action === "type") {
      await typeText((content.input as any).text);
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

  } catch (error) {
    // Handle screenshot errors
    const errorMessage = `Error with computer tool: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
