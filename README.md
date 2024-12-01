# Claude Testing

A TypeScript-based project that demonstrates integration with Anthropic's Claude AI model and provides interactive tools for AI-assisted computer control and weather information retrieval.

## Features

- **AI Agent Integration**: Integrates with Claude-3 Sonnet model through Anthropic's API for natural language interactions
- **Computer Control Tool**: Enables AI to control computer actions through SSH:
  - Take screenshots
  - Move and control mouse (click, double-click, position)
  - Simulate keyboard input
  - Monitor cursor position
- **Weather Information**: Retrieves current weather data for any location using WeatherAPI
- **Interactive Console**: Provides a command-line interface for user interactions with the AI agent

## Prerequisites

- Node.js >= 20.9
- SSH access to a computer running X11 (for computer control features)
- API keys for:
  - Anthropic (Claude AI)
  - WeatherAPI (weather data)

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```
3. Create a `.env` file with the following environment variables:
```
ANTHROPIC_API_KEY=your_anthropic_api_key
WEATHERAPI_API_KEY=your_weatherapi_key
COMPUTER_USE_SSH_HOST=your_ssh_host
```

## Usage

Start the development server:
```bash
npm run dev
```

Available commands:
- Type your message and press Enter to interact with the AI
- Type `exit` to quit the application
- Type `reset` to clear conversation history
- Type `log` to view conversation history

## Development

Build the project:
```bash
npm run build
```

Watch mode for development:
```bash
npm run build:watch
```

## License

Apache License 2.0 - See [LICENSE](LICENSE) for details.

## Author

Zachary Fogg <me@zfo.gg>
