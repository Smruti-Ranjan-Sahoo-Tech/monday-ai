"use client";

import { useEffect, useRef, useState } from "react";
import { socket } from "@/lib/socket";

type Status = "idle" | "recording" | "transcribing" | "thinking" | "speaking";

export default function VoicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const onTranscription = ({ text }: { text: string }) => {
      setTranscript(text);
      setStatus("thinking");
    };

    const onChunk = ({ content }: { content: string }) => {
      setResponse((prev) => prev + content);
    };

    const onDone = () => {
      setStatus("speaking");
    };

    const onAudioChunk = (chunk: ArrayBuffer) => {
      const blob = new Blob([chunk], { type: "audio/wav" });
      audioQueueRef.current.push(blob);
      if (!isPlayingRef.current) playNext();
    };

    const onAudioDone = () => {
      if (!isPlayingRef.current && audioQueueRef.current.length === 0) {
        setStatus("idle");
      }
    };

    const onError = ({ message }: { message: string }) => {
      console.error(message);
      setStatus("idle");
    };

    socket.on("transcription", onTranscription);
    socket.on("chunk", onChunk);
    socket.on("done", onDone);
    socket.on("audio_chunk", onAudioChunk);
    socket.on("audio_done", onAudioDone);
    socket.on("error", onError);

    return () => {
      socket.off("transcription", onTranscription);
      socket.off("chunk", onChunk);
      socket.off("done", onDone);
      socket.off("audio_chunk", onAudioChunk);
      socket.off("audio_done", onAudioDone);
      socket.off("error", onError);
    };
  }, []);

  function playNext() {
    const blob = audioQueueRef.current.shift();
    if (!blob) {
      isPlayingRef.current = false;
      setStatus("idle");
      return;
    }
    isPlayingRef.current = true;
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
    setStatus("idle");
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setTranscript("");
      setResponse("");
      audioQueueRef.current = [];
      isPlayingRef.current = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        const arrayBuffer = await blob.arrayBuffer();
        socket.emit("ask_audio", arrayBuffer);
      };

      mediaRecorder.start();
      setStatus("recording");
    } catch {
      setStatus("idle");
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  const statusLabel: Record<Status, string> = {
    idle: "Hold to speak",
    recording: "Listening...",
    transcribing: "Transcribing...",
    thinking: "Thinking...",
    speaking: "Speaking...",
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-2xl font-bold">Monday AI Voice</h1>

        {transcript && (
          <p className="max-w-md text-center text-sm text-slate-400 italic">
            &ldquo;{transcript}&rdquo;
          </p>
        )}

        {response && (
          <p className="max-w-lg text-center text-sm leading-relaxed text-slate-300">
            {response}
          </p>
        )}

        <span className="text-sm text-slate-500">{statusLabel[status]}</span>

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecording}
          onMouseLeave={stopRecording}
          onTouchStart={startRecording}
          onTouchEnd={stopRecording}
          className={`flex h-32 w-32 items-center justify-center rounded-full text-5xl transition-all duration-150 ${
            status === "recording"
              ? "scale-110 bg-red-600 shadow-[0_0_40px_10px_rgba(220,38,38,0.5)]"
              : "bg-slate-800 shadow-lg hover:bg-slate-700"
          }`}
        >
          🎤
        </button>

        {status === "speaking" && (
          <button
            onClick={stopAudio}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-700"
          >
            Stop
          </button>
        )}

        <a
          href="/"
          className="text-xs text-slate-600 underline hover:text-slate-400"
        >
          Text Chat
        </a>
      </div>
    </main>
  );
}
