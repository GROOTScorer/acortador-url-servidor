import express from 'express';
import { nanoid } from 'nanoid';
import cors from "cors";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { body, validationResult } from 'express-validator';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT;
const SITEURL = process.env.SITEURL


const app = express();
app.use(express.json());
app.use(cors());

const setupDatabase = async () => {
  const db = await open({
    filename: './urlshortener.db',
    driver: sqlite3.Database
  });

  await db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  await db.exec(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    originalUrl TEXT,
    shortUrl TEXT UNIQUE,
    descripcion TEXT
  )`);

  return db;
};

const db = await setupDatabase();

  app.post('/createshorturl', async (req, res) => {
    const { url, descripcion } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Verificar si la URL ya existe
    const existingUrl = await db.get('SELECT shortUrl, descripcion FROM urls WHERE originalUrl = ?', url);
    if (existingUrl) {
        // Devolver la URL existente y su descripción
        return res.status(200).json({ originalUrl: url, shortUrl: existingUrl.shortUrl, descripcion: existingUrl.descripcion });
    }

    // Generar una URL corta única
    let hash;
    let shortUrl;
    do {
        hash = nanoid(7);
        shortUrl = `${SITEURL}:${PORT}/s/${hash}`;
    } while (await db.get('SELECT id FROM urls WHERE shortUrl = ?', shortUrl));

    // Insertar la nueva URL y su descripción en la base de datos
    await db.run('INSERT INTO urls (originalUrl, shortUrl, descripcion) VALUES (?, ?, ?)', [url, shortUrl, descripcion]);

    // Devolver la nueva URL y su descripción
    res.status(201).json({ originalUrl: url, shortUrl, descripcion });
});

app.post('/register', [
    body('username').isLength({ min: 3 }),
    body('password').isLength({ min: 6 })
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);

        res.status(201).send({"error":"Usuario registrado"});
    }

    catch (error) {
        console.error(error);
        res.status(500).send({"error":"Error al registrar el usuario"});
    }

  });

  app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
  
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
  
        if (user && await bcrypt.compare(password, user.password)) {
            const token = jwt.sign({ username: user.username }, 'SECRET_KEY', { expiresIn: '2h' });
  
            res.json({ token });
        } else {
            res.status(401).send({"error":"Nombre de usuario o contraseña incorrectos"});
        }
    } catch (error) {
        console.error(error);
        res.status(500).send({"error":"Error al iniciar sesión"});
    }
  });

app.get('/s/:hash', async (req, res) => {
    const { hash } = req.params;
    const urlData = await db.get('SELECT originalUrl FROM urls WHERE shortUrl = ?', `${SITEURL}:${PORT}/s/${hash}`);

    if (urlData) {
        res.redirect(urlData.originalUrl);
    } else {
        res.status(404).send({"error":"404"});
    }
});

app.get('/latest-urls', async (req, res) => {
    try {
        const latestUrls = await db.all('SELECT originalUrl, shortUrl,descripcion FROM urls ORDER BY id DESC LIMIT 20');
        res.json(latestUrls);
    } catch (error) {
        console.error('Error al obtener las últimas URLs:', error);
        res.status(500).send({"error":"Error al obtener las últimas URLs"});
    }
});

app.listen(PORT, () => console.log(`Server corriendo en ${PORT}`));