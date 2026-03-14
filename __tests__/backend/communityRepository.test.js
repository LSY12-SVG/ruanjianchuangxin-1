const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createCommunityDb} = require('../../backend/src/community/db');
const {runCommunityMigrations} = require('../../backend/src/community/migrations');
const {createCommunityRepository} = require('../../backend/src/community/repository');

const postPayload = title => ({
  title,
  content: `${title}-content`,
  beforeUrl: '',
  afterUrl: '',
  tags: [],
  gradingParams: {},
});

describe('community repository identity compatibility', () => {
  let dbPath;
  let db;
  let repo;

  beforeEach(async () => {
    dbPath = path.join(
      os.tmpdir(),
      `visiongenie-community-${Date.now()}-${Math.round(Math.random() * 100000)}.sqlite`,
    );
    db = createCommunityDb({
      databaseClient: 'sqlite',
      sqlitePath: dbPath,
    });
    await runCommunityMigrations(db);
    repo = createCommunityRepository(db);
  });

  afterEach(async () => {
    if (db?.close) {
      await db.close();
    }
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, {force: true});
    }
  });

  test('stores draft author_id from JWT sub string', async () => {
    const created = await repo.createDraft('42', postPayload('jwt-post'));
    expect(created).not.toBeNull();

    const rows = await db.query('SELECT author_id FROM community_posts WHERE id = ? LIMIT 1', [
      Number(created.id),
    ]);
    expect(rows[0].author_id).toBe('42');
  });

  test('counts published posts from user id and legacy username together', async () => {
    const legacyDraft = await repo.createDraft('legacy_alice', postPayload('legacy'));
    await repo.publishDraft('legacy_alice', legacyDraft.id);

    const idDraft = await repo.createDraft('7', postPayload('new-id'));
    await repo.publishDraft('7', idDraft.id);

    const total = await repo.countPublishedByAuthorIdentity({
      userId: '7',
      username: 'legacy_alice',
    });
    expect(total).toBe(2);
  });
});
