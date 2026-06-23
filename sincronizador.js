import fs from 'fs';
import xlsx from 'xlsx';
import pg from 'pg';
import chokidar from 'chokidar';
import dotenv from "dotenv";

dotenv.config({
    path: "../.env"
});

console.log("NEON URL:", process.env.NEON_DATABASE_URL ? "ENCONTRADA" : "NO ENCONTRADA");

function extraerMedidas(descripcion, rubro) {

    if (!descripcion) {
        return {
            ancho: null,
            perfil: null,
            rodado: null
        };
    }

    const texto = descripcion.toUpperCase();
    const categoria = (rubro || "").toUpperCase();

    let ancho = null;
    let perfil = null;
    let rodado = null;

    // =================================================
    // AUTOS / CAMIONETAS / CAMIONES
    // 255/70R16
    // 275/80R22.5
    // =================================================

    if (
        categoria.includes("AUTO") ||
        categoria.includes("CAMIONETA") ||
        categoria.includes("CAMION")
    ) {

        const match = texto.match(
            /(\d{3})\/(\d{2})R(\d{2}(?:\.\d+)?)/i
        );

        if (match) {
            ancho = match[1];
            perfil = match[2];
            rodado = match[3];
        }
    }

    // =================================================
    // AGRICOLAS / VIALES / CONSTRUCCION
    // 7.50-18
    // 12-16.5
    // =================================================

    else if (
        categoria.includes("AGRIC") ||
        categoria.includes("VIAL") ||
        categoria.includes("CONTRU") ||
        categoria.includes("CONSTRU")
    ) {

        const match = texto.match(
            /(\d+(?:\.\d+)?)\-(\d{2}(?:\.\d+)?)/i
        );

        if (match) {
            ancho = match[1];
            perfil = "-";
            rodado = match[2];
        }
    }

    // =================================================
    // MOTOS / BICICLETAS
    // 300X18
    // 27.5X2.10
    // =================================================

    else if (
        categoria.includes("MOTO") ||
        categoria.includes("BICICLETA")
    ) {

        const match = texto.match(
            /(\d+(?:\.\d+)?)X(\d+(?:\.\d+)?)/i
        );

        if (match) {

            // Bicicletas
            if (Number(match[1]) <= 30) {
                rodado = match[1];
                ancho = match[2];
            }

            // Motos
            else {
                ancho = match[1];
                rodado = match[2];
            }

            perfil = "-";
        }
    }

    return {
        ancho,
        perfil,
        rodado
    };
}

const pool = new pg.Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'garino_db',
    password: 'admingarino08',
    port: 5432,
});

const neonPool = new pg.Pool({
    connectionString: process.env.NEON_DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const RUTA_ARCHIVO = 'C:\\WebGarinoNeumaticos\\SincronizacionERAS\\stock.xlsx';

console.log("🚀 Sincronizador iniciado...");
console.log("📁 Esperando cambios en:", RUTA_ARCHIVO);

const watcher = chokidar.watch(
    RUTA_ARCHIVO,
    {
        usePolling: true,
        interval: 1000
    }
);

watcher.on('all', async (event, path) => {

    console.log("📂 Evento detectado:", event);
    console.log("📄 Archivo:", path);

    if (
        event !== 'change' &&
        event !== 'add'
    ) return;

    console.log("📂 Archivo Excel detectado. Procesando...");

    try {

        const workbook = xlsx.readFile(RUTA_ARCHIVO);

        const sheetName = workbook.SheetNames[0];

        const data = xlsx.utils.sheet_to_json(
            workbook.Sheets[sheetName],
            { defval: "" }
        );

        if (data.length === 0) {
            console.log("⚠️ El archivo está vacío.");
            return;
        }

        console.log(`Total de filas detectadas: ${data.length}`);

        const client = await pool.connect();
        const neonClient = await neonPool.connect();

        try {

            await client.query('BEGIN');
            await neonClient.query('BEGIN');

            for (const row of data) {

                const medidas = extraerMedidas(
                    row['Descripción'],
                    row['Rubro']
                );

                const codigo =
                    row['Código de compra']?.trim() ||
                    row['Código']?.trim();

                    if (!codigo) {
                    console.log("⚠️ Fila ignorada por código vacío:", row);
                    continue;
                }

                await client.query(
                    `
                    INSERT INTO neumaticos (
                      codigo_compra,
                      descripcion,
                      precio,
                      stock,
                      marca,
                      rubro,
                      ancho,
                      perfil,
                      rodado
                    )
                    VALUES (
                      $1, $2, $3, $4, $5,
                      $6, $7, $8, $9
                    )
                    ON CONFLICT (codigo_compra)
                    DO UPDATE SET
                      descripcion = EXCLUDED.descripcion,
                      precio = EXCLUDED.precio,
                      stock = EXCLUDED.stock,
                      marca = EXCLUDED.marca,
                      rubro = EXCLUDED.rubro,
                      ancho = EXCLUDED.ancho,
                      perfil = EXCLUDED.perfil,
                      rodado = EXCLUDED.rodado;
                    `,
                    [
                      codigo,
                      row['Descripción'],
                      row['CONTADO'],
                      row['Stock'],
                      row['Marca'],
                      row['Rubro'],
                      medidas.ancho,
                      medidas.perfil,
                      medidas.rodado
                    ]
                  );
                  await neonClient.query(
                    `
                    INSERT INTO neumaticos (
                      codigo_compra,
                      descripcion,
                      precio,
                      stock,
                      marca,
                      rubro,
                      ancho,
                      perfil,
                      rodado
                    )
                    VALUES (
                      $1,$2,$3,$4,$5,
                      $6,$7,$8,$9
                    )
                    ON CONFLICT (codigo_compra)
                    DO UPDATE SET
                      descripcion = EXCLUDED.descripcion,
                      precio = EXCLUDED.precio,
                      stock = EXCLUDED.stock,
                      marca = EXCLUDED.marca,
                      rubro = EXCLUDED.rubro,
                      ancho = EXCLUDED.ancho,
                      perfil = EXCLUDED.perfil,
                      rodado = EXCLUDED.rodado;
                    `,
                    [
                      codigo,
                      row['Descripción'],
                      row['CONTADO'],
                      row['Stock'],
                      row['Marca'],
                      row['Rubro'],
                      medidas.ancho,
                      medidas.perfil,
                      medidas.rodado
                    ]
                    );
                }
                

            await client.query('COMMIT');
            await neonClient.query('COMMIT');

            console.log("✅ ¡Sincronización exitosa y completa!");

          } catch (err) {

            await client.query('ROLLBACK');
            await neonClient.query('ROLLBACK');

            console.error(
                "❌ Error al insertar en BD:",
                err
            );

        } finally {

            client.release();
            neonClient.release();
        }

    } catch (err) {

        console.error(
            "❌ Error leyendo Excel:",
            err.message
        );
    }
});