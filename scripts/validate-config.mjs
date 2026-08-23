import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateMuseumConfig } from '../src/config/validate.js';

const configPath = resolve(process.argv[2] || 'public/museums/project-showcase.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const result = validateMuseumConfig(config);
if (!result.valid) {
  console.error(`Configuration validation failed: ${configPath}`);
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Configuration is valid: ${configPath}`);
}
