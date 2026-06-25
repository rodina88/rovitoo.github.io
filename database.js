const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./rodina.db');

db.serialize(() => {
    // Пользователи
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        avatar TEXT DEFAULT '/uploads/default-avatar.png',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_admin INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0
    )`);

    // Серверы
    db.run(`CREATE TABLE IF NOT EXISTS servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE
    )`);

    // Объявления
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        price INTEGER,
        category TEXT,
        server_id INTEGER,
        user_id INTEGER,
        images TEXT, -- JSON array
        contacts TEXT,
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(server_id) REFERENCES servers(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Чат / Сообщения
    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        item_id INTEGER,
        message TEXT,
        image TEXT DEFAULT NULL,
        is_read INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Отзывы
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_user_id INTEGER,
        author_id INTEGER,
        rating INTEGER,
        text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Избранное
    db.run(`CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER,
        item_id INTEGER,
        PRIMARY KEY (user_id, item_id)
    )`);

    // Первоначальное заполнение серверов, если они отсутствуют
    db.get("SELECT COUNT(*) as count FROM servers", (err, row) => {
        if (row && row.count === 0) {
            const defaultServers = [
                "Центральный округ", "Южный округ", "Северный округ", 
                "Восточный округ", "Западный округ", "Уральский округ", 
                "Приморский округ", "Санкт-Петербург"
            ];
            const stmt = db.prepare("INSERT INTO servers (name) VALUES (?)");
            defaultServers.forEach(srv => stmt.run(srv));
            stmt.finalize();
        }
    });
});

module.exports = db;