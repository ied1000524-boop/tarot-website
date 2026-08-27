const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'articles.json');

function getArticles() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading articles.json in serverless function:', e);
    }
    return [];
}

function saveArticles(articles) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(articles, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('Error saving articles.json in serverless function:', e);
        return false;
    }
}

module.exports = (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    const { status } = req.query || {};

    if (req.method === 'GET') {
        let articles = getArticles();
        if (status) {
            articles = articles.filter(a => a.status === status);
        }
        res.status(200).json(articles);
        return;
    }

    if (req.method === 'POST') {
        const data = req.body || {};
        let articles = getArticles();

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
            published_at: data.published_at || (data.status === 'PUBLISHED' ? new Date().toISOString() : null),
            created_at: data.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_date: new Date().toISOString().split('T')[0],
            seo_title: data.seo_title || data.seoTitle || '',
            meta_description: data.meta_description || data.metaDesc || '',
            featured: Boolean(data.featured)
        };

        const idx = articles.findIndex(a => a.id === newArticle.id);
        if (idx >= 0) {
            articles[idx] = { ...articles[idx], ...newArticle, updated_at: new Date().toISOString() };
        } else {
            articles.unshift(newArticle);
        }

        saveArticles(articles);
        res.status(200).json({ success: true, article: newArticle });
        return;
    }

    if (req.method === 'PUT') {
        const id = req.query.id || (req.body && req.body.id);
        let articles = getArticles();
        const idx = articles.findIndex(a => a.id === id);

        if (idx >= 0) {
            articles[idx] = {
                ...articles[idx],
                ...req.body,
                updated_at: new Date().toISOString(),
                updated_date: new Date().toISOString().split('T')[0]
            };
            if (req.body && req.body.status === 'PUBLISHED' && !articles[idx].published_at) {
                articles[idx].published_at = new Date().toISOString();
            }
            saveArticles(articles);
            res.status(200).json({ success: true, article: articles[idx] });
        } else {
            res.status(404).json({ error: 'Article not found' });
        }
        return;
    }

    if (req.method === 'DELETE') {
        const id = req.query.id || (req.body && req.body.id);
        let articles = getArticles();
        const initialLen = articles.length;
        articles = articles.filter(a => a.id !== id);

        if (articles.length < initialLen) {
            saveArticles(articles);
            res.status(200).json({ success: true, message: 'Article deleted' });
        } else {
            res.status(404).json({ error: 'Article not found' });
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
