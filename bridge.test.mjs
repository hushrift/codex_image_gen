import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { validate, status, collectArtifacts } from './bridge.mjs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('collects only this session images when Codex sandbox cannot copy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'image-bridge-'));
  try {
    const id = '01a143d7-dea1-7852-98a5-ac0574d5b8b5';
    const job = path.join(root, 'job');
    const generated = path.join(root, 'generated');
    await mkdir(job);
    await mkdir(path.join(generated, id), { recursive: true });
    await writeFile(path.join(job, 'events.jsonl'), JSON.stringify({ type: 'thread.started', thread_id: id }) + '\n');
    await writeFile(path.join(generated, id, 'cat.png'), Buffer.from('test-image'));
    await writeFile(path.join(generated, 'unrelated.png'), Buffer.from('unrelated'));
    assert.deepEqual(await collectArtifacts(job, generated), [path.join(job, 'generated-cat.png')]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects invalid prompts, reference paths and traversal job ids', async () => {
  assert.throws(() => validate({ prompt: '' }));
  assert.throws(() => validate({ prompt: 'cat', references: ['relative.png'] }));
  assert.doesNotThrow(() => validate({ prompt: '一只猫' }));
  await assert.rejects(status('../request.json'));
});
test('MCP handshake, discovery, and tool errors stay valid JSON-RPC', async () => {
  const child = spawn(process.execPath, ['bridge.mjs', 'mcp'], { cwd: import.meta.dirname });
  let output = '';
  child.stdout.on('data', b => { output += b; });
  const closed = new Promise(resolve => child.on('close', resolve));
  for (const message of [
    { id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } },
    { method: 'notifications/initialized' },
    { id: 2, method: 'tools/list' },
    { id: 3, method: 'tools/call', params: { name: 'generate_image', arguments: { prompt: '' } } },
    { id: 4, method: 'unknown' }
  ]) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  child.stdin.end();
  assert.equal(await closed, 0);
  const rows = output.trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].result.serverInfo.name, 'codex-image-bridge');
  assert.equal(rows[1].result.tools.length, 2);
  assert.equal(rows[2].result.isError, true);
  assert.equal(rows[3].error.code, -32601);
});
