# Community Mock Files

Generated mock files for local community debugging.

## Files
- `community-mock.json`: structured mock data with posts, before/after images, style suggestions and comments.
- `community-mock.seed.sql`: SQL seed script for `backend/data/community.sqlite`.
- `images/*.svg`: local before/after placeholder images.

## Import seed data
```bash
sqlite3 backend/data/community.sqlite ".read backend/data/mock-community/community-mock.seed.sql"
```

## Notes
- Image paths use relative `images/...` for local development.
- You can switch to remote URLs later when connecting real CDN/object storage.
