import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_DIR = path.join(process.cwd(), 'src', 'proto');
const COMPAS_PB_DIR = path.join(PROTO_DIR, 'compas_pb', 'generated');
const ANTIKYTHERA_SOURCE_LOCAL = path.resolve(process.cwd(), '../antikythera/src/antikythera/proto/antikythera.proto');
const ANTIKYTHERA_SOURCE_REMOTE = 'https://raw.githubusercontent.com/gramaziokohler/antikythera/main/src/antikythera/proto/antikythera.proto';
const ANTIKYTHERA_DEST = path.join(PROTO_DIR, 'antikythera.proto');

// Ensure directories exist
if (!fs.existsSync(COMPAS_PB_DIR)) {
    fs.mkdirSync(COMPAS_PB_DIR, { recursive: true });
}

const downloadUrl = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const options = {
            headers: {
                'User-Agent': 'Node.js'
            }
        };

        if (process.env.GITHUB_TOKEN) {
            options.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }

        https.get(url, options, (response) => {
            if (response.statusCode !== 200) {
                fs.unlink(destPath, () => { });
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded ${path.basename(destPath)}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { });
            reject(err);
        });
    });
};

// 2. Download compas_pb files
const COMPAS_FILES = [
    'arc.proto', 'bezier.proto', 'box.proto', 'capsule.proto', 'circle.proto',
    'cone.proto', 'cylinder.proto', 'ellipse.proto', 'frame.proto', 'hyperbola.proto',
    'line.proto', 'mesh.proto', 'message.proto', 'parabola.proto', 'plane.proto',
    'point.proto', 'pointcloud.proto', 'polygon.proto', 'polyhedron.proto',
    'polyline.proto', 'projection.proto', 'quaternion.proto', 'reflection.proto',
    'rotation.proto', 'scale.proto', 'shear.proto', 'sphere.proto', 'torus.proto',
    'transformation.proto', 'translation.proto', 'vector.proto'
];
const BASE_URL = 'https://raw.githubusercontent.com/gramaziokohler/compas_pb/main/src/compas_pb/protobuf_defs/compas_pb/generated/';

async function main() {
    // 1. Fetch antikythera.proto
    console.log('Fetching antikythera.proto...');
    let antikytheraFetched = false;

    // Try remote first
    try {
        console.log(`Attempting download from ${ANTIKYTHERA_SOURCE_REMOTE}...`);
        await downloadUrl(ANTIKYTHERA_SOURCE_REMOTE, ANTIKYTHERA_DEST);
        antikytheraFetched = true;
    } catch (e) {
        console.warn(`Remote download failed: ${e.message}`);
        console.log('Falling back to local copy...');
    }

    // Fallback to local
    if (!antikytheraFetched) {
        if (fs.existsSync(ANTIKYTHERA_SOURCE_LOCAL)) {
            fs.copyFileSync(ANTIKYTHERA_SOURCE_LOCAL, ANTIKYTHERA_DEST);
            console.log(`Copied from ${ANTIKYTHERA_SOURCE_LOCAL}`);
        } else {
            console.error(`Error: Could not fetch antikythera.proto from remote or local source.`);
            console.error(`Local path checked: ${ANTIKYTHERA_SOURCE_LOCAL}`);
            process.exit(1);
        }
    }

    console.log('Downloading compas_pb files...');
    try {
        await Promise.all(COMPAS_FILES.map(f => downloadUrl(`${BASE_URL}${f}`, path.join(COMPAS_PB_DIR, f))));
    } catch (e) {
        console.error('Error downloading compas_pb files:', e);
        process.exit(1);
    }

    // 3. Generate bundle
    console.log('Generating bundle...');
    try {
        const compasFiles = COMPAS_FILES.map(f => path.join('src/proto/compas_pb/generated', f));
        const protoFiles = [`src/proto/antikythera.proto`, ...compasFiles].map(p => `"${p}"`).join(' ');

        execSync(`npx pbjs -t static-module -w es6 -p src/proto -o src/proto/bundle.js ${protoFiles}`, { stdio: 'inherit' });

        // pbts -o src/proto/bundle.d.ts src/proto/bundle.js
        execSync(`npx pbts -o src/proto/bundle.d.ts src/proto/bundle.js`, { stdio: 'inherit' });

        console.log('Bundle generated successfully.');
        process.exit(0);
    } catch (e) {
        console.error('Error generating bundle:', e);
        process.exit(1);
    }
}

main();

