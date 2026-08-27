const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(__dirname, 'articles.json');

// Initialize empty persistent database file if it does not exist
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
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading articles database:', err);
        return [];
    }
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
    // CORS & No-Cache Headers for API
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

            // POST /api/articles (Create Article)
            if (req.method === 'POST' && pathname === '/api/articles') {
                const articles = readArticlesFromDb();
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
                    publication_date: data.publication_date || data.date || new Date().toISOString().split('T')[0],
                    updated_date: new Date().toISOString().split('T')[0],
                    seo_title: data.seo_title || data.seoTitle || '',
                    meta_description: data.meta_description || data.metaDesc || '',
                    featured: Boolean(data.featured)
                };

                // Check if updating existing by id
                const idx = articles.findIndex(a => a.id === newArticle.id);
                if (idx >= 0) {
                    articles[idx] = { ...articles[idx], ...newArticle };
                } else {
                    articles.unshift(newArticle);
                }

                writeArticlesToDb(articles);
                res.writeHead(200);
                return res.end(JSON.stringify({ success: true, article: newArticle }));
            }

            // PUT /api/articles/:id (Update Article)
            if (req.method === 'PUT' && pathname.startsWith('/api/articles/')) {
                const id = pathname.replace('/api/articles/', '');
                const articles = readArticlesFromDb();
                const idx = articles.findIndex(a => a.id === id);

                if (idx >= 0) {
                    articles[idx] = { ...articles[idx], ...data, updated_date: new Date().toISOString().split('T')[0] };
                    writeArticlesToDb(articles);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: true, article: articles[idx] }));
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
                    writeArticlesToDb(articles);
                    res.writeHead(200);
                    return res.end(JSON.stringify({ success: true, message: 'Article deleted' }));
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

    // Prevent directory traversal attacks
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
