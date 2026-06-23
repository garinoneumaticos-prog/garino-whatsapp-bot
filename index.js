import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";

import qrcode from "qrcode-terminal";
import { Pool } from "pg";
import dotenv from "dotenv";
import { buscarMedida } from "./consulta.js";

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
`🚗 ${i.descripcion}
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
    const regex = /(\d{3})\s?(\d{2})\s?(\d{2})/;
    const match = clean.match(regex);

    if (session === "awaiting_stock" && match) {
      delete userState[jid];

      const [, ancho, perfil, rodado] = match;
      const medida = `${ancho}/${perfil}R${rodado}`;

      const result = await buscarMedida(ancho, perfil, rodado);

      if (!result.length) {
        await sock.sendMessage(jid, {
          text: `❌ No hay stock para ${medida}`
        });
        return;
      }

      let respuesta = `📦 Stock para ${medida}\n\n`;

      for (const i of result) {
        respuesta +=
`🚗 ${i.descripcion}
💰 $${Number(i.precio).toLocaleString("es-AR")}
📦 Stock: ${i.stock}

`;
      }

      await sock.sendMessage(jid, { text: respuesta });
      return;
    }

    // =========================
    // STOCK directo (opcional)
    // =========================
    if (match) {
      const [, ancho, perfil, rodado] = match;
      const medida = `${ancho}/${perfil}R${rodado}`;

      const result = await buscarMedida(ancho, perfil, rodado);

      if (!result.length) {
        await sock.sendMessage(jid, {
          text: `❌ No hay stock para ${medida}`
        });
        return;
      }

      let respuesta = `📦 ${result.length} opciones para ${medida}\n\n`;

      for (const i of result) {
        respuesta +=
`🚗 ${i.descripcion}
💰 $${Number(i.precio).toLocaleString("es-AR")}
📦 Stock: ${i.stock}

`;
      }

      await sock.sendMessage(jid, { text: respuesta });
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