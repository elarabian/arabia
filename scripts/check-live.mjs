import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createTikTokHandler } from '../api/tiktok.js';

const originalFlag = process.env.VITE_TIKTOK_ENABLED;
process.env.VITE_TIKTOK_ENABLED = 'true';
const events = [];
let connection;
class MockConnection extends EventEmitter {
  constructor(username, options) {
    super();
    assert.equal(username, 'naturreiki');
    assert.equal(options.processInitialData, false);
    connection = this;
  }
  async connect() { return { roomId: '123' }; }
  async disconnect() {}
}
class MockResponse extends EventEmitter {
  statusCode = 200;
  setHeader() {}
  write(value) { events.push(value); }
  end() { this.emit('close'); }
}
const handler = createTikTokHandler(async () => ({
  TikTokLiveConnection: MockConnection,
  WebcastEvent: { MEMBER: 'member', LIKE: 'like', CHAT: 'chat', GIFT: 'gift' },
  ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
}));
const response = new MockResponse();
await handler({ method: 'GET', url: '/api/tiktok?username=%40naturreiki' }, response);
connection.emit('member', { user: { userId: '42', nickname: 'Natur Reiki' } });
connection.emit('like', { count: 4, user: { id: '43', displayId: 'nexus__m34' } });
connection.emit('like', { count: 15 });
connection.emit('like', { likeCount: 4 });
connection.emit('member', { uniqueId: 'beyzagust' });
connection.emit('chat', { uniqueId: 'beyzagust', comment: 'lütfen naturreiki kişisini kırbaçla' });
connection.emit('gift', { uniqueId: 'beyzagust', giftType: 1, repeatEnd: false, repeatCount: 2 });
connection.emit('gift', { uniqueId: 'beyzagust', giftType: 1, repeatEnd: true, repeatCount: 2 });
assert.ok(events.some(value => value.includes('event: viewer') && value.includes('Natur Reiki')));
assert.ok(events.some(value => value.includes('event: viewer') && value.includes('nexus__m34')),
  'a liker whose join was missed also becomes a viewer zombie');
assert.deepEqual(events.filter(value => value.includes('event: like')).map(value =>
  JSON.parse(value.split('data: ')[1]).count), [4, 15, 4]);
assert.equal(events.filter(value => value.includes('event: chat')).length, 1,
  'legacy flat chat payloads reach the game');
assert.equal(events.filter(value => value.includes('event: gift')).length, 1,
  'a gift streak triggers one action after the final event');
response.emit('close');

const root = new URL('../', import.meta.url).pathname;
const dir = await mkdtemp(join(tmpdir(), 'kirbac-live-'));
try {
  await build({
    stdin: { contents: "export { GameEngine } from './src/game/gameEngine'; export { soundEngine } from './src/game/audio'; export { parseLiveAction } from './src/live/commands';", resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: join(dir, 'game.mjs'),
    define: { 'import.meta.env': '{"VITE_TIKTOK_ENABLED":"true"}' },
    plugins: [{ name: 'assets', setup(b) {
      b.onResolve({ filter: /dialogueAssets$/ }, () => ({ path: 'dialogues', namespace: 'mock' }));
      b.onResolve({ filter: /mp3\?url$/ }, () => ({ path: 'audio', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({
        contents: args.path === 'dialogues' ? 'export const dialogueAssets = {}' : 'export default "audio.mp3"',
      }));
    } }],
  });
  const { GameEngine, soundEngine, parseLiveAction } = await import(pathToFileURL(join(dir, 'game.mjs')).href);
  const viewers = [{ id: '42', name: 'Natur Reiki', handle: 'naturreiki' },
    { id: '43', name: 'Beyzagust', handle: 'beyzagust34' }];
  assert.deepEqual(parseLiveAction('Lütfen kırbaç Natur Reiki, hadi!', '43', viewers),
    { kind: 'whip', targetId: '42' });
  assert.deepEqual(parseLiveAction('Şu Beyzagust kişisini CEHENNEME gönder', '42', viewers),
    { kind: 'hell', targetId: '43' });
  assert.deepEqual(parseLiveAction('biraz @beyzagust34 kırbaçla', '42', viewers),
    { kind: 'whip', targetId: '43' });
  assert.deepEqual(parseLiveAction('beni göm lütfen', '42', viewers),
    { kind: 'burial', targetId: '42' });
  assert.deepEqual(parseLiveAction('şimdi bombayı patlat!', '42', viewers),
    { kind: 'bomb' });
  const game = new GameEngine();
  game.restartGame();
  assert.equal(game.zombies.zombies.length, 0, 'live mode starts without demo zombies');
  assert.equal(game.addLiveViewer('42', 'Natur Reiki'), true);
  assert.equal(game.addLiveViewer('42', 'Natur Reiki'), false);
  assert.equal(game.addLiveViewer('43', 'Beyzagust'), true);
  assert.deepEqual(game.zombies.zombies.map(z => z.viewerName), ['Natur Reiki', 'Beyzagust']);
  game.addLiveLikes(4);
  game.addLiveLikes(15);
  game.addLiveLikes(4);
  assert.equal(game.liveLikes, 23);
  assert.equal(game.isRapidWhipActive, true);
  game.setRapidWhipSpeed(.2);
  assert.ok(game.effectiveRapidWhipSpeed<1 && game.effectiveRapidWhipSpeed>.2,
    'the user speed setting still controls rapid whipping during a like boost');
  game.setRapidWhipSpeed(1);
  game.update(1 / 60);
  assert.ok(soundEngine.attack && soundEngine.attack.duration < .36,
    'likes trigger faster automatic whipping');
  game.restartGame();
  assert.deepEqual(game.zombies.zombies.map(z => z.viewerName), ['Natur Reiki', 'Beyzagust']);
  game.setBurialScene(true);
  for (let frame = 0; frame < 60 * 60 && game.burialScene.buriedCount === 0; frame++) {
    game.update(1 / 60);
  }
  assert.equal(game.burialScene.buriedCount, 1);
  const graveText = [];
  const graveCanvas = new Proxy({}, { get: (_, key) => key === 'fillText'
    ? value => graveText.push(value) : () => {} });
  game.burialScene.drawGround(graveCanvas);
  assert.ok(graveText.includes('RIP') && graveText.includes('Natur Reiki'),
    'grave marker shows RIP and the buried viewer name');
  game.clearLiveViewers();
  assert.equal(game.zombies.zombies.length, 0, 'changing broadcaster clears the old audience');
  const commandGame = new GameEngine();commandGame.restartGame();
  commandGame.addLiveViewer('42','Natur Reiki');commandGame.addLiveViewer('43','Beyzagust');
  commandGame.receiveLiveChat('42','Natur Reiki','Beyzagust kişisini cehenneme at!');
  commandGame.update(1/60);
  assert.equal(commandGame.hellSceneEnabled,true,'chat switches to the requested hell scene');
  assert.equal(commandGame.burialScene.target?.viewerId,'43','named viewer is the actual captive');
  assert.equal(commandGame.currentChat?.text,'Beyzagust kişisini cehenneme at!',
    'the incoming message is displayed above the hero');
  const liveChatText=[];
  const chatCanvas=new Proxy({}, {get:(_,key)=>key==='fillText'
    ? value=>liveChatText.push(value):()=>{}});
  commandGame.drawLiveChat(chatCanvas);
  assert.ok(liveChatText.includes('Natur Reiki') && liveChatText.some(text=>text.includes('Beyzagust')),
    'the sender and message are drawn in a bubble above the hero');
  commandGame.receiveLiveChat('42','Natur Reiki','Beyzagust kişisini cehenneme at!');
  assert.equal(commandGame.liveTaskQueue.length,0,'the active target command is not queued twice');
  const rescued=commandGame.zombies.zombies.find(z=>z.viewerId==='42');
  commandGame.setBurialScene(true);
  rescued.buried=true;
  commandGame.burialScene.mounds.push({x:100,y:100,viewerId:'42',name:'Natur Reiki'});
  commandGame.receiveLiveGift('42','Natur Reiki');
  assert.equal(rescued.buried,false,'a gift releases its sender from a grave');
  assert.equal(commandGame.burialScene.mounds.length,0,'the released grave marker is removed');
  assert.ok(['whip','hell'].includes(commandGame.liveTaskQueue.at(-1)?.kind),
    'a gift schedules a different random scene for its sender');
  const bombGame=new GameEngine();bombGame.restartGame();
  bombGame.addLiveViewer('42','Natur Reiki');
  bombGame.receiveLiveChat('42','Natur Reiki','hadi şu bombayı patlat');
  bombGame.update(1/60);
  assert.equal(bombGame.bombSceneEnabled,true,'a sentence containing bomb starts the bomb scene');
  const queuedGame=new GameEngine();queuedGame.restartGame();
  queuedGame.addLiveViewer('42','Natur Reiki');queuedGame.addLiveViewer('43','Beyzagust');
  queuedGame.receiveLiveChat('42','Natur Reiki','Natur Reiki kişisini göm');
  queuedGame.receiveLiveChat('43','Beyzagust','Beyzagust cehenneme gitsin');
  queuedGame.update(1/60);
  assert.equal(queuedGame.burialScene.target?.viewerId,'42');
  for(let frame=0;frame<60*38&&!queuedGame.hellSceneEnabled;frame++)queuedGame.update(1/60);
  assert.equal(queuedGame.hellSceneEnabled,true,'the next viewer task starts after the first burial');
  assert.equal(queuedGame.burialScene.target?.viewerId,'43',
    'the queued task catches the named second viewer');
  console.log('PASS TikTok JOIN/LIKE/CHAT/GIFT events, named targets, queued scenes, rescue, RIP stones and whip boost.');
} finally {
  await rm(dir, { recursive: true, force: true });
  if (originalFlag === undefined) delete process.env.VITE_TIKTOK_ENABLED;
  else process.env.VITE_TIKTOK_ENABLED = originalFlag;
}
