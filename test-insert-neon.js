require("dotenv").config({
    path: "../.env"
  });

const pg = require("pg");

const pool = new pg.Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {
  await pool.query(`
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
      'TEST001',
      'NEUMATICO PRUEBA',
      1000,
      5,
      'GARINO',
      'PRUEBA',
      '185',
      '65',
      '15'
    )
    ON CONFLICT (codigo_compra)
    DO UPDATE SET
      stock = EXCLUDED.stock
  `);

  console.log("✅ Insertado en Neon");

  process.exit(0);
}

main().catch(console.error);