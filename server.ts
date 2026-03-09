import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("monopoly.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    code TEXT PRIMARY KEY,
    state TEXT NOT NULL
  )
`);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  const PORT = 3000;

  // Track connected clients by room
  const rooms = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws) => {
    let currentRoom: string | null = null;
    let userId: string | null = null;

    ws.on("message", (data) => {
      const message = JSON.parse(data.toString());

      if (message.type === "join") {
        const { roomCode, uid } = message;
        currentRoom = roomCode;
        userId = uid;

        if (!rooms.has(roomCode)) {
          rooms.set(roomCode, new Set());
        }
        rooms.get(roomCode)!.add(ws);

        // Send current state
        const game = db.prepare("SELECT state FROM games WHERE code = ?").get(roomCode) as { state: string } | undefined;
        if (game) {
          ws.send(JSON.stringify({ type: "sync", state: JSON.parse(game.state) }));
        }
      }

      if (message.type === "action") {
        const { roomCode, newState } = message;
        // Save to DB
        db.prepare("INSERT OR REPLACE INTO games (code, state) VALUES (?, ?)").run(roomCode, JSON.stringify(newState));
        
        // Broadcast to room
        const clients = rooms.get(roomCode);
        if (clients) {
          const syncMsg = JSON.stringify({ type: "sync", state: newState });
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(syncMsg);
            }
          });
        }
      }
    });

    ws.on("close", () => {
      if (currentRoom && rooms.has(currentRoom)) {
        rooms.get(currentRoom)!.delete(ws);
        if (rooms.get(currentRoom)!.size === 0) {
          rooms.delete(currentRoom);
        }
      }
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
