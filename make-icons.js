// Crea tutte le icone dell'app (PNG) partendo dal tuo logo.
// Uso, dalla cartella principale del progetto:
//   npm install --no-save sharp
//   node make-icons.js

const sharp = require('sharp');
const fs = require('fs');

// Il tuo logo originale (cambia il nome se il file si chiama in modo diverso)
const SOURCE = 'assets/images/imgswimfolder.jpeg';

// [file da creare, lato in pixel]
const targets = [
  ['assets/images/icon.png', 1024],
  ['assets/images/splash-icon.png', 512],
  ['assets/images/favicon.png', 64],
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];

(async () => {
  if (!fs.existsSync(SOURCE)) {
    console.error('Non trovo il file ' + SOURCE + '. Controlla il nome in cima a questo script.');
    process.exit(1);
  }
  fs.mkdirSync('public', { recursive: true });

  for (const [out, size] of targets) {
    // Se il logo non è quadrato viene ritagliato al centro
    await sharp(SOURCE)
      .resize(size, size, { fit: 'cover' })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(out);
    console.log('creato', out);
  }
  console.log('Fatto!');
})();