"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [error, setError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const responseRef = useRef("");
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const onChunk = ({ content }: { content: string }) => {
      responseRef.current += content;
      setResponse(responseRef.current);
    };

    const onDone = () => {
      setLoading(false);
    };

    const onAudioChunk = (chunk: ArrayBuffer) => {
      const blob = new Blob([chunk], { type: "audio/wav" });
      audioQueueRef.current.push(blob);
      if (!isPlayingRef.current) playNext();
    };

    const onAudioDone = () => {
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        setAudioPlaying(false);
      }
    };

    const onTranscription = ({ text }: { text: string }) => {
      setPrompt(text);
    };

    const onError = ({ message }: { message: string }) => {
      setError(message);
      setLoading(false);
    };

    socket.on("chunk", onChunk);
    socket.on("done", onDone);
    socket.on("audio_chunk", onAudioChunk);
    socket.on("audio_done", onAudioDone);
    socket.on("transcription", onTranscription);
    socket.on("error", onError);

    return () => {
      socket.off("chunk", onChunk);
      socket.off("done", onDone);
      socket.off("audio_chunk", onAudioChunk);
      socket.off("audio_done", onAudioDone);
      socket.off("transcription", onTranscription);
      socket.off("error", onError);
    };
  }, []);

  function playNext() {
    const blob = audioQueueRef.current.shift();
    if (!blob) {
      isPlayingRef.current = false;
      setAudioPlaying(false);
      return;
    }
    isPlayingRef.current = true;
    setAudioPlaying(true);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudioRef.current = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentAudioRef.current = null;
      playNext();
    };
    audio.play();
  }

  function stopAudio() {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAudioPlaying(false);
  }

  function resetState() {
    setError("");
    setResponse("");
    responseRef.current = "";
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setAudioPlaying(false);
  }

  function askAI(text?: string) {
    const msg = (text ?? prompt).trim();
    if (!msg || loading) return;
    resetState();
    setLoading(true);
    socket.emit("ask", { prompt: msg });
  }

  async function startRecording() {
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;

        resetState();
        setLoading(true);
        const arrayBuffer = await blob.arrayBuffer();
        socket.emit("ask_audio", arrayBuffer);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied or unavailable");
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askAI();
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
      <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h1 className="text-xl font-bold">Monday AI</h1>
            <p className="text-xs text-slate-500">
              Ollama + Whisper + Piper
            </p>
          </div>
          <div className="flex items-center gap-3">
            {loading && (
              <span className="text-sm text-blue-400">Generating...</span>
            )}
            {audioPlaying && (
              <button
                onClick={stopAudio}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700"
              >
                Stop Audio
              </button>
            )}
          </div>
        </div>

        <div className="h-[400px] overflow-y-auto p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
          {response ? (
            <p className="whitespace-pre-wrap font-sans leading-7 text-slate-200">
              {response}
            </p>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-lg text-slate-600">
                  {loading ? "Listening..." : "Ask anything..."}
                </p>
                {!loading && (
                  <p className="mt-1 text-xs text-slate-700">
                    Type a message or hold the mic button
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="flex gap-3">
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none transition focus:border-blue-500"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => askAI()}
                disabled={loading || !prompt.trim()}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Send
              </button>
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={recording ? stopRecording : undefined}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={loading}
                className={`rounded-xl px-5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  recording
                    ? "bg-red-600 text-white shadow-lg shadow-red-600/30"
                    : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                }`}
              >
                {recording ? "Recording..." : "🎤 Mic"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
