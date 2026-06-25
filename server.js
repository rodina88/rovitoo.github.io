const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');

const db = require('./database');
const { authenticateToken, JWT_SECRET } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Конфигурация Multer для загрузки изображений
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
        cb(null, './uploads');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- AUTH ROUTES ---
app.post('/api/auth/register', (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    if (!username || !email || !password || password !== confirmPassword) {
        return res.status(400).json({ error: 'Заполните все поля корректно' });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    
    db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hashedPassword], function(err) {
        if (err) return res.status(400).json({ error: 'Пользователь с таким логином или Email уже существует' });
        
        const token = jwt.sign({ id: this.lastID, username, is_admin: 0 }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: this.lastID, username, email, avatar: '/uploads/default-avatar.png', is_admin: 0 } });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { loginOrEmail, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? OR email = ?`, [loginOrEmail, loginOrEmail], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'Пользователь не найден' });
        if (user.is_banned) return res.status(403).json({ error: 'Ваш аккаунт заблокирован' });
        
        if (!bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Неверный пароль' });
        }
        const token = jwt.sign({ id: user.id, username: user.username, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, is_admin: user.is_admin } });
    });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get(`SELECT id, username, email, avatar, is_admin, is_banned, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (user.is_banned) return res.status(403).json({ error: 'Забанен' });
        res.json(user);
    });
});

// --- SERVERS ---
app.get('/api/servers', (req, res) => {
    db.all(`SELECT * FROM servers`, [], (err, rows) => res.json(rows || []));
});

// --- ITEMS (ОБЪЯВЛЕНИЯ) ---
app.get('/api/items', (req, res) => {
    let { search, category, server, minPrice, maxPrice, sort } = req.query;
    let query = `SELECT items.*, users.username as author, servers.name as server_name 
                 FROM items 
                 JOIN users ON items.user_id = users.id 
                 JOIN servers ON items.server_id = servers.id WHERE 1=1`;
    let params = [];

    if (search) {
        query += ` AND (items.title LIKE ? OR items.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }
    if (category) { query += ` AND items.category = ?`; params.push(category); }
    if (server) { query += ` AND items.server_id = ?`; params.push(server); }
    if (minPrice) { query += ` AND items.price >= ?`; params.push(Number(minPrice)); }
    if (maxPrice) { query += ` AND items.price <= ?`; params.push(Number(maxPrice)); }

    if (sort === 'price_asc') query += ` ORDER BY items.price ASC`;
    else if (sort === 'price_desc') query += ` ORDER BY items.price DESC`;
    else if (sort === 'popular') query += ` ORDER BY items.views DESC`;
    else query += ` ORDER BY items.created_at DESC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

app.get('/api/items/:id', (req, res) => {
    db.run(`UPDATE items SET views = views + 1 WHERE id = ?`, [req.params.id]);
    db.get(`SELECT items.*, users.username as author, users.avatar as author_avatar, servers.name as server_name 
            FROM items 
            JOIN users ON items.user_id = users.id 
            JOIN servers ON items.server_id = servers.id WHERE items.id = ?`, [req.params.id], (err, item) => {
        if (!item) return res.status(404).json({ error: 'Не найдено' });
        res.json(item);
    });
});

app.post('/api/items', authenticateToken, upload.array('images', 10), (req, res) => {
    const { title, description, price, category, server_id, contacts } = req.body;
    const images = req.files.map(f => `/uploads/${f.filename}`);
    if (images.length === 0) images.push('/uploads/default-avatar.png'); // Заглушка если фото нет

    db.run(`INSERT INTO items (title, description, price, category, server_id, user_id, images, contacts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, description, Number(price), category, server_id, req.user.id, JSON.stringify(images), contacts],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        }
    );
});

// --- FAVORITES ---
app.post('/api/favorites/toggle', authenticateToken, (req, res) => {
    const { item_id } = req.body;
    db.get(`SELECT * FROM favorites WHERE user_id = ? AND item_id = ?`, [req.user.id, item_id], (err, row) => {
        if (row) {
            db.run(`DELETE FROM favorites WHERE user_id = ? AND item_id = ?`, [req.user.id, item_id]);
            res.json({ status: 'removed' });
        } else {
            db.run(`INSERT INTO favorites (user_id, item_id) VALUES (?, ?)`, [req.user.id, item_id]);
            res.json({ status: 'added' });
        }
    });
});

app.get('/api/favorites', authenticateToken, (req, res) => {
    db.all(`SELECT items.*, servers.name as server_name FROM favorites 
            JOIN items ON favorites.item_id = items.id 
            JOIN servers ON items.server_id = servers.id WHERE favorites.user_id = ?`, [req.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

// --- MESSAGES ---
app.post('/api/messages', authenticateToken, upload.single('image'), (req, res) => {
    const { receiver_id, item_id, message } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    db.run(`INSERT INTO messages (sender_id, receiver_id, item_id, message, image) VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, receiver_id, item_id, message, imagePath], function(err) {
            res.json({ success: true });
        }
    );
});

app.get('/api/messages/chats', authenticateToken, (req, res) => {
    db.all(`SELECT DISTINCT data.interlocutor as id, users.username, users.avatar 
            FROM (
                SELECT receiver_id as interlocutor FROM messages WHERE sender_id = ?
                UNION
                SELECT sender_id as interlocutor FROM messages WHERE receiver_id = ?
            ) data JOIN users ON data.interlocutor = users.id WHERE data.interlocutor != ?`, 
    [req.user.id, req.user.id, req.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/api/messages/history/:userId', authenticateToken, (req, res) => {
    db.run(`UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?`, [req.params.userId, req.user.id]);
    db.all(`SELECT * FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY created_at ASC`,
    [req.user.id, req.params.userId, req.params.userId, req.user.id], (err, rows) => {
        res.json(rows || []);
    });
});

// --- PROFILE & REVIEWS ---
app.get('/api/profile/:id', (req, res) => {
    db.get(`SELECT id, username, avatar, created_at FROM users WHERE id = ?`, [req.params.id], (err, profile) => {
        if (!profile) return res.status(404).json({ error: 'Не найден' });
        db.get(`SELECT COUNT(*) as count FROM items WHERE user_id = ?`, [profile.id], (err, itemsCount) => {
            db.get(`SELECT AVG(rating) as avgRating, COUNT(*) as revCount FROM reviews WHERE target_user_id = ?`, [profile.id], (err, rev) => {
                res.json({
                    ...profile,
                    items_count: itemsCount.count,
                    rating: rev.avgRating || 0,
                    reviews_count: rev.revCount || 0
                });
            });
        });
    });
});

app.get('/api/profile/:id/reviews', (req, res) => {
    db.all(`SELECT reviews.*, users.username as author_name FROM reviews 
            JOIN users ON reviews.author_id = users.id WHERE target_user_id = ?`, [req.params.id], (err, rows) => {
        res.json(rows || []);
    });
});

app.post('/api/profile/:id/reviews', authenticateToken, (req, res) => {
    const { rating, text } = req.body;
    db.run(`INSERT INTO reviews (target_user_id, author_id, rating, text) VALUES (?, ?, ?, ?)`,
        [req.params.id, req.user.id, rating, text], () => res.json({ success: true }));
});

// --- ADMIN PANEL ---
app.get('/api/admin/stats', authenticateToken, (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'No admin access' });
    db.get("SELECT COUNT(*) as users FROM users", [], (err, u) => {
        db.get("SELECT COUNT(*) as items FROM items", [], (err, i) => {
            res.json({ users: u.users, items: i.items });
        });
    });
});

app.get('/api/admin/users', authenticateToken, (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'No access' });
    db.all(`SELECT id, username, email, is_banned FROM users`, [], (err, rows) => res.json(rows));
});

app.post('/api/admin/users/:id/ban', authenticateToken, (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'No access' });
    db.run(`UPDATE users SET is_banned = 1 - is_banned WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

app.post('/api/admin/servers', authenticateToken, (req, res) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'No access' });
    db.run(`INSERT INTO servers (name) VALUES (?)`, [req.body.name], () => res.json({ success: true }));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));