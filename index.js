import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";
import { Pool } from "pg";
import dotenv from "dotenv";
import { buscarMedida } from "./consulta.js";
import express from "express";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 🧠 estado por usuario (clave para STOCK en 2 pasos)
const userState = {};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");

  const sock = makeWASocket({
    auth: state,
    browser: ["Garino Bot", "Chrome", "1.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages?.[0];
    if (!msg?.message) return;

    const jid = msg.key.remoteJid;

    const texto =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "";

    const clean = texto.trim();
    const session = userState[jid] || null;

    if (
      clean.startsWith("📦 ¿Qué medida") ||
      clean.startsWith("📦 Resultados") ||
      clean.startsWith("❌ No encontré") ||
      clean.startsWith("🏷 Marcas") ||
      clean.startsWith("💰 Lista de precios") ||
      clean.startsWith("✅ OK")
    ) {
      console.log("⛔ Mensaje generado por el bot");
      return;
    }

    console.log("================================");
    console.log("📩 TEXTO:", clean);
    console.log("👤 JID:", jid);
    console.log("FROMME:", msg.key.fromMe);
    console.log("================================");

    // =========================
    // STOCK (inicio flujo)
    // =========================
    if (clean.toLowerCase() === "stock") {
      userState[jid] = "awaiting_stock";

      await sock.sendMessage(jid, {
        text: "📦 ¿Qué medida querés consultar?"
      });

      return;
    }

    // =========================
    // MARCAS
    // =========================
    if (clean.toLowerCase() === "marcas") {
      const result = await pool.query(`
        SELECT DISTINCT marca
        FROM neumaticos
        ORDER BY marca ASC
      `);

      const marcas = result.rows.map(r => `- ${r.marca}`).join("\n");

      await sock.sendMessage(jid, {
        text: `🏷 Marcas disponibles:\n\n${marcas}`
      });

      return;
    }

    // =========================
    // PRECIOS (ASCENDENTE)
    // =========================
    if (
      clean.toLowerCase() === "precio" ||
      clean.toLowerCase() === "precios"
    ) {
      const result = await pool.query(`
        SELECT *
        FROM neumaticos
        ORDER BY precio ASC
      `);

      let respuesta = `💰 Lista de precios (menor a mayor)\n\n`;

      for (const i of result.rows) {
        respuesta +=
`🏷 ${i.marca}
🚗 ${i.descripcion}
📂 Rubro: ${i.rubro}
💰 $${Number(i.precio).toLocaleString("es-AR")}
📦 Stock: ${i.stock}

`;
      }

      await sock.sendMessage(jid, { text: respuesta });

      return;
    }

    // =========================
    // STOCK (respuesta medida)
    // =========================
    if (session === "awaiting_stock") {

      delete userState[jid];
    
      let busqueda = clean.trim();
    
      // 200 65 15 -> 200/65R15
      const numeros = busqueda.match(/\d+/g);
    
      if (numeros?.length === 3) {
        busqueda =
          `${numeros[0]}/${numeros[1]}R${numeros[2]}`;
      }
    
      // 200 65 -> 200/65
      else if (numeros?.length === 2) {
        busqueda =
          `${numeros[0]}/${numeros[1]}`;
      }
    
      // 200 -> queda 200
    
      const result = await buscarMedida(busqueda);
    
      if (!result.length) {
        await sock.sendMessage(jid, {
          text: `❌ No encontré resultados para ${busqueda}`
        });
        return;
      }
    
      let respuesta =
    `📦 Resultados para ${busqueda}
    
    `;
    
      for (const i of result) {
    
        respuesta +=
`🏷 ${i.marca}
🚗 ${i.descripcion}
📂 Rubro: ${i.rubro}
💰 $${Number(i.precio).toLocaleString("es-AR")}
📦 Stock: ${i.stock}
    
    `;
      }
    
      await sock.sendMessage(jid, {
        text: respuesta
      });
    
      return;
    }

    // =========================
    // TEST
    // =========================
    if (clean.toLowerCase() === "test") {
      const result = await pool.query("SELECT NOW()");

      await sock.sendMessage(jid, {
        text: `✅ OK\n${result.rows[0].now}`
      });

      return;
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === "open") {
      console.log("✅ Bot conectado");
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;

      if (shouldReconnect) startBot();
    }
  });
}

startBot();

// ====================
// EXPRESS PARA RENDER
// ====================

const app = express();

app.get("/", (req, res) => {
  res.send("Bot online");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);
});