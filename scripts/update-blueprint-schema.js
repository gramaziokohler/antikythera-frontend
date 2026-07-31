import fs from 'fs';
import path from 'path';
import https from 'https';
import { compile } from 'json-schema-to-typescript';

/**
 * Sync the canonical Blueprint JSON Schema from the backend and (re)generate the
 * TypeScript types the frontend uses to model blueprints.
 *
 * The JSON Schema — not this generated file, and not the backend Python classes —
 * is the single source of truth for the blueprint data model. Both the frontend
 * types and the runtime validation are derived from it, so the contract between
 * frontend and backend is the JSON itself.
 *
 * Mirrors scripts/update-protos.js: try the published schema on GitHub first,
 * fall back to the sibling backend checkout, then generate committed artifacts.
 */

const SCHEMA_DIR = path.join(process.cwd(), 'src', 'schemas');
const SCHEMA_DEST = path.join(SCHEMA_DIR, 'blueprint.v1.schema.json');
const TYPES_DEST = path.join(process.cwd(), 'src', 'types', 'blueprint.ts');

const SCHEMA_SOURCE_LOCAL = path.resolve(
    process.cwd(),
    '../antikythera-backend/src/antikythera/models/blueprint.v1.schema.json',
);
const SCHEMA_SOURCE_REMOTE =
    'https://raw.githubusercontent.com/gramaziokohler/antikythera/main/src/antikythera/models/blueprint.v1.schema.json';

if (!fs.existsSync(SCHEMA_DIR)) {
    fs.mkdirSync(SCHEMA_DIR, { recursive: true });
}

const downloadUrl = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const options = { headers: { 'User-Agent': 'Node.js' } };
        if (process.env.GITHUB_TOKEN) {
            options.headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
        }
        https
            .get(url, options, (response) => {
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
            })
            .on('error', (err) => {
                fs.unlink(destPath, () => { });
                reject(err);
            });
    });
};

async function fetchSchema() {
    console.log('Fetching blueprint.v1.schema.json...');
    try {
        console.log(`Attempting download from ${SCHEMA_SOURCE_REMOTE}...`);
        await downloadUrl(SCHEMA_SOURCE_REMOTE, SCHEMA_DEST);
        return;
    } catch (e) {
        console.warn(`Remote download failed: ${e.message}`);
        console.log('Falling back to local copy...');
    }

    if (fs.existsSync(SCHEMA_SOURCE_LOCAL)) {
        fs.copyFileSync(SCHEMA_SOURCE_LOCAL, SCHEMA_DEST);
        console.log(`Copied from ${SCHEMA_SOURCE_LOCAL}`);
    } else if (fs.existsSync(SCHEMA_DEST)) {
        console.warn('Could not refresh schema; using committed copy already present.');
    } else {
        console.error('Error: Could not fetch blueprint schema from remote or local source.');
        console.error(`Local path checked: ${SCHEMA_SOURCE_LOCAL}`);
        process.exit(1);
    }
}

async function generateTypes() {
    console.log('Generating TypeScript types from schema...');
    const schema = JSON.parse(fs.readFileSync(SCHEMA_DEST, 'utf8'));

    // The following tweaks are applied to the in-memory schema only — the
    // vendored blueprint.v1.schema.json on disk stays byte-identical to the
    // backend so it remains a faithful mirror of the contract.

    // Name the root interface `Blueprint`. The schema's title
    // ("Antikythera Blueprint") would otherwise generate `AntikytheraBlueprint`,
    // which collides with the compas-serialized wire type in src/types.ts.
    schema.title = 'Blueprint';

    // A TaskIO `value` is any JSON scalar or object (e.g. a numeric `duration`).
    // The schema leaves it untyped; without a hint json-schema-to-typescript
    // renders it as an index-signature object, which rejects scalar values.
    if (schema.definitions?.TaskIO?.properties?.value) {
        schema.definitions.TaskIO.properties.value.tsType = 'unknown';
    }

    const ts = await compile(schema, 'Blueprint', {
        additionalProperties: false,
        bannerComment: `/* eslint-disable */
/**
 * This file was automatically generated from blueprint.v1.schema.json.
 * DO NOT EDIT IT BY HAND. Instead, edit the schema on the backend and run
 * \`npm run schema:update\`. The JSON Schema is the single source of truth for
 * the blueprint data model.
 */`,
        style: { singleQuote: true, semi: true },
    });

    fs.writeFileSync(TYPES_DEST, ts);
    console.log(`Wrote ${path.relative(process.cwd(), TYPES_DEST)}`);
}

async function main() {
    await fetchSchema();
    await generateTypes();
    console.log('Blueprint schema + types updated successfully.');
}

main().catch((e) => {
    console.error('Error updating blueprint schema:', e);
    process.exit(1);
});
