#!/usr/bin/env node
import fs from 'node:fs/promises';
import { validateAdventureContent } from '../js/adventure_content_core.js';
const data=await Promise.all(['chapter','combat','assets'].map(async n=>JSON.parse(await fs.readFile(new URL(`../data/adventure/${n}.json`,import.meta.url)))));
console.log('Chapter references validated:',validateAdventureContent(...data));
