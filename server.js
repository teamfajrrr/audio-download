const express = require('express');
const puppeteer = require('puppeteer-core');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Page d'interface simple
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Universal Audio Extractor</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            input[type="url"] { width: 100%; padding: 12px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            button { background: #007cba; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background: #005a87; }
            .result { margin-top: 20px; padding: 15px; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
            .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🎵 Universal Audio Extractor</h1>
            <div class="info">
                <strong>Supported:</strong> Any webpage with audio content (podcasts, music players, etc.)<br>
                <strong>No authentication required</strong> - Works with public content only
            </div>
            <form id="downloadForm">
                <label for="url">Website URL with audio content:</label>
                <input type="url" id="url" placeholder="https://example.com/podcast-page" required>
                <button type="submit">Extract Audio</button>
            </form>
            <div id="result"></div>
        </div>

        <script>
            document.getElementById('downloadForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const url = document.getElementById('url').value;
                const resultDiv = document.getElementById('result');
                
                resultDiv.innerHTML = '<div class="result">⏳ Processing... This may take 30-60 seconds</div>';
                
                try {
                    const response = await fetch('/api/extract', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        let audioFiles = '';
                        let summary = '';
                        
                        if (data.summary) {
                            summary = \`
                                <br><strong>Summary:</strong>
                                <br>• Total files: \${data.summary.totalFiles}
                                <br>• Formats: \${data.summary.formats.join(', ')}
                                <br>• Domains: \${data.summary.domains.join(', ')}
                                <br>• Largest file: \${data.summary.largestFile ? data.summary.largestFile.sizeFormatted : 'N/A'}
                            \`;
                        }
                        
                        data.audioFiles.forEach((file, index) => {
                            audioFiles += \`
                                <br><strong>Audio \${index + 1}:</strong> 
                                <a href="\${file.url}" target="_blank">\${file.filename}</a>
                                <br>• Size: \${file.sizeFormatted} | Type: \${file.extension} | Domain: \${file.domain}
                            \`;
                        });
                        
                        resultDiv.innerHTML = \`<div class="result success">
                            ✅ Success!<br>
                            <strong>Page Title:</strong> \${data.title}
                            \${summary}
                            \${audioFiles}
                        </div>\`;
                    } else {
                        resultDiv.innerHTML = \`<div class="result error">❌ Error: \${data.error}</div>\`;
                    }
                } catch (error) {
                    resultDiv.innerHTML = \`<div class="result error">❌ Error: \${error.message}</div>\`;
                }
            });
        </script>
    </body>
    </html>
  `);
});

// Fonction pour détecter Chromium
function findChromiumExecutable() {
  const fs = require('fs');
  
  // Chemins directs - Railway avec Dockerfile
  const paths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    process.env.PUPPETEER_EXECUTABLE_PATH
  ];
  
  console.log('🔍 Searching for Chromium executable...');
  
  for (const path of paths) {
    if (path) {
      console.log(`Checking: ${path}`);
      try {
        if (fs.existsSync(path)) {
          console.log(`✅ Found Chromium at: ${path}`);
          return path;
        }
      } catch (e) {
        console.log(`❌ Error checking ${path}:`, e.message);
      }
    }
  }
  
  // Dernière tentative avec which
  try {
    const { execSync } = require('child_process');
    const result = execSync('which chromium 2>/dev/null || which google-chrome 2>/dev/null', { encoding: 'utf8' }).trim();
    if (result && fs.existsSync(result)) {
      console.log(`✅ Found via which: ${result}`);
      return result;
    }
  } catch (e) {
    console.log('❌ which command failed:', e.message);
  }
  
  return null;
}

// Endpoint API pour n8n
app.post('/api/extract', async (req, res) => {
  const { url } = req.body;
  
  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  let browser;
  try {
    console.log('🚀 Starting browser...');
    
    // Trouver l'exécutable Chromium
    const chromiumPath = findChromiumExecutable();
    
    if (!chromiumPath) {
      throw new Error('Chromium not found on system');
    }
    
    console.log('✅ Using Chromium:', chromiumPath);
    
    // Configuration Puppeteer
    browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--single-process'
      ]
    });

    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Intercepter les requêtes réseau
    const audioFiles = new Set();
    let pageTitle = 'Unknown Page';
    
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      request.continue();
    });
    
    page.on('response', async (response) => {
      const responseUrl = response.url();
      const contentType = response.headers()['content-type'] || '';
      const contentLength = response.headers()['content-length'];
      
      if (isAudioFile(responseUrl, contentType)) {
        console.log('🎵 Audio file detected:', responseUrl);
        
        // Extraire des infos détaillées
        const audioInfo = {
          url: responseUrl,
          filename: extractFilename(responseUrl),
          extension: extractExtension(responseUrl),
          contentType: contentType,
          size: contentLength ? parseInt(contentLength) : null,
          sizeFormatted: contentLength ? formatBytes(parseInt(contentLength)) : 'Unknown',
          domain: new URL(responseUrl).hostname
        };
        
        audioFiles.add(JSON.stringify(audioInfo));
      }
    });

    console.log('📄 Loading page...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    
    // Extraire le titre
    try {
      pageTitle = await page.title() || 'Unknown Page';
    } catch (e) {
      console.log('⚠️ Could not extract page title');
    }

    console.log('🔍 Looking for audio players...');
    
    // Sélecteurs pour boutons play
    const playSelectors = [
      'button[aria-label*="play" i]',
      'button[aria-label*="lecture" i]',
      'button[title*="play" i]',
      '.play-button',
      '.btn-play',
      'button[class*="play" i]',
      '[data-testid*="play" i]',
      'audio',
      'video'
    ];
    
    let playButtonsFound = 0;
    
    // Corriger la boucle des sélecteurs
    for (const selector of playSelectors) {
      try {
        const elements = await page.$$(selector); // $$ pour tous les éléments
        
        for (const element of elements) {
          try {
            const isVisible = await page.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
            }, element);
            
            if (isVisible) {
              console.log(`✅ Clicking element with selector: ${selector}`);
              await element.click();
              playButtonsFound++;
              await page.waitForTimeout(3000);
            }
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    console.log(`▶️ Found and clicked ${playButtonsFound} potential play buttons`);
    
    // Attendre le chargement audio
    console.log('⏳ Waiting for audio content to load...');
    await page.waitForTimeout(10000);
    
    // Scroll pour déclencher le contenu lazy-loaded
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(3000);
    
    // Vérifier les éléments audio dans le DOM
    const domAudioSources = await page.evaluate(() => {
      const sources = [];
      
      document.querySelectorAll('audio').forEach(audio => {
        if (audio.src) sources.push(audio.src);
        audio.querySelectorAll('source').forEach(source => {
          if (source.src) sources.push(source.src);
        });
      });
      
      document.querySelectorAll('video').forEach(video => {
        if (video.src) sources.push(video.src);
        video.querySelectorAll('source').forEach(source => {
          if (source.src) sources.push(source.src);
        });
      });
      
      return sources;
    });
    
    domAudioSources.forEach(src => {
      if (isAudioFile(src, '')) {
        const audioInfo = {
          url: src,
          filename: extractFilename(src),
          extension: extractExtension(src),
          contentType: 'audio/unknown',
          size: null,
          sizeFormatted: 'Unknown',
          domain: new URL(src, url).hostname,
          source: 'DOM'
        };
        audioFiles.add(JSON.stringify(audioInfo));
      }
    });
    
    console.log(`🎉 Extraction complete! Found ${audioFiles.size} audio files`);
    
    await browser.close();
    
    // Parser et trier les résultats
    const audioArray = Array.from(audioFiles).map(jsonStr => JSON.parse(jsonStr));
    
    // Supprimer les doublons par URL
    const uniqueAudioFiles = audioArray.filter((file, index, self) => 
      index === self.findIndex(f => f.url === file.url)
    );
    
    // Trier par taille (plus grand en premier)
    uniqueAudioFiles.sort((a, b) => (b.size || 0) - (a.size || 0));
    
    if (uniqueAudioFiles.length === 0) {
      return res.status(404).json({ 
        error: 'No audio files found on this page',
        suggestion: 'Make sure the page contains audio content that loads without authentication'
      });
    }
    
    res.json({
      success: true,
      title: pageTitle,
      audioFiles: uniqueAudioFiles,
      originalUrl: url,
      count: uniqueAudioFiles.length,
      summary: {
        totalFiles: uniqueAudioFiles.length,
        largestFile: uniqueAudioFiles[0] || null,
        formats: [...new Set(uniqueAudioFiles.map(f => f.extension))],
        domains: [...new Set(uniqueAudioFiles.map(f => f.domain))]
      }
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (browser) {
      await browser.close();
    }
    
    res.status(500).json({ 
      error: error.message,
      details: 'Make sure the URL is accessible and contains audio content'
    });
  }
});

// Helper functions
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split('/').pop();
    return filename || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

function extractExtension(url) {
  try {
    const filename = extractFilename(url);
    const match = filename.match(/\.([^.?]+)(\?|$)/);
    return match ? match[1].toLowerCase() : 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isAudioFile(url, contentType) {
  // Extensions audio strictes
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus', '.mp4a', '.3gp'];
  
  // Types MIME audio stricts
  const audioContentTypes = [
    'audio/',
    'application/ogg',
    'application/octet-stream' // Parfois utilisé pour l'audio
  ];
  
  // Extensions à exclure explicitement
  const excludedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.css', '.js', '.json', '.html', '.xml', '.txt'];
  
  const urlLower = url.toLowerCase();
  
  // Exclure explicitement les fichiers non-audio
  const hasExcludedExtension = excludedExtensions.some(ext => 
    urlLower.includes(ext)
  );
  
  if (hasExcludedExtension) {
    return false;
  }
  
  // Vérifier les extensions audio
  const hasAudioExtension = audioExtensions.some(ext => 
    urlLower.includes(ext)
  );
  
  // Vérifier le type MIME
  const contentTypeLower = contentType.toLowerCase();
  const hasAudioContentType = audioContentTypes.some(type => 
    contentTypeLower.includes(type)
  );
  
  // Patterns spécifiques pour l'audio streaming
  const audioStreamingPatterns = [
    '/audio/',
    '/podcast/',
    '/stream/',
    'audio-stream',
    '.m3u8',
    '.aac',
    '.mp3'
  ];
  
  const hasAudioStreamingPattern = audioStreamingPatterns.some(pattern => 
    urlLower.includes(pattern)
  );
  
  // Exclure si c'est clairement une image par le type MIME
  if (contentTypeLower.includes('image/') || 
      contentTypeLower.includes('text/') || 
      contentTypeLower.includes('application/json') ||
      contentTypeLower.includes('text/css') ||
      contentTypeLower.includes('application/javascript')) {
    return false;
  }
  
  // Retourner true seulement si c'est vraiment audio
  return hasAudioExtension || (hasAudioContentType && !contentTypeLower.includes('image/')) || hasAudioStreamingPattern;
}

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📱 Interface: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/extract`);
});
