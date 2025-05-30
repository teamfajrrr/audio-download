# Universal Audio Extractor

🎵 Service universel d'extraction de fichiers audio à partir de n'importe quelle page web publique.

## Fonctionnalités

- ✅ **Universel** - Fonctionne avec n'importe quel site web
- ✅ **Détection intelligente** - Trouve automatiquement les fichiers audio
- ✅ **Multi-formats** - MP3, WAV, OGG, M4A, AAC, FLAC, etc.
- ✅ **Sans authentification** - Contenu public uniquement
- ✅ **Compatible n8n** - API prête pour l'intégration
- ✅ **Interface web** - Test facile via navigateur

## Installation

### Développement local

```bash
git clone [votre-repo]
cd universal-audio-extractor
npm install
npm start
```

### Déploiement Railway

1. Connectez ce repo à Railway
2. Railway détectera automatiquement le projet Node.js
3. Le service sera accessible via HTTPS

## Utilisation

### Interface Web

Accédez à `https://votre-app.railway.app/` et collez l'URL d'une page contenant de l'audio.

### API REST

**Endpoint:** `POST /api/extract`

**Body:**
```json
{
  "url": "https://example.com/page-with-audio"
}
```

**Réponse:**
```json
{
  "success": true,
  "title": "Page Title",
  "audioFiles": [
    "https://site.com/audio1.mp3",
    "https://site.com/stream/audio2.m4a"
  ],
  "count": 2,
  "originalUrl": "https://example.com/page-with-audio"
}
```

## Intégration n8n

### Configuration HTTP Request

- **Method:** POST
- **URL:** `https://votre-app.railway.app/api/extract`
- **Body:** `{"url": "{{$json.website_url}}"}`
- **Headers:** `Content-Type: application/json`

### Workflow suggéré

1. **Webhook/Manual Trigger** → Reçoit l'URL
2. **HTTP Request** → Appelle `/api/extract`
3. **Split In Batches** → Pour chaque fichier audio
4. **HTTP Request** → Télécharge le fichier
5. **Google Drive** → Upload du fichier

## Sites compatibles

- Podcasts publics
- Sites de musique avec lecteurs
- Pages de formation avec audio
- Blogs avec contenu audio
- Sites de news avec podcasts
- Plateformes éducatives

## Limitations

- ❌ Sites avec authentification obligatoire
- ❌ Contenu protégé par DRM
- ❌ Sites avec CAPTCHA
- ❌ Streaming en direct uniquement

## Variables d'environnement

- `PORT` - Port du serveur (défaut: 3000)

## Health Check

`GET /health` - Vérification du statut du service

## Support

Ce service utilise Puppeteer pour automatiser l'interaction avec les pages web et extraire le contenu audio de manière intelligente.
