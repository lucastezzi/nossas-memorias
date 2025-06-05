const express = require('express');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    'http://localhost:3000', // Para testar localmente
    'https://nossas-memorias-pied.vercel.app' // A URL EXATA da sua Vercel!
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `A política CORS para este site não permite acesso da origem especificada: ${origin}`;
            console.warn(msg);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

// --- Configuração do Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

// --- Configuração do Banco de Dados PostgreSQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Conecta e cria a tabela (se não existir) ao iniciar o aplicativo
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS memories (
                id SERIAL PRIMARY KEY,
                image_path TEXT NOT NULL,
                event_date TEXT NOT NULL,
                description TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Tabela "memories" do PostgreSQL pronta.');
    } catch (err) {
        console.error('Erro ao conectar ou criar tabela PostgreSQL:', err.message);
        // process.exit(1);
    }
})();


// --- Configuração do Multer para Uploads ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));


// --- Rotas da API ---

// 1. Rota para UPLOAD de nova memória
app.post('/api/memories', upload.single('photo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma foto enviada.' });
    }
    const { eventDate, description } = req.body;

    if (!eventDate || !description) {
        return res.status(400).json({ error: 'Data e descrição são obrigatórios.' });
    }

    try {
        // Converte o buffer da imagem para o formato Data URI
        const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        // Envia a imagem para o Cloudinary
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'nossas_memorias_fotos'
        });

        const imagePath = result.secure_url;

        // Salva a URL do Cloudinary no banco de dados PostgreSQL
        const queryText = 'INSERT INTO memories (image_path, event_date, description) VALUES ($1, $2, $3) RETURNING id';
        const queryValues = [imagePath, eventDate, description];
        const resDb = await pool.query(queryText, queryValues);
        const newMemoryId = resDb.rows[0].id;

        res.status(201).json({
            message: 'Memória salva com sucesso no Cloudinary e BD!',
            id: newMemoryId,
            imagePath: imagePath,
            eventDate,
            description
        });

    } catch (error) {
        console.error('Erro ao fazer upload para o Cloudinary ou salvar no BD:', error);
        return res.status(500).json({ error: 'Erro ao fazer upload da imagem ou salvar no banco de dados.' });
    }
});

// 2. Rota para OBTER todas as memórias
app.get('/api/memories', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM memories ORDER BY event_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar memórias:', err.message);
        return res.status(500).json({ error: 'Erro interno do servidor ao buscar memórias.' });
    }
});

// 3. Rota para DELETAR uma memória
app.delete('/api/memories/:id', async (req, res) => {
    const memoryId = req.params.id;

    try {
        // Busca a URL da imagem no banco de dados
        const imageResult = await pool.query('SELECT image_path FROM memories WHERE id = $1', [memoryId]);
        const row = imageResult.rows[0];

        if (!row) {
            return res.status(404).json({ error: 'Memória não encontrada.' });
        }

        const imageUrlToDelete = row.image_path;

        // Extrai o Public ID do Cloudinary para deletar
        const publicIdMatch = imageUrlToDelete.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
        let publicId = null;
        if (publicIdMatch && publicIdMatch[1]) {
            publicId = publicIdMatch[1];
        }

        // Remove a entrada do banco de dados
        const deleteResult = await pool.query('DELETE FROM memories WHERE id = $1', [memoryId]);
        
        if (deleteResult.rowCount === 0) {
            return res.status(404).json({ error: 'Memória não encontrada para exclusão.' });
        }

        // Se o Public ID foi encontrado, tenta remover a imagem do Cloudinary
        if (publicId) {
            try {
                await cloudinary.uploader.destroy(publicId);
                console.log('Imagem removida do Cloudinary:', publicId);
            } catch (cloudinaryErr) {
                console.warn('Aviso: Erro ao remover imagem do Cloudinary:', cloudinaryErr.message);
            }
        } else {
            console.warn('Aviso: Não foi possível extrair Public ID do Cloudinary:', imageUrlToDelete);
        }

        res.json({ message: 'Memória excluída com sucesso do Cloudinary e BD!' });

    } catch (error) {
        console.error('Erro ao excluir memória:', error);
        return res.status(500).json({ error: 'Erro interno do servidor ao excluir memória.' });
    }
});

// --- Iniciar o Servidor ---
app.listen(port, '0.0.0.0', () => { // <--- LINHA CORRIGIDA AQUI!
    console.log(`Servidor rodando em http://0.0.0.0:${port}`);
    console.log(`Acesse o site em http://localhost:${port} (para testes locais)`);
});