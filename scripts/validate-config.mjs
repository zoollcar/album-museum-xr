import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateMuseumConfig } from '../src/config/validate.js';

const configPath = resolve(process.argv[2] || 'public/museum.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const result = validateMuseumConfig(config);
if (!result.valid) {
  console.error(`配置校验失败：${configPath}`);
  result.errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`配置有效：${configPath}`);
}
