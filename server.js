const express = require('express');
const db = require('./database');

const app = express();
// Permite guardar lecciones con imágenes comprimidas en Base64.
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  db.get(
    'SELECT * FROM usuarios WHERE username = ? AND password = ?',
    [username, password],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      res.json({
        message: 'Login exitoso',
        username: user.username,
        rol: user.rol
      });
    }
  );
});

// Obtener lista de lecciones.
// Admin: ve borradores y publicadas.
// Estudiante: solo ve lecciones publicadas con contenido.
app.get('/api/clases', (req, res) => {
  const usuario = req.query.usuario || 'Desconocido';
  const esAdmin = req.query.admin === 'true';

  // La lista solo devuelve los datos que necesita cada tarjeta.
  // El contenido completo (que puede incluir imágenes Base64) se solicita
  // únicamente al abrir una lección.
  const query = esAdmin
    ? `
      SELECT
        l.id,
        l.titulo,
        l.estado,
        l.color,
        (
          SELECT COUNT(*)
          FROM resultados r
          WHERE r.lectura_id = l.id AND r.usuario = ?
        ) AS completada
      FROM lecturas l
      ORDER BY l.id DESC
    `
    : `
      SELECT
        l.id,
        l.titulo,
        l.estado,
        l.color,
        (
          SELECT COUNT(*)
          FROM resultados r
          WHERE r.lectura_id = l.id AND r.usuario = ?
        ) AS completada
      FROM lecturas l
      WHERE l.estado = 'publicada'
        AND l.contenido IS NOT NULL
        AND l.contenido != ''
        AND l.contenido != '[]'
      ORDER BY l.id DESC
    `;

  db.all(query, [usuario], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener clases' });
    }

    res.json(rows);
  });
});

// Crear una nueva lección siempre como borrador.
app.post('/api/clases/nueva', (req, res) => {
  const tituloInicial = 'Lección sin título';

  db.run(
    `INSERT INTO lecturas (titulo, contenido, estado, color)
     VALUES (?, ?, 'borrador', ?)`,
    [tituloInicial, '', '#6C5CE7'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al crear la lección' });
      }

      res.json({
        id: this.lastID,
        titulo: tituloInicial,
        estado: 'borrador'
      });
    }
  );
});

// Obtener detalles de una lección.
// El editor usa ?admin=true para poder abrir borradores.
// El estudiante solo puede abrir lecciones publicadas.
app.get('/api/clases/:id', (req, res) => {
  const claseId = req.params.id;
  const esAdmin = req.query.admin === 'true';

  const query = esAdmin
    ? 'SELECT * FROM lecturas WHERE id = ?'
    : `SELECT * FROM lecturas
       WHERE id = ? AND estado = 'publicada'`;

  db.get(query, [claseId], (err, lectura) => {
    if (err) {
      return res.status(500).json({ error: 'Error al obtener la lección' });
    }

    if (!lectura) {
      return res.status(404).json({
        error: esAdmin
          ? 'Clase no encontrada'
          : 'Esta lección no está disponible'
      });
    }

    db.all(
      'SELECT * FROM preguntas WHERE lectura_id = ? ORDER BY id ASC',
      [claseId],
      (errPreguntas, preguntas) => {
        if (errPreguntas) {
          return res.status(500).json({ error: 'Error al obtener las preguntas' });
        }

        res.json({ lectura, preguntas });
      }
    );
  });
});

// Renombrar título
app.put('/api/clases/:id/titulo', (req, res) => {
  const claseId = req.params.id;
  const { titulo } = req.body;

  db.run(
    'UPDATE lecturas SET titulo = ? WHERE id = ?',
    [titulo, claseId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al cambiar título' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Clase no encontrada' });
      }

      res.json({ message: 'Título actualizado' });
    }
  );
});

function textoPlanoServidor(valor = '') {
  return String(valor || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function validarPreguntasServidor(preguntas) {
  if (!Array.isArray(preguntas)) return null;

  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i] || {};
    const numero = i + 1;

    if (!textoPlanoServidor(p.enunciado)) {
      return `La pregunta ${numero} necesita un enunciado.`;
    }

    if (p.tipo === 'multiple') {
      const opciones = Array.isArray(p.datos) ? p.datos : [];

      if (opciones.length < 2) {
        return `La pregunta ${numero} necesita al menos 2 alternativas.`;
      }

      if (opciones.some(op => !String(op || '').trim())) {
        return `La pregunta ${numero} contiene alternativas vacías.`;
      }

      const match = String(p.respuesta_correcta || '').match(/^idx:(\d+)$/);
      if (!match) {
        return `Selecciona la alternativa correcta de la pregunta ${numero}.`;
      }

      const idx = Number(match[1]);
      if (!Number.isInteger(idx) || idx < 0 || idx >= opciones.length) {
        return `La respuesta correcta de la pregunta ${numero} no es válida.`;
      }
    }

    if (p.tipo === 'verdadero_falso') {
      const items = Array.isArray(p.datos) ? p.datos : [];
      if (items.length === 0 || items.some(item => !String(item?.texto || '').trim())) {
        return `Completa todas las afirmaciones de la pregunta ${numero}.`;
      }
    }

    if (p.tipo === 'unir') {
      const parejas = String(p.datos || '')
        .split(', ')
        .filter(Boolean);

      if (
        parejas.length === 0 ||
        parejas.some(par => {
          const partes = par.split(' = ');
          return partes.length < 2 || !partes[0].trim() || !partes.slice(1).join(' = ').trim();
        })
      ) {
        return `Completa todas las parejas de la pregunta ${numero}.`;
      }
    }
  }

  return null;
}

// Guardar el contenido sin cambiar su estado.
// Guardar NO publica una lección.
app.post('/api/clases/:id/guardar', (req, res) => {
  const claseId = req.params.id;
  const { titulo, texto, color, preguntas } = req.body;

  const errorPreguntas = validarPreguntasServidor(preguntas);
  if (errorPreguntas) {
    return res.status(400).json({ error: errorPreguntas });
  }

  db.run(
    `UPDATE lecturas
     SET titulo = ?, contenido = ?, color = ?
     WHERE id = ?`,
    [titulo, texto, color || '#6C5CE7', claseId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al actualizar lección' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Clase no encontrada' });
      }

      db.run(
        'DELETE FROM preguntas WHERE lectura_id = ?',
        [claseId],
        (errDelete) => {
          if (errDelete) {
            return res.status(500).json({ error: 'Error al actualizar preguntas' });
          }

          const listaPreguntas = Array.isArray(preguntas) ? preguntas : [];

          if (listaPreguntas.length === 0) {
            return res.json({ message: 'Lección guardada con éxito' });
          }

          const stmt = db.prepare(
            `INSERT INTO preguntas
             (lectura_id, tipo, enunciado, datos, respuesta_correcta, puntos)
             VALUES (?, ?, ?, ?, ?, ?)`
          );

          let errorInsercion = null;

          listaPreguntas.forEach((p) => {
            stmt.run(
              claseId,
              p.tipo,
              p.enunciado,
              JSON.stringify(p.datos),
              p.respuesta_correcta,
              p.puntos || 1,
              (errInsert) => {
                if (errInsert && !errorInsercion) {
                  errorInsercion = errInsert;
                }
              }
            );
          });

          stmt.finalize((errFinalize) => {
            if (errFinalize || errorInsercion) {
              return res.status(500).json({ error: 'Error al guardar preguntas' });
            }

            res.json({ message: 'Lección guardada con éxito' });
          });
        }
      );
    }
  );
});

// Publicar o despublicar una lección.
app.put('/api/clases/:id/estado', (req, res) => {
  const claseId = req.params.id;
  const { estado } = req.body;

  if (!['borrador', 'publicada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  db.get(
    'SELECT id, contenido FROM lecturas WHERE id = ?',
    [claseId],
    (err, lectura) => {
      if (err) {
        return res.status(500).json({ error: 'Error al consultar la lección' });
      }

      if (!lectura) {
        return res.status(404).json({ error: 'Clase no encontrada' });
      }

      if (
        estado === 'publicada' &&
        (!lectura.contenido ||
          lectura.contenido.trim() === '' ||
          lectura.contenido.trim() === '[]')
      ) {
        return res.status(400).json({
          error: 'Agrega contenido y guarda la lección antes de publicarla'
        });
      }

      db.run(
        'UPDATE lecturas SET estado = ? WHERE id = ?',
        [estado, claseId],
        function(errUpdate) {
          if (errUpdate) {
            return res.status(500).json({ error: 'Error al cambiar el estado' });
          }

          res.json({
            message:
              estado === 'publicada'
                ? 'Lección publicada'
                : 'Lección guardada como borrador',
            estado
          });
        }
      );
    }
  );
});

// Eliminar lección y sus preguntas asociadas.
app.delete('/api/clases/:id', (req, res) => {
  const claseId = req.params.id;

  db.run(
    'DELETE FROM preguntas WHERE lectura_id = ?',
    [claseId],
    (err) => {
      if (err) {
        return res.status(500).json({ error: 'Error al eliminar preguntas asociadas' });
      }

      db.run(
        'DELETE FROM lecturas WHERE id = ?',
        [claseId],
        function(errLeccion) {
          if (errLeccion) {
            return res.status(500).json({ error: 'Error al eliminar la lección' });
          }

          if (this.changes === 0) {
            return res.status(404).json({ error: 'Clase no encontrada' });
          }

          res.json({ message: 'Lección eliminada con éxito' });
        }
      );
    }
  );
});

// Guardar resultado del estudiante.
app.post('/api/resultados', (req, res) => {
  const { usuario, lectura_id, puntaje, total_preguntas } = req.body;

  db.run(
    `INSERT INTO resultados
     (usuario, lectura_id, puntaje, total_preguntas)
     VALUES (?, ?, ?, ?)`,
    [usuario, lectura_id, puntaje, total_preguntas],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Error al guardar resultado' });
      }

      res.json({
        message: 'Resultado guardado exitosamente',
        id: this.lastID
      });
    }
  );
});

// Ruta para que el admin vea los resultados.
app.get('/api/resultados', (req, res) => {
  const query = `
    SELECT r.usuario, l.titulo AS lectura, r.puntaje
    FROM resultados r
    JOIN lecturas l ON r.lectura_id = l.id
    ORDER BY r.fecha DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(rows);
  });
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});
