import dotenv from "dotenv";
import pg from "pg";

dotenv.config({
path: "../.env"
});

const { Pool } = pg;

const pool = new Pool({
connectionString: process.env.NEON_DATABASE_URL,
ssl: {
rejectUnauthorized: false,
},
});

export async function buscarMedida(
ancho,
perfil,
rodado
) {

const resultado = await pool.query(
`     SELECT
      marca,
      descripcion,
      precio,
      stock
    FROM neumaticos
    WHERE ancho = $1
      AND perfil = $2
      AND rodado = $3
      AND stock > 0
    ORDER BY precio ASC
    `,
[ancho, perfil, rodado]
);

return resultado.rows;
}
