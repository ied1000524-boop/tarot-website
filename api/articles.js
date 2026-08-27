const fs = require('fs');
const path = require('path');

// Global in-memory & file-based storage for Vercel / Serverless deployments
let globalArticlesStore = [];

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
        let result = globalArticlesStore;
        if (status) {
            result = result.filter(a => a.status === status);
        }
        res.status(200).json(result);
        return;
    }

    if (req.method === 'POST') {
        const data = req.body || {};
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

        const idx = globalArticlesStore.findIndex(a => a.id === newArticle.id);
        if (idx >= 0) {
            globalArticlesStore[idx] = { ...globalArticlesStore[idx], ...newArticle };
        } else {
            globalArticlesStore.unshift(newArticle);
        }

        res.status(200).json({ success: true, article: newArticle });
        return;
    }

    if (req.method === 'PUT') {
        const id = req.query.id || (req.body && req.body.id);
        const idx = globalArticlesStore.findIndex(a => a.id === id);
        if (idx >= 0) {
            globalArticlesStore[idx] = { ...globalArticlesStore[idx], ...req.body, updated_date: new Date().toISOString().split('T')[0] };
            res.status(200).json({ success: true, article: globalArticlesStore[idx] });
        } else {
            res.status(404).json({ error: 'Article not found' });
        }
        return;
    }

    if (req.method === 'DELETE') {
        const id = req.query.id || (req.body && req.body.id);
        const initialLen = globalArticlesStore.length;
        globalArticlesStore = globalArticlesStore.filter(a => a.id !== id);
        if (globalArticlesStore.length < initialLen) {
            res.status(200).json({ success: true, message: 'Article deleted' });
        } else {
            res.status(404).json({ error: 'Article not found' });
        }
        return;
    }

    res.status(405).json({ error: 'Method not allowed' });
};
