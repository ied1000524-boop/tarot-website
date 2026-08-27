const CLOUD_DB_URL = 'https://api.restful-api.dev/objects/ff8081819ff5b11001a0440daa513a1c';

async function fetchFromCloud() {
    const res = await fetch(CLOUD_DB_URL, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!res.ok) throw new Error('Cloud DB fetch failed: ' + res.status);
    const json = await res.json();
    return (json.data && Array.isArray(json.data.articles)) ? json.data.articles : [];
}

async function saveToCloud(articles) {
    const body = {
        name: "Mystical Tarot Blog Articles",
        data: { articles: articles }
    };
    const res = await fetch(CLOUD_DB_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Cloud DB save failed: ' + res.status);
    return true;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    try {
        const { status, id } = req.query || {};

        if (req.method === 'GET') {
            const articles = await fetchFromCloud();
            if (status) {
                const filtered = articles.filter(a => a.status === status);
                return res.status(200).json(filtered);
            }
            return res.status(200).json(articles);
        }

        if (req.method === 'POST') {
            const data = req.body || {};
            const articles = await fetchFromCloud();
            const todayStr = new Date().toISOString().split('T')[0];

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
                published_at: data.status === 'PUBLISHED' ? todayStr : (data.published_at || ''),
                created_at: data.created_at || todayStr,
                updated_at: todayStr,
                seo_title: data.seo_title || data.seoTitle || '',
                meta_description: data.meta_description || data.metaDesc || '',
                is_featured: Boolean(data.is_featured || data.featured)
            };

            const idx = articles.findIndex(a => a.id === newArticle.id);
            if (idx >= 0) {
                articles[idx] = { ...articles[idx], ...newArticle, updated_at: todayStr };
            } else {
                articles.unshift(newArticle);
            }

            await saveToCloud(articles);
            return res.status(200).json({ success: true, article: newArticle });
        }

        if (req.method === 'PUT') {
            const targetId = id || (req.body && req.body.id);
            const articles = await fetchFromCloud();
            const idx = articles.findIndex(a => a.id === targetId);

            if (idx >= 0) {
                const todayStr = new Date().toISOString().split('T')[0];
                articles[idx] = {
                    ...articles[idx],
                    ...req.body,
                    updated_at: todayStr
                };
                if (req.body.status === 'PUBLISHED' && !articles[idx].published_at) {
                    articles[idx].published_at = todayStr;
                }
                await saveToCloud(articles);
                return res.status(200).json({ success: true, article: articles[idx] });
            } else {
                return res.status(404).json({ error: 'Article not found' });
            }
        }

        if (req.method === 'DELETE') {
            const targetId = id || (req.body && req.body.id);
            let articles = await fetchFromCloud();
            const initialLen = articles.length;
            articles = articles.filter(a => a.id !== targetId);

            if (articles.length < initialLen) {
                await saveToCloud(articles);
                return res.status(200).json({ success: true, message: 'Article deleted permanently' });
            } else {
                return res.status(404).json({ error: 'Article not found' });
            }
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ error: 'Database operation failed', details: err.message });
    }
};
