const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lecturas.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    rol TEXT
  )`);

  const stmt = db.prepare(`INSERT OR IGNORE INTO usuarios (username, password, rol) VALUES (?, ?, ?)`);
  stmt.run('Administrador', 'aldinvm8', 'admin');
  stmt.run('Yarlet', 'yarlet', 'estudiante');
  stmt.run('Usuario2', 'user2', 'estudiante');
  stmt.run('Usuario3', 'user3', 'estudiante');
  stmt.finalize();

  db.run(`CREATE TABLE IF NOT EXISTS lecturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT,
    contenido TEXT,
    estado TEXT DEFAULT 'borrador'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS preguntas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lectura_id INTEGER,
    tipo TEXT, 
    enunciado TEXT,
    datos TEXT, 
    respuesta_correcta TEXT,
    puntos INTEGER DEFAULT 1,
    FOREIGN KEY(lectura_id) REFERENCES lecturas(id)
  )`);

  // Agrega la columna puntos en caso de que la tabla ya existiera previamente
  db.run(`ALTER TABLE preguntas ADD COLUMN puntos INTEGER DEFAULT 1`, (err) => {
    // Si la columna ya existe, SQLite dará un aviso que podemos ignorar
  });
// Agrega la columna estado a lecturas si ya existía la base de datos
  db.run(`ALTER TABLE lecturas ADD COLUMN estado TEXT DEFAULT 'borrador'`, (err) => {
    // Si la columna ya existe, SQLite dará un aviso que podemos ignorar
  });
  db.run(`CREATE TABLE IF NOT EXISTS resultados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    lectura_id INTEGER,
    puntaje INTEGER,
    total_preguntas INTEGER,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

console.log("¡Base de datos configurada correctamente!");
module.exports = db;
