import fetch from 'node-fetch';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages' with { 'resolution-mode': 'import' };

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

export async function processWeatherTool(
  content: any, 
  messageHistory: MessageParam[]
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
