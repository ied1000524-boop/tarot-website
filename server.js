const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(__dirname, 'articles.json');

// Initialize empty persistent database file ONLY if it does not exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([]), 'utf-8');
}

const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
};

function readArticlesFromDb() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Error reading articles database:', err);
    }
    return [];
}

function writeArticlesToDb(articles) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(articles, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('Error writing articles database:', err);
        return false;
    }
}

const server = http.createServer((req, res) => {
    // Strict CORS & Cache-Control Headers to prevent stale device data
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // ==================== CENTRAL REST API ROUTES ====================
    if (pathname.startsWith('/api/articles')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Content-Type', 'application/json');

        // GET /api/articles or /api/articles?status=PUBLISHED
        if (req.method === 'GET') {
            const articles = readArticlesFromDb();
            const statusFilter = parsedUrl.searchParams.get('status');

            if (statusFilter) {
                const filtered = articles.filter(a => a.status === statusFilter);
                res.writeHead(200);
                return res.end(JSON.stringify(filtered));
            }

            res.writeHead(200);
            return res.end(JSON.stringify(articles));
        }

        // Body parsing helper for POST/PUT
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            let data = {};
            if (body) {
                try { data = JSON.parse(body); } catch (e) {}
            }

            // POST /api/articles (Create/Publish Article)
            if (req.method === 'POST' && pathname === '/api/articles') {
                const articles = readArticlesFromDb();
                const now = new Date().toISOString();
                const todayStr = now.split('T')[0];

                const newArticle = {
                    id: data.id || `art-${Date.now()}`,
                    title: data.title || 'Untitled Article',
                    slug: data.slug || `article-${Date.now()}`,
                    category: data.category || 'General Insights',
                    featured_image: data.featured_image || data.image || '',
                    excerpt: data.excerpt || '',
                    content: data.content || '',
                    author: 'Priyanshu Dhyani',
                    status: data.status || 'DRAFT',
                    publication_date: data.publication_date || data.date || todayStr,
                    published_at: data.published_at || (data.status === 'PUBLISHED' ? now : null),
                    created_at: data.created_at || now,
                    updated_at: now,
                    updated_date: todayStr,
                    seo_title: data.seo_title || data.seoTitle || '',
                    meta_description: data.meta_description || data.metaDesc || '',
                    featured: Boolean(data.featured)
                };

                const idx = articles.findIndex(a => a.id === newArticle.id);
                if (idx >= 0) {
                    articles[idx] = { ...articles[idx], ...newArticle, updated_at: now };
                } else {
                    articles.unshift(newArticle);
                }

                const success = writeArticlesToDb(articles);
                if (success) {
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: true, article: newArticle }));
                } else {
                    res.writeHead(500);
                    return res.end(JSON.stringify({ error: 'Failed to persist article to central database' }));
                }
            }

            // PUT /api/articles/:id (Update Article)
            if (req.method === 'PUT' && pathname.startsWith('/api/articles/')) {
                const id = pathname.replace('/api/articles/', '');
                const articles = readArticlesFromDb();
                const idx = articles.findIndex(a => a.id === id);

                if (idx >= 0) {
                    const now = new Date().toISOString();
                    articles[idx] = {
                        ...articles[idx],
                        ...data,
                        updated_at: now,
                        updated_date: now.split('T')[0]
                    };
                    if (data.status === 'PUBLISHED' && !articles[idx].published_at) {
                        articles[idx].published_at = now;
                    }
                    const success = writeArticlesToDb(articles);
                    if (success) {
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: true, article: articles[idx] }));
                    } else {
                        res.writeHead(500);
                        return res.end(JSON.stringify({ error: 'Failed to update central database' }));
                    }
                } else {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ error: 'Article not found' }));
                }
            }

            // DELETE /api/articles/:id (Delete Article)
            if (req.method === 'DELETE' && pathname.startsWith('/api/articles/')) {
                const id = pathname.replace('/api/articles/', '');
                let articles = readArticlesFromDb();
                const initialLen = articles.length;
                articles = articles.filter(a => a.id !== id);

                if (articles.length < initialLen) {
                    const success = writeArticlesToDb(articles);
                    if (success) {
                        res.writeHead(200);
                        return res.end(JSON.stringify({ success: true, message: 'Article deleted permanently' }));
                    } else {
                        res.writeHead(500);
                        return res.end(JSON.stringify({ error: 'Failed to update database on deletion' }));
                    }
                } else {
                    res.writeHead(404);
                    return res.end(JSON.stringify({ error: 'Article not found' }));
                }
            }

            res.writeHead(405);
            return res.end(JSON.stringify({ error: 'Method not allowed' }));
        });

        return;
    }

    // ==================== STATIC FILE SERVING ====================
    let decodedUrl = decodeURIComponent(pathname);
    if (decodedUrl === '/') {
        decodedUrl = '/index.html';
    }

    const filePath = path.join(PUBLIC_DIR, decodedUrl);

    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('403 Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('404 Not Found');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`MYSTICAL TAROT READING CENTRAL DATABASE SERVER ONLINE!`);
    console.log(`LOCAL HOST LINK: http://localhost:${PORT}`);
    console.log(`CENTRAL REST API: http://localhost:${PORT}/api/articles`);
    console.log(`==================================================\n`);
});
