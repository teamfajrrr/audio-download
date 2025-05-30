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
                        data.audioFiles.forEach((file, index) => {
                            audioFiles += \`<br><strong>Audio \${index + 1}:</strong> <a href="\${file}" target="_blank">Download</a>\`;
                        });
                        
                        resultDiv.innerHTML = \`<div class="result success">
                            ✅ Success!<br>
                            <strong>Page Title:</strong> \${data.title}<br>
                            <strong>Audio Files Found:</strong> \${data.audioFiles.length}
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
      
      if (isAudioFile(responseUrl, contentType)) {
        console.log('🎵 Audio file detected:', responseUrl);
        audioFiles.add(responseUrl);
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
        audioFiles.add(src);
      }
    });
    
    console.log(`🎉 Extraction complete! Found ${audioFiles.size} audio files`);
    
    await browser.close();
    
    const audioArray = Array.from(audioFiles);
    
    if (audioArray.length === 0) {
      return res.status(404).json({ 
        error: 'No audio files found on this page',
        suggestion: 'Make sure the page contains audio content that loads without authentication'
      });
    }
    
    res.json({
      success: true,
      title: pageTitle,
      audioFiles: audioArray,
      originalUrl: url,
      count: audioArray.length
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

function isAudioFile(url, contentType) {
  const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'];
  const audioContentTypes = ['audio/', 'application/ogg'];
  
  const hasAudioExtension = audioExtensions.some(ext => 
    url.toLowerCase().includes(ext)
  );
  
  const hasAudioContentType = audioContentTypes.some(type => 
    contentType.toLowerCase().includes(type)
  );
  
  const streamingPatterns = [
    '/stream',
    '/audio',
    '/podcast',
    '/mp3',
    '.m3u8',
    'audio-stream'
  ];
  
  const hasStreamingPattern = streamingPatterns.some(pattern => 
    url.toLowerCase().includes(pattern)
  );
  
  return hasAudioExtension || hasAudioContentType || hasStreamingPattern;
}

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
  console.log(`📱 Interface: http://localhost:${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/extract`);
});
