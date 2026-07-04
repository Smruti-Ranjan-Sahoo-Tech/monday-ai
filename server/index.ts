import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import ollama from "ollama";

const app = express();

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:3001"],
        credentials: true,
    },
});

io.on("connection", (socket) => {

    console.log(`Connected : ${socket.id}`);

    socket.on("ask", async ({ prompt }) => {

        try {

            const stream = await ollama.chat({
                model: "phi4-mini:latest",
                stream: true,
                messages: [
                    {
                        role: "user",
                        content: prompt,
                    },
                ],
            });

            for await (const part of stream) {

                socket.emit("chunk", {
                    content: part.message.content,
                });

            }

            socket.emit("done");

        } catch (err) {

            socket.emit("error", {
                message: err.message,
            });

        }

    });

    socket.on("disconnect", () => {
        console.log("Disconnected");
    });

});

server.listen(5005, () => {
    console.log("Server Running on 5005");
});