```markdown
# monday-ai

## Overview
monday-ai is an AI assistant designed to help developers and normal users automate their workflows. It leverages voice recognition and text-to-speech capabilities to create an interactive experience.

## Features
- Text-to-Speech (TTS)
- Speech-to-Text (STT) and voice text agent

## Tech Stack
### Client
- TypeScript
- Next.js
- React
- Tailwind CSS
- Socket.IO

### Server
- TypeScript
- Express
- Socket.IO
- CORS
- dotenv
- Multer
- Ollama

## Installation
To install the project, clone the repository and install the dependencies for both the client and server.

```bash
git clone https://github.com/Smruti-Ranjan-Sahoo-Tech/monday-ai.git
cd monday-ai

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

## Usage
To run the application, start both the client and server.

```bash
# Start the server
cd server
npm run dev

# In another terminal, start the client
cd client
npm run dev
```

## Architecture
The project consists of two main directories: `client` and `server`. The `client` directory contains the frontend application built with Next.js, while the `server` directory contains the backend API built with Express. The client communicates with the server using Socket.IO for real-time interactions.

### Pages
- Home: `client/src/app/page.tsx`
- Voice: `client/src/app/voice/page.tsx`

## Contributing
Contributions are welcome! Please submit a pull request or open an issue to discuss potential changes.

## License
This project is licensed under the MIT License.
```