import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import multer from "multer";
import { spawn } from "child_process";
import { writeFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import ollama from "ollama";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    credentials: true,
  },
  maxHttpBufferSize: 10 * 1024 * 1024,
});

const WHISPER_CMD = process.env.WHISPER_CMD || "whisper";
const PIPER_CMD = process.env.PIPER_CMD || "piper";
const PIPER_MODEL = process.env.PIPER_MODEL || "en_US-lessac-medium";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "phi4-mini:latest";
const SPEECH_CHUNK_SIZE = parseInt(process.env.SPEECH_CHUNK_SIZE || "16384", 10);

const upload = multer({ storage: multer.memoryStorage() });

function pcmToWav(pcm, sampleRate = 22050) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function transcribe(buffer) {
  const tmpDir = await mkdtemp(join(tmpdir(), "whisper-"));
  const audioPath = join(tmpDir, "input.webm");
  await writeFile(audioPath, buffer);

  return new Promise((resolve, reject) => {
    const proc = spawn(WHISPER_CMD, [
      "--model", "base",
      "--language", "en",
      "--stdout",
      audioPath,
    ]);
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.stderr.on("data", () => {});
    proc.on("close", async (code) => {
      await unlink(audioPath).catch(() => {});
      if (code !== 0) {
        reject(new Error(`Whisper exited with code ${code}`));
        return;
      }
      resolve(output.trim());
    });
    proc.on("error", reject);
  });
}

async function synthesize(text) {
  return new Promise((resolve, reject) => {
    const proc = spawn(PIPER_CMD, [
      "--model", PIPER_MODEL,
      "--output-raw",
    ]);
    const chunks = [];
    proc.stdout.on("data", (chunk) => chunks.push(chunk));
    proc.stderr.on("data", () => {});
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Piper exited with code ${code}`));
        return;
      }
      const pcm = Buffer.concat(chunks);
      resolve(pcmToWav(pcm));
    });
    proc.on("error", reject);
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

async function* streamOllama(prompt) {
  const stream = await ollama.chat({
    model: OLLAMA_MODEL,
    stream: true,
    messages: [{ role: "user", content: prompt }],
  });
  for await (const part of stream) {
    yield part.message.content;
  }
}

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }
    const text = await transcribe(req.file.buffer);
    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("ask", async ({ prompt }) => {
    try {
      let fullResponse = "";
      for await (const content of streamOllama(prompt)) {
        fullResponse += content;
        socket.emit("chunk", { content });
      }
      socket.emit("done", { fullResponse });

      try {
        const wav = await synthesize(fullResponse);
        for (let i = 0; i < wav.length; i += SPEECH_CHUNK_SIZE) {
          socket.emit("audio_chunk", wav.subarray(i, i + SPEECH_CHUNK_SIZE));
        }
      } catch (err) {
        console.error("TTS error:", err.message);
      }
      socket.emit("audio_done");
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("ask_audio", async (buffer) => {
    try {
      if (!Buffer.isBuffer(buffer)) {
        socket.emit("error", { message: "Invalid audio data" });
        return;
      }

      const text = await transcribe(buffer);
      socket.emit("transcription", { text });

      if (!text.trim()) {
        socket.emit("error", { message: "Could not transcribe audio" });
        return;
      }

      let fullResponse = "";
      for await (const content of streamOllama(text)) {
        fullResponse += content;
        socket.emit("chunk", { content });
      }
      socket.emit("done", { fullResponse });

      try {
        const wav = await synthesize(fullResponse);
        for (let i = 0; i < wav.length; i += SPEECH_CHUNK_SIZE) {
          socket.emit("audio_chunk", wav.subarray(i, i + SPEECH_CHUNK_SIZE));
        }
      } catch (err) {
        console.error("TTS error:", err.message);
      }
      socket.emit("audio_done");
    } catch (err) {
      socket.emit("error", { message: err.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
  });
});

server.listen(5005, () => {
  console.log("Server running on port 5005");
});
