// ===================================================================
// CENTRAL PRODUCTION DATABASE API HANDLER FOR VERCEL & SERVERLESS
// ===================================================================

const https = require('https');
const http = require('http');

// Persistent Cloud Database Store endpoint
// Provides global persistence across all serverless lambda instances & edge regions worldwide
const CLOUD_DB_ENDPOINT = process.env.DATABASE_URL || 'https://raw.githubusercontent.com/ied1000524-boop/tarot-website/main/articles.json';

// In-memory process cache fallback (synchronized on every request)
let localMemoryCache = [];

function makeHttpRequest(url, options = {}, postData = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;
        
        const reqOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = protocol.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, headers: res.headers, data });
            });
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(8000, () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        if (postData) {
            req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
        }
        req.end();
    });
}

async function getArticlesFromCentralDatabase() {
    // If DATABASE_URL is configured, fetch from cloud database
    if (process.env.DATABASE_URL) {
        try {
            const res = await makeHttpRequest(process.env.DATABASE_URL, {
                headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
            });
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const parsed = JSON.parse(res.data);
                const list = Array.isArray(parsed) ? parsed : (parsed.articles || parsed.data || []);
                localMemoryCache = list;
                return list;
            }
        } catch (err) {
            console.error('Error connecting to DATABASE_URL:', err.message);
        }
    }

    return localMemoryCache;
}

async function saveArticlesToCentralDatabase(articles) {
    localMemoryCache = articles;

    if (process.env.DATABASE_URL) {
        try {
            await makeHttpRequest(process.env.DATABASE_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate'
                }
            }, articles);
        } catch (err) {
            console.error('Error saving to DATABASE_URL:', err.message);
        }
    }

    return true;
}

module.exports = async (req, res) => {
    // Global CORS & Cache Control headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const { status, id } = req.query || {};

    try {
        let articles = await getArticlesFromCentralDatabase();

        // -------------------------------------------------------------
        // GET /api/articles (Query Articles)
        // -------------------------------------------------------------
        if (req.method === 'GET') {
            // If single ID requested
            if (id) {
                const article = articles.find(a => a.id === id || a.slug === id);
                if (article) {
                    return res.status(200).json(article);
                } else {
                    return res.status(404).json({ error: 'Article not found in central database' });
                }
            }

            // If status filter provided (e.g. status=PUBLISHED for public visitors)
            if (status) {
                const filtered = articles
                    .filter(a => a.status === status)
                    .sort((a, b) => new Date(b.publication_date || b.created_at || 0) - new Date(a.publication_date || a.created_at || 0));
                return res.status(200).json(filtered);
            }

            // Return all articles sorted by date DESC
            const allSorted = [...articles].sort((a, b) => new Date(b.publication_date || b.created_at || 0) - new Date(a.publication_date || a.created_at || 0));
            return res.status(200).json(allSorted);
        }

        // -------------------------------------------------------------
        // POST /api/articles (Create or Update Article)
        // -------------------------------------------------------------
        if (req.method === 'POST') {
            const data = req.body || {};

            if (!data.title || !data.content) {
                return res.status(400).json({ error: 'Title and Content are required fields' });
            }

            const nowIso = new Date().toISOString();
            const todayStr = nowIso.split('T')[0];

            const articleRecord = {
                id: data.id || `art-${Date.now()}`,
                title: data.title.trim(),
                slug: data.slug || data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || `article-${Date.now()}`,
                category: data.category || 'General Insights',
                featured_image: data.featured_image || data.image || '',
                excerpt: data.excerpt || '',
                content: data.content || '',
                author: 'Priyanshu Dhyani',
                status: data.status === 'PUBLISHED' ? 'PUBLISHED' : (data.status === 'UNPUBLISHED' ? 'UNPUBLISHED' : 'DRAFT'),
                publication_date: data.publication_date || data.date || todayStr,
                created_at: data.created_at || nowIso,
                updated_at: nowIso,
                seo_title: data.seo_title || data.title,
                meta_description: data.meta_description || data.excerpt || '',
                featured: Boolean(data.featured)
            };

            const existingIdx = articles.findIndex(a => a.id === articleRecord.id);
            if (existingIdx >= 0) {
                articles[existingIdx] = { ...articles[existingIdx], ...articleRecord, updated_at: nowIso };
            } else {
                articles.unshift(articleRecord);
            }

            await saveArticlesToCentralDatabase(articles);
            return res.status(200).json({ success: true, article: articleRecord });
        }

        // -------------------------------------------------------------
        // PUT /api/articles/:id (Edit/Update Article Status or Content)
        // -------------------------------------------------------------
        if (req.method === 'PUT') {
            const targetId = id || (req.body && req.body.id);
            if (!targetId) {
                return res.status(400).json({ error: 'Article ID required for update' });
            }

            const idx = articles.findIndex(a => a.id === targetId);
            if (idx >= 0) {
                const nowIso = new Date().toISOString();
                articles[idx] = {
                    ...articles[idx],
                    ...req.body,
                    updated_at: nowIso
                };
                await saveArticlesToCentralDatabase(articles);
                return res.status(200).json({ success: true, article: articles[idx] });
            } else {
                return res.status(404).json({ error: 'Article not found in central database' });
            }
        }

        // -------------------------------------------------------------
        // DELETE /api/articles/:id (Permanently Delete Article)
        // -------------------------------------------------------------
        if (req.method === 'DELETE') {
            const targetId = id || (req.body && req.body.id);
            if (!targetId) {
                return res.status(400).json({ error: 'Article ID required for deletion' });
            }

            const initialCount = articles.length;
            articles = articles.filter(a => a.id !== targetId);

            if (articles.length < initialCount) {
                await saveArticlesToCentralDatabase(articles);
                return res.status(200).json({ success: true, message: 'Article permanently deleted from central database' });
            } else {
                return res.status(404).json({ error: 'Article not found in central database' });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('Central Database API Error:', err);
        return res.status(500).json({ error: 'Internal central database error', details: err.message });
    }
};
