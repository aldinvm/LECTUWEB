const express = require('express');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM usuarios WHERE username = ? AND password = ?', [username, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Credenciales incorrectas' });
    res.json({ message: 'Login exitoso', username: user.username, rol: user.rol });
  });
});

// Obtener todas las lecciones
app.get('/api/clases', (req, res) => {
  db.all('SELECT * FROM lecturas', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener clases' });
    res.json(rows);
  });
});

// Crear lección
app.post('/api/clases/nueva', (req, res) => {
  const tituloInicial = 'Lección sin título';
  db.run('INSERT INTO lecturas (titulo, contenido) VALUES (?, ?)', [tituloInicial, ''], function(err) {
    if (err) return res.status(500).json({ error: 'Error al crear la lección' });
    res.json({ id: this.lastID, titulo: tituloInicial });
  });
});

// Obtener detalles de una lección
app.get('/api/clases/:id', (req, res) => {
  const claseId = req.params.id;
  db.get('SELECT * FROM lecturas WHERE id = ?', [claseId], (err, lectura) => {
    if (err || !lectura) return res.status(404).json({ error: 'Clase no encontrada' });
    db.all('SELECT * FROM preguntas WHERE lectura_id = ?', [claseId], (err, preguntas) => {
      res.json({ lectura, preguntas });
    });
  });
});

// Renombrar título
app.put('/api/clases/:id/titulo', (req, res) => {
  const claseId = req.params.id;
  const { titulo } = req.body;
  db.run('UPDATE lecturas SET titulo = ? WHERE id = ?', [titulo, claseId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al cambiar título' });
    res.json({ message: 'Título actualizado' });
  });
});

// Guardar contenido completo
app.post('/api/clases/:id/guardar', (req, res) => {
  const claseId = req.params.id;
  const { titulo, texto, preguntas } = req.body;

  db.run('UPDATE lecturas SET titulo = ?, contenido = ? WHERE id = ?', [titulo, texto, claseId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar lección' });

    db.run('DELETE FROM preguntas WHERE lectura_id = ?', [claseId], () => {
      const stmt = db.prepare('INSERT INTO preguntas (lectura_id, tipo, enunciado, datos, respuesta_correcta, puntos) VALUES (?, ?, ?, ?, ?, ?)');
      if (preguntas) {
        preguntas.forEach(p => {
          stmt.run(claseId, p.tipo, p.enunciado, JSON.stringify(p.datos), p.respuesta_correcta, p.puntos || 1);
        });
      }
      stmt.finalize();
      res.json({ message: 'Lección guardada con éxito' });
    });
  });
});

// Eliminar lección y sus preguntas asociadas
app.delete('/api/clases/:id', (req, res) => {
  const claseId = req.params.id;

  db.run('DELETE FROM preguntas WHERE lectura_id = ?', [claseId], (err) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar preguntas asociadas' });

    db.run('DELETE FROM lecturas WHERE id = ?', [claseId], (err) => {
      if (err) return res.status(500).json({ error: 'Error al eliminar la lección' });
      res.json({ message: 'Lección eliminada con éxito' });
    });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));