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

export async function buscarMedida(textoBusqueda) {
  const resultado = await pool.query(
    `
    SELECT
      marca,
      rubro,
      descripcion,
      precio,
      stock
    FROM neumaticos
    WHERE descripcion ILIKE $1
      AND stock > 0
    ORDER BY precio ASC
    `,
    [`%${textoBusqueda}%`]
  );

  return resultado.rows;
}

