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
    assert.equal(options.processInitialData, true);
    assert.equal(options.fetchRoomInfoOnConnect, false);
    connection = this;
  }
  async connect(roomId) { assert.equal(roomId, undefined); return { roomId: '123456' }; }
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
assert.ok(events.some(value => value.includes('event: ready') && value.includes('123456')),
  'the browser receives a room ID for reconnecting without a new room lookup');
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

const priorRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
const priorRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const priorFetch = globalThis.fetch;
const relayRecords = new Map();
try {
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  globalThis.fetch = async (_url, options) => {
    const [command, key, value, ...rest] = JSON.parse(options.body);
    if (command === 'SET') relayRecords.set(key, value);
    const result = command === 'GET' ? relayRecords.get(key) ?? null
      : command === 'MGET' ? [key, value, ...rest].map(item => relayRecords.get(item) ?? null) : 'OK';
    return { ok: true, json: async () => ({ result }) };
  };
  const relayResponse = new MockResponse();
  await createTikTokHandler(async () => ({
    TikTokLiveConnection: MockConnection,
    WebcastEvent: { MEMBER: 'member', LIKE: 'like', CHAT: 'chat', GIFT: 'gift' },
    ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
  }))({ method: 'GET', url: '/api/tiktok?username=naturreiki&relay=1' }, relayResponse);
  connection.emit('member', { uniqueId: 'beyzagust' });
  connection.emit('chat', { uniqueId: 'beyzagust', comment: 'kırbaçla' });
  connection.emit('like', { uniqueId: 'beyzagust', count: 120 });
  await new Promise(resolve => setTimeout(resolve, 20));
  const relay = JSON.parse(relayRecords.get('arabia:control:v1:audience'));
  assert.equal(relay.audience.status, 'connected');
  assert.equal(relay.audience.viewers[0].name, 'beyzagust');
  assert.equal(relay.audience.viewers[0].likes, 120);
  assert.equal(relay.audience.events[0].kind, 'chat');
  const { default: controlHandler } = await import('../api/control.js?relay-check=1');
  const controlResponse = { statusCode: 0, setHeader() {}, end(value) { this.body = value; } };
  await controlHandler({ method: 'GET', url: '/api/control?audience=1' }, controlResponse);
  assert.equal(controlResponse.statusCode, 200);
  assert.equal(JSON.parse(controlResponse.body).audience.events[0].chat.text, 'kırbaçla');
  relayResponse.emit('close');
  const reopenedEvents = [];
  class ReopenedResponse extends MockResponse {
    write(value) { reopenedEvents.push(value); }
  }
  const reopenedResponse = new ReopenedResponse();
  await createTikTokHandler(async () => ({
    TikTokLiveConnection: MockConnection,
    WebcastEvent: { MEMBER: 'member', LIKE: 'like', CHAT: 'chat', GIFT: 'gift' },
    ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
  }))({ method: 'GET', url: '/api/tiktok?username=naturreiki&relay=1' }, reopenedResponse);
  assert.ok(reopenedEvents.some(value => value.includes('event: viewer') && value.includes('beyzagust')),
    'a second game browser receives viewers who joined before it opened');
  assert.ok(reopenedEvents.some(value => value.includes('event: viewer') && value.includes('"likes":120')),
    'the second browser restores supporter status as well as the viewer name');
  reopenedResponse.emit('close');
  await new Promise(resolve => setTimeout(resolve, 20));
} finally {
  globalThis.fetch = priorFetch;
  if (priorRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = priorRedisUrl;
  if (priorRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = priorRedisToken;
}

class CachedConnection extends MockConnection {
  async connect(roomId) { assert.equal(roomId, '123456'); return { roomId }; }
}
const cachedResponse = new MockResponse();
await createTikTokHandler(async () => ({
  TikTokLiveConnection: CachedConnection,
  WebcastEvent: { MEMBER: 'member', LIKE: 'like', CHAT: 'chat', GIFT: 'gift' },
  ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
}))({ method: 'GET', url: '/api/tiktok?username=naturreiki&roomId=123456' }, cachedResponse);
cachedResponse.emit('close');

const rateEvents = [];
class RateLimitedConnection extends EventEmitter {
  async connect() {
    this.emit('error', { info: 'Error while connecting', exception: new Error('[Rate Limited] Too many connections') });
    throw new Error('[Rate Limited] Too many connections');
  }
  async disconnect() {}
}
class RateResponse extends MockResponse {
  write(value) { rateEvents.push(value); }
}
await createTikTokHandler(async () => ({
  TikTokLiveConnection: RateLimitedConnection,
  WebcastEvent: { MEMBER: 'member', LIKE: 'like', CHAT: 'chat', GIFT: 'gift' },
  ControlEvent: { DISCONNECTED: 'disconnected', ERROR: 'error' },
}))({ method: 'GET', url: '/api/tiktok?username=naturreiki' }, new RateResponse());
assert.ok(rateEvents.some(value => value.includes('event: rate_limited')),
  'rate limits are reported separately so the browser can pause retries');

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
  game.update(2);
  soundEngine.stopWhip();
  game.addLiveLikes(4);
  game.addLiveLikes(15);
  game.addLiveLikes(4);
  assert.equal(game.liveLikes, 23);
  game.addViewerLikes('42', 60);
  assert.equal(game.zombies.zombies[0].likes, 60);
  game.zombies.zombies[0].lastWhippedAt = soundEngine.audioTime;
  assert.equal(game.nextWhipTarget()?.viewerId, '43',
    'a frequent liker rests while the other dancer remains an eligible target');
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
  game.addViewerLikes('42', 40);
  assert.equal(game.zombies.zombies[0].favorite, true);
  assert.equal(game.nextWhipTarget()?.viewerId, '43',
    'a favorite is never selected for an automatic strike');
  game.restartGame();
  assert.equal(game.zombies.zombies[0].favorite, true, 'favorite status survives a scene restart');
  game.clearLiveViewers();
  assert.equal(game.zombies.zombies.length, 0, 'changing broadcaster clears the old audience');
  const crowdGame = new GameEngine();crowdGame.restartGame();
  crowdGame.addLiveViewer('a','Yeni Gelen');
  assert.equal(crowdGame.zombies.zombies[0].crowdMotion?.kind,'enter');
  crowdGame.update(2);
  assert.equal(crowdGame.zombies.zombies[0].crowdMotion,undefined,
    'a new viewer reaches the dance ring after the entrance');
  crowdGame.addLiveViewer('b','İkinci Gelen');
  assert.equal(crowdGame.zombies.zombies[0].crowdMotion?.kind,'reflow',
    'the existing viewer moves aside for a newcomer');
  crowdGame.removeLiveViewer('b');
  assert.equal(crowdGame.zombies.zombies.find(z=>z.viewerId==='b')?.crowdMotion?.kind,'exit');
  crowdGame.update(2);
  assert.equal(crowdGame.zombies.zombies.some(z=>z.viewerId==='b'),false,
    'an inactive viewer walks out before removal');
  crowdGame.setTasbihMode(true);
  crowdGame.update(1/60);
  assert.equal(crowdGame.tasbihMode,true);
  assert.equal(soundEngine.attack,null,'tasbih mode stops whipping');
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
  rescued.formation=undefined;
  const outside=commandGame.zombies.zombies.find(z=>z.viewerId==='43');
  outside.formation.angle=-Math.PI/2;
  outside.x=commandGame.playerX;
  commandGame.burialScene.mounds.push({x:100,y:100,viewerId:'42',name:'Natur Reiki'});
  commandGame.receiveLiveGift('42','Natur Reiki');
  assert.equal(rescued.buried,false,'a gift releases its sender from a grave');
  assert.ok(Math.abs(Math.cos(rescued.formation.angle-outside.formation.angle)+1)<.001,
    'a rescued zombie takes the opposite ring position from the outside zombie');
  assert.equal(commandGame.burialScene.mounds.length,0,'the released grave marker is removed');
  assert.equal(rescued.favorite,true,'a gift makes its sender a protected favorite');
  assert.equal(commandGame.liveTaskQueue.length,0,'the favorite is not queued for another attack');
  const bombGame=new GameEngine();bombGame.restartGame();
  bombGame.addLiveViewer('42','Natur Reiki');
  bombGame.receiveLiveChat('42','Natur Reiki','hadi şu bombayı patlat');
  bombGame.update(1/60);
  assert.equal(bombGame.bombSceneEnabled,true,'a sentence containing bomb starts the bomb scene');
  const playBombExplosion = soundEngine.playBombExplosion;
  const playHeroCelebration = soundEngine.playHeroCelebration;
  soundEngine.playBombExplosion = () => {};
  soundEngine.playHeroCelebration = () => {};
  try {
    for (let frame = 0; frame < 60 * 8; frame++) bombGame.update(1/60);
  } finally {
    soundEngine.playBombExplosion = playBombExplosion;
    soundEngine.playHeroCelebration = playHeroCelebration;
  }
  assert.equal(bombGame.zombies.zombies[0].blastSleep, false,
    'a bombed viewer wakes up instead of remaining a hidden sleeping shape');
  assert.ok(bombGame.zombies.zombies[0].formation,
    'a bombed viewer returns to the visible dance ring');
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
