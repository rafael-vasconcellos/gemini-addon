import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import axios from 'axios';



const distDir = './dist/www/addons/gemini/';
const _package = JSON.parse(fs.readFileSync('package.json'))
const entryPoints = Object.keys(_package.dependencies).map(dep => 
    path.resolve('node_modules', dep)
);

async function downloadFile(url, outputPath) { 
  const dirname = path.dirname(outputPath)
  if (!fs.existsSync(dirname)) { fs.mkdirSync(dirname, { recursive: true }) }
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}


esbuild.build({
  entryPoints, 
  target: 'ES2021',
  bundle: true,
  minify: false,  // mantém o código legível
  format: 'cjs', 
  outdir: distDir + 'lib',
  keepNames: true, // preserva nomes de variáveis/funções
  platform: 'browser', 
  external: ['fsevents', 'node:*'], // Evita que o esbuild tente resolver alguns imports problemáticos

  //sourcemap: true, 
  //splitting: true, 
}).then(() => {
    const files = [
        { src: './package.json', dest: distDir + 'package.json' },
        { src: './icon.png', dest: distDir + 'icon.png' },
    ];

    downloadFile(
        "https://gist.githubusercontent.com/rafael-vasconcellos/6ec7af6c2601e0aa428b1ab727d459ac/raw/36df02e20aba2b3bfe97648309ff96d2ee7b97c2/trans.js", 
        path.resolve("./dist/www/js/trans.js")
    )

    files.forEach(file => {
        fs.copyFile(path.resolve(file.src), path.resolve(file.dest), (err) => { 
            if (err) { console.log(err) }
        });
    });
});