import test from 'node:test';
import assert from 'node:assert';
import { isTestTokenAllowed } from '../server';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
test('test harness security', async()=>{ assert.ok(typeof isTestTokenAllowed==='function'); });
