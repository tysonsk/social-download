const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const sanitize = require('sanitize-filename');
const archiver = require('archiver');
const rimraf = require('rimraf');
const moment = require('moment');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuration
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Helper: run yt-dlp command (using local binary)
async function runYtDlp(url, outputPath, extraOpts = []) {
    // Use the local yt-dlp binary if it exists, otherwise fall back to system
    const ytDlpPath = fs.existsSync('./yt-dlp') ? './yt-dlp' : 'yt-dlp';
    const outputTemplate = path.join(outputPath, '%(uploader)s - %(title)s.%(ext)s');
    const args = [
        url,
        '-o', outputTemplate,
        '--no-playlist',
        ...extraOpts
    ];
    const cmd = `${ytDlpPath} ${args.map(a => `"${a}"`).join(' ')}`;
    console.log(`Executing: ${cmd}`);
    const { stdout, stderr } = await execPromise(cmd);
    return { stdout, stderr };
}

async function getYtDlpInfo(url) {
    const ytDlpPath = fs.existsSync('./yt-dlp') ? './yt-dlp' : 'yt-dlp';
    const cmd = `${ytDlpPath} --dump-json "${url}"`;
    const { stdout } = await execPromise(cmd);
    return JSON.parse(stdout);
}

class UniversalDownloader {
    constructor() {
        this.session = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
    }

    detectPlatform(url) {
        url = url.toLowerCase();
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
        if (url.includes('instagram.com')) return 'instagram';
        if (url.includes('facebook.com') || url.includes('fb.watch')) return 'facebook';
        if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
        if (url.includes('tiktok.com')) return 'tiktok';
        if (url.includes('pinterest.com')) return 'pinterest';
        if (url.includes('linkedin.com')) return 'linkedin';
        if (url.includes('snapchat.com')) return 'snapchat';
        if (url.includes('reddit.com')) return 'reddit';
        if (url.includes('twitch.tv')) return 'twitch';
        return 'unknown';
    }

    async downloadYoutubeContent(url, outputDir) {
        try {
            const info = await getYtDlpInfo(url);
            if (info._type === 'playlist') {
                await runYtDlp(url, outputDir, ['--yes-playlist']);
                const entries = info.entries || [];
                return {
                    status: 'success',
                    message: `Downloaded ${entries.length} videos from playlist`,
                    titles: entries.slice(0, 5).map(e => e.title || 'Unknown'),
                    type: 'playlist'
                };
            } else {
                await runYtDlp(url, outputDir);
                return {
                    status: 'success',
                    message: 'YouTube content downloaded successfully!',
                    title: info.title || 'Unknown',
                    uploader: info.uploader || 'Unknown',
                    type: 'video'
                };
            }
        } catch (error) {
            return { status: 'error', message: `YouTube error: ${error.message}` };
        }
    }

    async downloadInstagramContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['--add-header', 'User-Agent:Mozilla/5.0']);
            const info = await getYtDlpInfo(url).catch(() => ({}));
            let type = 'post';
            if (url.includes('/reel/')) type = 'reel';
            else if (url.includes('/stories/')) type = 'stories';
            else if (url.includes('/p/')) type = 'post';
            return {
                status: 'success',
                message: `Instagram ${type} downloaded successfully!`,
                username: info.uploader || 'Unknown',
                caption: info.description ? (info.description.length > 100 ? info.description.substring(0,100)+'...' : info.description) : '',
                type
            };
        } catch (error) {
            return { status: 'error', message: `Instagram error: ${error.message}` };
        }
    }

    async downloadTiktokContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['-o', path.join(outputDir, 'TikTok_%(uploader)s_%(title)s.%(ext)s')]);
            const info = await getYtDlpInfo(url);
            return {
                status: 'success',
                message: 'TikTok video downloaded successfully!',
                title: info.title || 'TikTok Video',
                uploader: info.uploader || 'Unknown',
                type: 'video'
            };
        } catch (error) {
            return { status: 'error', message: `TikTok error: ${error.message}` };
        }
    }

    async downloadTwitterContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['-o', path.join(outputDir, 'Twitter_%(uploader)s_%(title)s.%(ext)s')]);
            const info = await getYtDlpInfo(url);
            return {
                status: 'success',
                message: 'Twitter content downloaded successfully!',
                title: info.title || 'Twitter Content',
                uploader: info.uploader || 'Unknown',
                type: 'tweet'
            };
        } catch (error) {
            return { status: 'error', message: `Twitter error: ${error.message}` };
        }
    }

    async downloadFacebookContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['-o', path.join(outputDir, 'Facebook_%(title)s.%(ext)s')]);
            const info = await getYtDlpInfo(url);
            return {
                status: 'success',
                message: 'Facebook content downloaded successfully!',
                title: info.title || 'Facebook Content',
                type: 'video'
            };
        } catch (error) {
            return { status: 'error', message: `Facebook error: ${error.message}` };
        }
    }

    async downloadRedditContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['-o', path.join(outputDir, 'Reddit_%(title)s.%(ext)s')]);
            const info = await getYtDlpInfo(url);
            return {
                status: 'success',
                message: 'Reddit content downloaded successfully!',
                title: info.title || 'Reddit Post',
                type: 'post'
            };
        } catch (error) {
            return { status: 'error', message: `Reddit error: ${error.message}` };
        }
    }

    async downloadGenericContent(url, outputDir) {
        try {
            await runYtDlp(url, outputDir, ['-o', path.join(outputDir, '%(extractor)s_%(title)s.%(ext)s')]);
            const info = await getYtDlpInfo(url);
            return {
                status: 'success',
                message: 'Content downloaded successfully!',
                title: info.title || 'Unknown',
                extractor: info.extractor || 'Unknown',
                type: 'media'
            };
        } catch (error) {
            return { status: 'error', message: `Download error: ${error.message}` };
        }
    }

    async downloadContent(url, customPath = null) {
        const basePath = customPath || DOWNLOAD_DIR;
        const platform = this.detectPlatform(url);
        const timestamp = moment().format('YYYYMMDD_HHmmss');
        const downloadFolder = path.join(basePath, `${platform}_${timestamp}`);
        fs.mkdirSync(downloadFolder, { recursive: true });

        try {
            switch (platform) {
                case 'youtube': return await this.downloadYoutubeContent(url, downloadFolder);
                case 'instagram': return await this.downloadInstagramContent(url, downloadFolder);
                case 'tiktok': return await this.downloadTiktokContent(url, downloadFolder);
                case 'twitter': return await this.downloadTwitterContent(url, downloadFolder);
                case 'facebook': return await this.downloadFacebookContent(url, downloadFolder);
                case 'reddit': return await this.downloadRedditContent(url, downloadFolder);
                default: return await this.downloadGenericContent(url, downloadFolder);
            }
        } catch (error) {
            return { status: 'error', message: `Unexpected error: ${error.message}` };
        }
    }
}

const downloader = new UniversalDownloader();

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/download', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !url.trim()) {
            return res.status(400).json({ status: 'error', message: 'URL is required' });
        }
        const platform = downloader.detectPlatform(url);
        const result = await downloader.downloadContent(url.trim());
        result.platform = platform;
        res.json(result);
    } catch (error) {
        res.status(500).json({ status: 'error', message: `Server error: ${error.message}` });
    }
});

app.post('/bulk-download', async (req, res) => {
    try {
        const { urls } = req.body;
        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ status: 'error', message: 'URLs list is required' });
        }
        const results = [];
        for (const url of urls) {
            if (url && url.trim()) {
                const result = await downloader.downloadContent(url.trim());
                result.url = url;
                results.push(result);
            }
        }
        res.json({
            status: 'success',
            message: `Processed ${results.length} URLs`,
            results
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: `Bulk download error: ${error.message}` });
    }
});

app.get('/downloads', (req, res) => {
    try {
        const items = [];
        if (fs.existsSync(DOWNLOAD_DIR)) {
            const files = fs.readdirSync(DOWNLOAD_DIR);
            for (const item of files) {
                const itemPath = path.join(DOWNLOAD_DIR, item);
                const stats = fs.statSync(itemPath);
                if (stats.isFile()) {
                    items.push({
                        name: item,
                        type: 'file',
                        size: stats.size
                    });
                } else if (stats.isDirectory()) {
                    const fileCount = fs.readdirSync(itemPath).filter(f => fs.statSync(path.join(itemPath, f)).isFile()).length;
                    items.push({
                        name: item,
                        type: 'folder',
                        file_count: fileCount
                    });
                }
            }
        }
        res.json({ items });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/download-file/:filename', (req, res) => {
    try {
        const filename = sanitize(req.params.filename);
        const filePath = path.join(DOWNLOAD_DIR, filename);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.download(filePath);
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/download-folder/:foldername', (req, res) => {
    try {
        const foldername = sanitize(req.params.foldername);
        const folderPath = path.join(DOWNLOAD_DIR, foldername);
        if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
            const archive = archiver('zip', { zlib: { level: 9 } });
            res.attachment(`${foldername}.zip`);
            archive.pipe(res);
            archive.directory(folderPath, false);
            archive.finalize();
        } else {
            res.status(404).json({ error: 'Folder not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/supported-platforms', (req, res) => {
    res.json({
        video_platforms: [
            'YouTube (videos, shorts, playlists)',
            'TikTok',
            'Twitter/X',
            'Facebook',
            'Instagram (Reels, IGTV)',
            'Reddit',
            'Twitch',
            'Vimeo',
            'Dailymotion'
        ],
        social_platforms: [
            'Instagram (Posts, Stories, Reels, IGTV)',
            'Twitter/X (Tweets, Threads)',
            'Facebook (Posts, Videos)',
            'Reddit (Posts, Images, Videos)',
            'LinkedIn (Posts)',
            'Pinterest (Pins)'
        ],
        features: [
            'Auto-platform detection',
            'Bulk downloads',
            'Stories download',
            'Playlist support',
            'High quality downloads',
            'Metadata preservation',
            'Subtitle downloads'
        ]
    });
});

app.post('/clear-downloads', (req, res) => {
    try {
        if (fs.existsSync(DOWNLOAD_DIR)) {
            rimraf.sync(DOWNLOAD_DIR);
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }
        res.json({ status: 'success', message: 'Downloads cleared successfully' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: `Error clearing downloads: ${error.message}` });
    }
});

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('UNIVERSAL SOCIAL MEDIA DOWNLOADER (Node.js)');
    console.log('='.repeat(60));
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Supported platforms: YouTube, Instagram, TikTok, Twitter/X, Facebook, Reddit, and more!');
    console.log('='.repeat(60));
});
